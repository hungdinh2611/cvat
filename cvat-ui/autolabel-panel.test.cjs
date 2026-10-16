const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, 'autolabel-panel.js');

class Element {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.attributes = {};
        this.style = {};
        this.dataset = {};
        this.classList = { add() {}, remove() {} };
        this.files = [];
        this.value = '';
        this.textContent = '';
        this.parentElement = null;
    }
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, callback) { this[`on${name}`] = callback; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); }
    contains(node) { return this === node || this.children.some(child => child.contains?.(node)); }
    querySelector(selector) {
        const matches = node => selector === 'section' ? node.tagName === 'SECTION' :
            selector === 'h2' ? node.tagName === 'H2' : selector === '.autolabel-content' ? node.className === 'autolabel-content' :
            selector === '.autolabel-close' ? node.className === 'autolabel-close' : false;
        for (const child of this.children) { if (matches(child)) return child; const found = child.querySelector?.(selector); if (found) return found; }
        return null;
    }
    find(predicate) { if (predicate(this)) return this; for (const child of this.children) { const found = child.find?.(predicate); if (found) return found; } return null; }
}

function makeHarness(responder) {
    const elements = [];
    const storage = new Map();
    const document = {
        cookie: 'sessionid=session; csrftoken=csrf%2Btoken',
        head: new Element('head'), body: new Element('body'),
        createElement(tag) { const el = new Element(tag); elements.push(el); return el; },
        createTextNode(text) { const el = new Element('#text'); el.textContent = text; return el; },
        createElementNS(_ns, tag) { return new Element(tag); },
        querySelector(selector) { return selector === '.cvat-annotation-header-left-group' ? null : null; },
        querySelectorAll() { return []; }, addEventListener() {}, getElementById() { return null; },
    };
    const calls = [];
    const context = {
        document, window: { addEventListener() {}, setInterval() {} },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        location: { pathname: '/tasks/10/jobs/20', href: 'http://cvat/tasks/10/jobs/20', reload() {} },
        history: { state: null, replaceState() {} }, URL, URLSearchParams, FormData, setTimeout,
        MutationObserver: class { observe() {} disconnect() {} }, Event: class {}, KeyboardEvent: class {},
        fetch: async (url, options = {}) => { calls.push({ url, options }); return responder(url, options, calls); },
        console,
    };
    let code = fs.readFileSync(sourcePath, 'utf8');
    const marker = '    mountButton();\n    const current = location.pathname.match';
    assert.ok(code.includes(marker), 'panel bootstrap marker exists');
    code = code.replace(marker, `    window.__autolabelTest = { initializeWorkflow, refreshVm, uploadVm, render, renderVm, getState: () => ({ get panel(){return panel;}, set panel(v){panel=v;}, get cvatJobId(){return cvatJobId;}, set cvatJobId(v){cvatJobId=v;}, get job(){return job;}, set job(v){job=v;}, get vmCapabilities(){return vmCapabilities;}, set vmCapabilities(v){vmCapabilities=v;}, get vmNewVideo(){return vmNewVideo;}, set vmNewVideo(v){vmNewVideo=v;}, get sequenceClasses(){return sequenceClasses;}, set sequenceClasses(v){sequenceClasses=v;}, get vmVideo(){return vmVideo;}, set vmVideo(v){vmVideo=v;}, get vmVariant(){return vmVariant;}, set vmVariant(v){vmVariant=v;}, get vmPipeline(){return vmPipeline;}, set vmPipeline(v){vmPipeline=v;} }) };\n    mountButton();\n    const current = location.pathname.match`);
    vm.runInNewContext(code, context, { filename: sourcePath });
    return { api: context.window.__autolabelTest, calls, storage, elements, document };
}

function makePanel(document) {
    const backdrop = new Element('div'); backdrop.className = 'autolabel-backdrop';
    const section = document.createElement('section'); section.className = 'autolabel-panel';
    section.setAttribute('role', 'dialog');
    section.setAttribute('aria-modal', 'true');
    const close = document.createElement('button'); close.className = 'autolabel-close';
    section.appendChild(close);
    section.appendChild(document.createElement('h2'));
    const content = document.createElement('div'); content.className = 'autolabel-content';
    section.appendChild(content); backdrop.appendChild(section);
    return backdrop;
}

test('VM upload sends video and options as multipart with the CVAT CSRF header', async () => {
    let multipart;
    const h = makeHarness(async (url, options) => {
        if (url.endsWith('/vm/jobs') && options.method === 'POST') {
            multipart = options.body;
            return { ok: true, json: async () => ({ job_id: 'vm-1', status: 'queued' }) };
        }
        throw new Error(`unexpected request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.vmCapabilities = { enabled: true };
    state.sequenceClasses = 'car, person'; state.vmVideo = new Blob(['video-bytes'], { type: 'video/mp4' });
    await h.api.uploadVm();
    assert.equal(h.calls[0].url, '/autolabel/api/v1/vm/jobs');
    assert.equal(h.calls[0].options.credentials, 'include');
    assert.equal(h.calls[0].options.headers['X-CSRFToken'], 'csrf+token');
    assert.ok(multipart instanceof FormData);
    const options = JSON.parse(multipart.get('options'));
    assert.deepEqual(options, { classes: ['car', 'person'], variant: 'sam3.1', pipeline: 'sam', vlm_enabled: false });
    assert.equal(multipart.get('video').size, 11);
    assert.equal(h.storage.get('autolabel-vm-job-20'), 'vm-1');
});

test('enabled VM capability selects VM discovery and does not invoke legacy import', async () => {
    const h = makeHarness(async (url) => {
        if (url.endsWith('/vm/capabilities')) return { ok: true, json: async () => ({ enabled: true, pipelines: ['sam'] }) };
        if (url.endsWith('/vm/cvat-jobs/20')) return { ok: true, json: async () => ({ job: null }) };
        throw new Error(`unexpected legacy or unsupported request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.panel = makePanel(h.document);
    await h.api.initializeWorkflow();
    assert.deepEqual(h.calls.map(call => call.url), ['/autolabel/api/v1/vm/capabilities', '/autolabel/api/v1/vm/cvat-jobs/20']);
    assert.equal(h.calls.some(call => call.url.endsWith('/import')), false);
});

test('disabled VM capability preserves the legacy panel branch', async () => {
    const h = makeHarness(async url => {
        if (url.endsWith('/vm/capabilities')) return { ok: true, json: async () => ({ enabled: false }) };
        if (url.endsWith('/cvat-jobs/20/labels')) return { ok: true, json: async () => ['car', 'person'] };
        if (url.endsWith('/cvat-jobs/20/capabilities')) return { ok: true, json: async () => ({ docked_panel: true }) };
        if (url.endsWith('/cvat-jobs/20')) return { ok: false, status: 404, json: async () => ({ detail: 'not found' }) };
        throw new Error(`unexpected request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.panel = makePanel(h.document);
    await h.api.initializeWorkflow();
    h.api.render();
    const collect = el => [el.textContent, ...el.children.map(collect)].join(' ');
    const text = collect(state.panel.querySelector('.autolabel-content'));
    assert.match(text, /Run|Chạy|AutoLabel tracks objects/);
    assert.equal(h.calls.some(call => call.url.endsWith('/vm/jobs')), false);
});

test('VM refresh retries a missing saved job through CVAT job discovery', async () => {
    const h = makeHarness(async url => {
        if (url.endsWith('/vm/jobs/gone')) return { ok: false, status: 404, json: async () => ({ detail: 'missing' }) };
        if (url.endsWith('/vm/cvat-jobs/20')) return { ok: true, json: async () => ({ job: { job_id: 'found', status: 'queued' } }) };
        throw new Error(`unexpected request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.vmCapabilities = { enabled: true }; state.panel = makePanel(h.document);
    h.storage.set('autolabel-vm-job-20', 'gone');
    await h.api.refreshVm();
    assert.deepEqual(h.calls.map(call => call.url), ['/autolabel/api/v1/vm/jobs/gone', '/autolabel/api/v1/vm/cvat-jobs/20']);
    assert.equal(state.job.job_id, 'found');
    assert.equal(h.storage.get('autolabel-vm-job-20'), 'found');
});

test('running VM jobs refresh their saved job status', async () => {
    const h = makeHarness(async url => {
        if (url.endsWith('/vm/jobs/vm-running')) return { ok: true, json: async () => ({ job_id: 'vm-running', status: 'propagating', processed_frames: 7 }) };
        throw new Error(`unexpected request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.vmCapabilities = { enabled: true }; state.panel = makePanel(h.document);
    state.job = { job_id: 'vm-running', status: 'queued' };
    await h.api.refreshVm();
    assert.equal(state.job.status, 'propagating');
    assert.equal(state.job.processed_frames, 7);
});

test('Process another video suppresses automatic rediscovery until upload', async () => {
    const h = makeHarness(async url => {
        if (url.includes('/vm/')) throw new Error(`should not rediscover after reset: ${url}`);
        throw new Error(`unexpected request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.vmCapabilities = { enabled: true }; state.panel = makePanel(h.document);
    state.vmNewVideo = true;
    await h.api.refreshVm();
    assert.equal(state.job, null);
    assert.deepEqual(h.calls, []);
});

test('a non-404 capability error is surfaced without switching to legacy endpoints', async () => {
    const h = makeHarness(async url => {
        if (url.endsWith('/vm/capabilities')) return { ok: false, status: 503, json: async () => ({ detail: 'VM service unavailable' }) };
        throw new Error(`unexpected fallback request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.panel = makePanel(h.document);
    await h.api.initializeWorkflow();
    assert.equal(state.vmCapabilities, null);
    assert.equal(h.calls.length, 1);
    assert.match(state.panel.querySelector('.autolabel-content').children[0].textContent, /VM service unavailable/);
});

test('missing VM capabilities endpoint falls back to the legacy workflow', async () => {
    const h = makeHarness(async (url) => {
        if (url.endsWith('/vm/capabilities')) return { ok: false, status: 404, json: async () => ({ detail: 'not found' }) };
        if (url.endsWith('/cvat-jobs/20/labels')) return { ok: true, json: async () => ['car'] };
        if (url.endsWith('/cvat-jobs/20/capabilities')) return { ok: true, json: async () => ({ docked_panel: true }) };
        if (url.endsWith('/cvat-jobs/20')) return { ok: false, status: 404, json: async () => ({ detail: 'no job' }) };
        throw new Error(`unexpected request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.panel = makePanel(h.document);
    await h.api.initializeWorkflow();
    assert.equal(h.calls[0].url, '/autolabel/api/v1/vm/capabilities');
    assert.ok(h.calls.some(call => call.url.endsWith('/cvat-jobs/20/labels')));
    assert.equal(state.vmCapabilities.enabled, false);
});

test('Cancel and Retry buttons call the authenticated VM mutation endpoints', async () => {
    const h = makeHarness(async (url, options) => {
        if (url.endsWith('/vm/jobs/cancel-me/cancel') && options.method === 'POST') {
            return { ok: true, json: async () => ({ job_id: 'cancel-me', status: 'cancelled' }) };
        }
        if (url.endsWith('/vm/jobs/retry-me/retry') && options.method === 'POST') {
            return { ok: true, json: async () => ({ job_id: 'retry-me', status: 'queued' }) };
        }
        if (url.endsWith('/vm/jobs/cancel-me') || url.endsWith('/vm/jobs/retry-me')) {
            const id = url.endsWith('/cancel-me') ? 'cancel-me' : 'retry-me';
            return { ok: true, json: async () => ({ job_id: id, status: id === 'cancel-me' ? 'cancelled' : 'queued' }) };
        }
        throw new Error(`unexpected request ${url}`);
    });
    const state = h.api.getState(); state.cvatJobId = 20; state.vmCapabilities = { enabled: true }; state.panel = makePanel(h.document);
    const content = new Element('div');
    state.job = { job_id: 'cancel-me', status: 'propagating' };
    h.api.renderVm(content);
    const cancel = content.find(node => node.tagName === 'BUTTON' && node.textContent.includes('Hủy'));
    assert.ok(cancel, 'cancel action is rendered for an active job');
    cancel.onclick();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const cancelRequest = h.calls.find(call => call.url.endsWith('/cancel'));
    assert.ok(cancelRequest);
    assert.equal(cancelRequest.options.headers['X-CSRFToken'], 'csrf+token');

    state.job = { job_id: 'retry-me', status: 'failed' };
    const retryContent = new Element('div');
    h.api.renderVm(retryContent);
    const retry = retryContent.find(node => node.tagName === 'BUTTON' && node.textContent.includes('Thử lại'));
    assert.ok(retry, 'retry action is rendered for a failed job');
    retry.onclick();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const retryRequest = h.calls.find(call => call.url.endsWith('/retry'));
    assert.ok(retryRequest);
    assert.equal(retryRequest.options.headers['X-CSRFToken'], 'csrf+token');
});


test('VM workflow retains the floating dialog without changing the annotation layout', async () => {
    const h = makeHarness(async url => {
        if (url.endsWith('/vm/capabilities')) return { ok: true, json: async () => ({ enabled: true, pipelines: ['sam'] }) };
        if (url.endsWith('/vm/cvat-jobs/20')) return { ok: true, json: async () => ({ job: null }) };
        throw new Error(`unexpected request ${url}`);
    });
    const page = new Element('div');
    const layoutClasses = new Set();
    page.classList = { add: name => layoutClasses.add(name), remove: name => layoutClasses.delete(name) };
    h.document.querySelector = selector => selector === '.cvat-annotation-page' ? page : null;
    const state = h.api.getState(); state.cvatJobId = 20; state.panel = makePanel(h.document);
    h.document.body.appendChild(state.panel);
    await h.api.initializeWorkflow();
    assert.equal(state.panel.parentElement, h.document.body);
    assert.equal(state.panel.className, 'autolabel-backdrop');
    assert.equal(state.panel.querySelector('section').attributes.role, 'dialog');
    assert.equal(state.panel.querySelector('section').attributes['aria-modal'], 'true');
    assert.equal(layoutClasses.has('autolabel-docked'), false);
    assert.ok(state.panel.find(node => node.tagName === 'INPUT' && node.type === 'file'));
    assert.equal(state.panel.find(node => node.tagName === 'BUTTON' && node.textContent.includes('Thu gọn')), null);
});

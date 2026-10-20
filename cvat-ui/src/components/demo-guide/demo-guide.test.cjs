// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');
const loadModule = Module._load;
Module._load = function loadWithoutNativeCanvas(request, parent, isMain) {
    if (request === 'canvas') return {};
    return loadModule.call(this, request, parent, isMain);
};
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../../../..');
const guidePath = path.join(__dirname, 'demo-guide.tsx');
const sessionPath = path.join(root, 'cvat-ui/src/utils/demo-guide-session.ts');

require.extensions['.tsx'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            jsx: ts.JsxEmit.React,
            esModuleInterop: true,
        },
    }).outputText;
    module._compile(compiled, filename);
};
require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    module._compile(compiled, filename);
};

function setup({ username = 'test_demo', dirty = false, sessionSeen = false, initialRoute = '/tasks', steps = null } = {}) {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
        url: 'http://localhost/tasks',
    });
    const priorGlobals = {};
    for (const name of ['window', 'document', 'navigator', 'sessionStorage', 'localStorage', 'getComputedStyle', 'HTMLElement', 'Element', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent']) {
        priorGlobals[name] = global[name];
        global[name] = name === 'window' ? dom.window : dom.window[name];
    }
    global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    global.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(dom.window.HTMLElement.prototype, 'getClientRects', {
        configurable: true,
        value() { return this.isConnected && this.style.display !== 'none' ? [{ width: 20, height: 20 }] : []; },
    });

    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const { act } = require('react-dom/test-utils');
    const oldLoad = Module._load;
    const oldCompile = Module._extensions['.tsx'];
    let usernameNow = username;
    let route = initialRoute;
    let dirtyNow = dirty;
    let rerender = null;
    let pushed = [];
    const apiState = { auth: { user: usernameNow ? { id: 4, username: usernameNow } : null }, annotation: { job: { instance: { annotations: { hasUnsavedChanges: () => dirtyNow } } } } };
    const fragment = (tag, className) => function Component(props) {
        const { children, className: ownClass, ...rest } = props;
        return React.createElement(tag, { ...rest, className: [className, ownClass].filter(Boolean).join(' ') }, children);
    };
    const AntdButton = fragment('button', 'antd-button');
    const Antd = {
        Alert: ({ message }) => React.createElement('div', { className: 'ant-alert' }, message),
        Button: AntdButton, Card: fragment('div', 'ant-card'),
        Modal: ({ open, className, children, footer, title, onCancel }) => open ? React.createElement('div', { className: `ant-modal ${className || ''}` },
            React.createElement('div', null, title), children, footer,
            React.createElement('button', { onClick: onCancel }, 'Cancel')) : null,
        Space: fragment('div', 'ant-space'), Spin: fragment('div', 'ant-spin'),
        Tour: ({ open, current, onChange, onFinish, steps }) => open ? React.createElement('div', { className: 'ant-tour' },
            React.createElement('div', null, steps[current]?.title),
            React.createElement('button', { onClick: () => onChange(current + 1) }, 'Next'),
            React.createElement('button', { onClick: onFinish }, 'Finish')) : null,
        Typography: {
            Paragraph: fragment('p', 'ant-typography'),
            Text: fragment('span', 'ant-typography'),
            Title: fragment('h3', 'ant-typography'),
        },
    };
    const icon = () => React.createElement('span');
    const aliases = {
        'react-redux': {
            useSelector: (selector) => selector(apiState),
            useStore: () => ({ getState: () => apiState }),
        },
        'react-router': {
            useHistory: () => ({ push: (next) => { pushed.push(next); route = next; rerender?.(); } }),
            useLocation: () => ({ pathname: route, search: '' }),
        },
        'antd/lib/alert': { __esModule: true, default: Antd.Alert }, 'antd/lib/button': { __esModule: true, default: Antd.Button },
        'antd/lib/card': { __esModule: true, default: Antd.Card }, 'antd/lib/modal': { __esModule: true, default: Antd.Modal },
        'antd/lib/space': { __esModule: true, default: Antd.Space }, 'antd/lib/spin': { __esModule: true, default: Antd.Spin },
        'antd/lib/tour': { __esModule: true, default: Antd.Tour }, 'antd/lib/typography': { __esModule: true, default: Antd.Typography },
        '@ant-design/icons': { __esModule: true, CompassOutlined: icon, ArrowRightOutlined: icon },
    };
    Module._load = function load(request, parent, isMain) {
        if (request.endsWith('.scss')) return {};
        if (aliases[request]) return aliases[request];
        if (request === 'utils/demo-guide-session') return oldLoad.call(this, sessionPath, parent, isMain);
        if (request === './journeys' && parent?.filename === guidePath) return {
            __esModule: true,
            default: {
                view2d: steps || [
                    { route: '/tasks', title: 'Demo target step', description: 'Tour step' },
                    { route: '/tasks', title: 'Demo next step', description: 'Second step' },
                ],
                view3d: [], create2d: [], create3d: [],
            },
        };
        if (request === './types' && parent?.filename === guidePath) return oldLoad.call(this, path.join(__dirname, 'types.ts'), parent, isMain);
        return oldLoad.call(this, request, parent, isMain);
    };
    if (sessionSeen) dom.window.sessionStorage.setItem('cvat-demo-guide-seen', '1');
    delete require.cache[guidePath];
    delete require.cache[sessionPath];
    const { default: Provider, DemoGuideButton } = require(guidePath);
    const rootElement = dom.window.document.getElementById('root');
    const reactRoot = createRoot(rootElement);
    const render = async () => act(async () => {
        reactRoot.render(React.createElement(Provider, null,
            React.createElement(React.Fragment, null,
                React.createElement(DemoGuideButton),
                React.createElement('button', { id: 'outside' }, 'Outside'),
                React.createElement('form', { id: 'outside-form' }, React.createElement('button', { type: 'submit' }, 'Submit')),
                React.createElement('div', { className: 'cvat-canvas-container', id: 'canvas' }),
            )));
    });
    rerender = render;
    const cleanup = async () => {
        await act(async () => reactRoot.unmount());
        Module._load = oldLoad;
        if (oldCompile) Module._extensions['.tsx'] = oldCompile;
        dom.window.close();
        for (const [name, value] of Object.entries(priorGlobals)) {
            if (typeof value === 'undefined') delete global[name];
            else global[name] = value;
        }
        delete global.IS_REACT_ACT_ENVIRONMENT;
    };
    return {
        dom, rootElement, render, cleanup,
        act,
        setUser(value) { usernameNow = value; apiState.auth.user = value ? { id: 4, username: value } : null; },
        setDirty(value) { dirtyNow = value; },
        setJob(id) { apiState.annotation.job.instance.id = id; },
        route: () => route,
        pushed: () => pushed,
    };
}

test('shows the chooser only for test_demo and marks the first prompt as seen', async () => {
    const demo = setup();
    try {
        await demo.render();
        assert.match(demo.rootElement.textContent, /Discover AI-X AutoLabel/);
        assert.equal(demo.dom.window.sessionStorage.getItem('cvat-demo-guide-seen'), '1');
    } finally { await demo.cleanup(); }

    const regular = setup({ username: 'annotator' });
    try {
        await regular.render();
        assert.equal(regular.rootElement.querySelector('.cvat-demo-guide-button'), null);
        assert.equal(regular.rootElement.querySelector('.cvat-demo-guide-dialog'), null);
    } finally { await regular.cleanup(); }
});

test('session helper resets the seen marker for a fresh login', () => {
    const session = require(sessionPath);
    session.markDemoGuideSeen();
    assert.equal(session.demoGuideSeen(), true);
    session.resetDemoGuideSession();
    assert.equal(session.demoGuideSeen(), false);
});

test('starts a tour and the guide guard isolates interaction', async () => {
    const app = setup({ sessionSeen: true });
    try {
        await app.render();
        await app.act(async () => { app.rootElement.querySelector('.cvat-demo-guide-button').click(); });
        const start = Array.from(app.rootElement.querySelectorAll('button')).find((button) => button.textContent.includes('Start tour'));
        assert.ok(start);
        await app.act(async () => { start.click(); });
        assert.deepEqual(app.pushed(), []);
        assert.ok(app.rootElement.querySelector('.ant-tour'), app.rootElement.textContent);

        assert.ok(app.rootElement.querySelector('.cvat-canvas-container'));

        let clicks = 0;
        let shortcuts = 0;
        let submits = 0;
        const outside = app.dom.window.document.getElementById('outside');
        outside.addEventListener('click', () => { clicks += 1; });
        app.dom.window.addEventListener('keydown', () => { shortcuts += 1; });
        app.dom.window.document.getElementById('outside-form').addEventListener('submit', (event) => { event.preventDefault(); submits += 1; });
        outside.click();
        app.dom.window.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'x' }));
        app.dom.window.document.getElementById('outside-form').dispatchEvent(new app.dom.window.Event('submit', { bubbles: true, cancelable: true }));
        assert.deepEqual([clicks, shortcuts, submits], [0, 0, 0]);

        const next = Array.from(app.rootElement.querySelectorAll('.ant-tour button')).find((button) => button.textContent === 'Next');
        next.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, key: 's', ctrlKey: true,
        }));
        assert.equal(shortcuts, 0, 'guide-focused shortcuts must not reach canvas listeners');
        await app.act(async () => { next.click(); });
        await app.render();
        assert.match(app.rootElement.querySelector('.ant-tour')?.textContent || '', /Demo next step/);

        const finish = Array.from(app.rootElement.querySelectorAll('.ant-tour button')).find((button) => button.textContent === 'Finish');
        await app.act(async () => { finish.click(); });
        assert.equal(app.rootElement.querySelector('.ant-tour'), null);
    } finally { await app.cleanup(); }
});


test('waits for both the requested job and a visible target after navigation', async () => {
    const app = setup({ steps: [{ route: '/tasks/23/jobs/19', target: '.tour-ready-marker', title: 'Ready' }] });
    try {
        await app.render();
        const start = app.rootElement.querySelector('button[aria-label="Explore 2D results"]');
        await app.act(async () => start.click());
        assert.equal(app.route(), '/tasks/23/jobs/19');
        assert.equal(Boolean(app.rootElement.querySelector('.ant-tour')), false);
        const marker = app.dom.window.document.createElement('div');
        marker.className = 'tour-ready-marker';
        marker.style.display = 'none';
        app.dom.window.document.body.append(marker);
        app.setJob(19);
        await app.act(async () => new Promise((resolve) => setTimeout(resolve, 180)));
        assert.equal(Boolean(app.rootElement.querySelector('.ant-tour')), false, 'hidden targets are not ready');
        marker.style.display = 'block';
        await app.act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
        assert.ok(app.rootElement.querySelector('.ant-tour'));
    } finally { await app.cleanup(); }
});

test('does not leave unsaved annotations when starting a journey', async () => {
    const app = setup({ dirty: true, steps: [{ route: '/tasks/create', title: 'Create' }] });
    try {
        await app.render();
        const start = app.rootElement.querySelector('button[aria-label="Explore 2D results"]');
        await app.act(async () => start.click());
        assert.deepEqual(app.pushed(), []);
        assert.match(app.rootElement.textContent, /Save or undo/);
    } finally { await app.cleanup(); }
});


test('keeps the highlight closed until an animated target stops moving', async () => {
    const app = setup({ steps: [{ route: '/tasks', target: '.moving-target', title: 'Moving panel' }] });
    try {
        const marker = app.dom.window.document.createElement('div');
        marker.className = 'moving-target';
        let left = 300;
        marker.getBoundingClientRect = () => ({ x: left, y: 10, width: 200, height: 120 });
        app.dom.window.document.body.append(marker);
        await app.render();
        await app.act(async () => app.rootElement.querySelector('button[aria-label="Explore 2D results"]').click());
        await app.act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
        left = 200;
        await app.act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
        left = 100;
        await app.act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
        assert.equal(Boolean(app.rootElement.querySelector('.ant-tour')), false, 'do not measure a sliding drawer early');
        await app.act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
        assert.ok(app.rootElement.querySelector('.ant-tour'));
    } finally { await app.cleanup(); }
});


test('unmounts the previous annotation editor before switching demo jobs', async () => {
    const app = setup({ initialRoute: '/tasks/23/jobs/19', steps: [{ route: '/tasks/22/jobs/18', title: '3D' }] });
    try {
        await app.render();
        await app.act(async () => app.rootElement.querySelector('button[aria-label="Explore 2D results"]').click());
        assert.deepEqual(app.pushed(), ['/tasks']);
        await app.act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
        assert.deepEqual(app.pushed(), ['/tasks', '/tasks/22/jobs/18']);
    } finally { await app.cleanup(); }
});

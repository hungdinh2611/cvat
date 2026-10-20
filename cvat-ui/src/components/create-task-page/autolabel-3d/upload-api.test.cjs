// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            esModuleInterop: true,
        },
    }).outputText;
    module._compile(compiled, filename);
};

const { uploadDataset, uploadOptionsError } = require('./upload-api.ts');

function fileWithSize(size, name = 'sample.zip') {
    const file = new Blob([Buffer.alloc(size)]);
    Object.defineProperty(file, 'name', { value: name });
    return file;
}

function options(file, overrides = {}) {
    return {
        filename: file.name,
        size: file.size,
        dataset_format: 'nuscenes',
        mode: 'detect',
        scene: '',
        max_frames: 200,
        ...overrides,
    };
}

test('creates a session, uploads all chunks, then completes it', async () => {
    const file = fileWithSize(10);
    const calls = [];
    const api = {
        async start(body) {
            calls.push(['start', body]);
            return { job_id: 'job/one', status: 'uploading', uploaded_bytes: 0, chunk_bytes: 4 };
        },
        async chunk(id, offset, body) {
            calls.push(['chunk', id, offset, body.size]);
            return { job_id: id, uploaded_bytes: offset + body.size };
        },
        async status() { throw new Error('unexpected status lookup'); },
        async complete(id) {
            calls.push(['complete', id]);
            return { job_id: id, status: 'queued' };
        },
    };
    const progress = [];
    const result = await uploadDataset(file, options(file), null, new AbortController().signal, (value) => progress.push(value.uploadedBytes), api);

    assert.deepEqual(calls.map((call) => call[0]), ['start', 'chunk', 'chunk', 'chunk', 'complete']);
    assert.deepEqual(calls.filter((call) => call[0] === 'chunk').map((call) => [call[2], call[3]]), [[0, 4], [4, 4], [8, 2]]);
    assert.deepEqual(progress, [0, 4, 8, 10]);
    assert.equal(result.session.uploadedBytes, 10);
    assert.equal(result.job.status, 'queued');
});

test('recovers a chunk accepted by the server when its response is lost', async () => {
    const file = fileWithSize(8);
    const attemptedOffsets = [];
    let serverOffset = 0;
    const api = {
        async start() { return { job_id: 'job-lost', status: 'uploading', uploaded_bytes: 0, chunk_bytes: 4 }; },
        async chunk(id, offset, body) {
            attemptedOffsets.push(offset);
            serverOffset = offset + body.size;
            if (offset === 0) throw new Error('connection dropped after write');
            return { job_id: id, uploaded_bytes: serverOffset };
        },
        async status(id) { return { job_id: id, uploaded_bytes: serverOffset, status: 'uploading' }; },
        async complete(id) { return { job_id: id, status: 'queued' }; },
    };
    const result = await uploadDataset(file, options(file), null, new AbortController().signal, undefined, api);

    assert.deepEqual(attemptedOffsets, [0, 4]);
    assert.equal(result.session.uploadedBytes, 8);
});

test('caps chunk retries at three and retains the created session for retry', async () => {
    const file = fileWithSize(4);
    let attempts = 0;
    const retained = [];
    const api = {
        async start() { return { job_id: 'job-retry', status: 'uploading', uploaded_bytes: 0, chunk_bytes: 4 }; },
        async chunk() { attempts += 1; throw new Error('offline'); },
        async status(id) { return { job_id: id, status: 'uploading', uploaded_bytes: 0 }; },
        async complete() { throw new Error('should not complete'); },
    };

    await assert.rejects(
        uploadDataset(file, options(file), null, new AbortController().signal, (session) => retained.push(session), api),
        /offline/,
    );
    assert.equal(attempts, 3);
    assert.equal(retained[0].jobID, 'job-retry');
});

test('propagates abort during transfer and does not complete the job', async () => {
    const file = fileWithSize(4);
    const controller = new AbortController();
    let completed = false;
    let wasAborted = false;
    const api = {
        async start() { return { job_id: 'job-abort', status: 'uploading', uploaded_bytes: 0, chunk_bytes: 4 }; },
        chunk(id, offset, body, signal) {
            return new Promise((resolve, reject) => {
                const onAbort = () => {
                    wasAborted = signal.aborted;
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                signal.addEventListener('abort', onAbort, { once: true });
                setImmediate(() => controller.abort()); // mirrors the form cleanup aborting its active controller
            });
        },
        async status() { throw new Error('status should not be requested after abort'); },
        async complete() { completed = true; throw new Error('should not complete'); },
    };

    await assert.rejects(uploadDataset(file, options(file), null, controller.signal, undefined, api), /Aborted/);
    assert.equal(wasAborted, true);
    assert.equal(completed, false);
});

test('rejects invalid KITTI detection options before creating an upload', async () => {
    const file = fileWithSize(4);
    let started = false;
    const api = { async start() { started = true; }, async chunk() {}, async status() {}, async complete() {} };
    const invalidOptions = options(file, { dataset_format: 'kitti', mode: 'detect' });

    assert.match(uploadOptionsError(invalidOptions), /KITTI supports annotation import/);
    await assert.rejects(uploadDataset(file, invalidOptions, null, new AbortController().signal, undefined, api), /KITTI supports annotation import/);
    assert.equal(started, false);
});

test('requires the server-provided chunk size instead of guessing one', async () => {
    const file = fileWithSize(4);
    let chunkCalls = 0;
    const api = {
        async start() { return { job_id: 'job-no-chunk-size', status: 'uploading', uploaded_bytes: 0 }; },
        async chunk() { chunkCalls += 1; },
        async status() {},
        async complete() {},
    };

    await assert.rejects(
        uploadDataset(file, options(file), null, new AbortController().signal, undefined, api),
        /server did not provide a valid dataset chunk size/,
    );
    assert.equal(chunkCalls, 0);
});

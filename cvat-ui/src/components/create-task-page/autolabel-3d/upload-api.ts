// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

export const AUTOLABEL_API = '/autolabel/api/v1';

export type DatasetFormat = 'nuscenes' | 'kitti';
export type DatasetMode = 'detect' | 'import';

export interface UploadOptions {
    filename: string;
    size: number;
    dataset_format: DatasetFormat;
    mode: DatasetMode;
    scene: string;
    max_frames: number;
}

export interface UploadJob {
    job_id: string;
    status: string;
    stage?: string;
    uploaded_bytes?: number;
    chunk_bytes?: number;
    cvat_task_id?: number | null;
    cvat_job_id?: number | null;
    error?: string | null;
}

export interface UploadSession {
    jobID: string;
    file: File;
    uploadedBytes: number;
    chunkBytes: number;
    options: UploadOptions;
}

export interface UploadClient {
    start(options: UploadOptions, signal: AbortSignal): Promise<UploadJob>;
    chunk(jobID: string, offset: number, chunk: Blob, signal: AbortSignal): Promise<UploadJob>;
    status(jobID: string, signal: AbortSignal): Promise<UploadJob>;
    complete(jobID: string, signal: AbortSignal): Promise<UploadJob>;
}

export function uploadOptionsError(options: UploadOptions): string | null {
    const isBasename = options.filename === options.filename.split(/[\\/]/).pop();
    if (!options.filename || options.filename.length > 180 || !isBasename) {
        return 'Choose a valid dataset archive filename.';
    }
    if (!/\.(zip|tar\.gz|tgz)$/i.test(options.filename)) return 'Choose a ZIP, TAR.GZ, or TGZ archive.';
    if (!Number.isSafeInteger(options.size) || options.size <= 0) return 'The dataset archive must not be empty.';
    if (options.dataset_format === 'kitti' && options.mode === 'detect') {
        return 'KITTI supports annotation import. Choose nuScenes to run 3D detection.';
    }
    if (!/^[a-zA-Z0-9_-]{0,40}$/.test(options.scene)) return 'Scene must use up to 40 letters, numbers, underscores, or hyphens.';
    if (!Number.isInteger(options.max_frames) || options.max_frames < 1 || options.max_frames > 200) {
        return 'Choose a maximum frame count between 1 and 200.';
    }
    return null;
}

function csrfToken(): string {
    const cookie = document.cookie.split('; ').find((part) => part.startsWith('csrftoken='));
    return cookie ? decodeURIComponent(cookie.slice('csrftoken='.length)) : '';
}

async function request<T>(path: string, method: string, signal: AbortSignal, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'X-CSRFToken': csrfToken() };
    let payload: BodyInit | undefined;
    if (body instanceof Blob) payload = body;
    else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const response = await fetch(`${AUTOLABEL_API}${path}`, {
        method,
        credentials: 'same-origin',
        headers,
        body: payload,
        signal,
    });
    if (!response.ok) {
        let detail = `AutoLabel HTTP ${response.status}`;
        try {
            const result = await response.json();
            if (typeof result.detail === 'string') detail = result.detail;
        } catch {
            // Keep the status as the message.
        }
        throw new Error(detail);
    }
    return response.json();
}

export const uploadApi = {
    start: (options: UploadOptions, signal: AbortSignal) => request<UploadJob>('/vm/3d/uploads', 'POST', signal, options),
    chunk: (jobID: string, offset: number, chunk: Blob, signal: AbortSignal) => request<UploadJob>(
        `/vm/3d/uploads/${encodeURIComponent(jobID)}?offset=${offset}`, 'PUT', signal, chunk,
    ),
    status: (jobID: string, signal: AbortSignal) => request<UploadJob>(
        `/vm/jobs/${encodeURIComponent(jobID)}`, 'GET', signal,
    ),
    complete: (jobID: string, signal: AbortSignal) => request<UploadJob>(
        `/vm/3d/uploads/${encodeURIComponent(jobID)}/complete`, 'POST', signal,
    ),
};

export async function uploadDataset(
    file: File,
    options: UploadOptions,
    existingSession: UploadSession | null,
    signal: AbortSignal,
    onSession: (session: UploadSession) => void = () => undefined,
    api: UploadClient = uploadApi,
): Promise<{ session: UploadSession; job: UploadJob }> {
    const validationError = uploadOptionsError(options);
    if (validationError) throw new Error(validationError);

    let session = existingSession;
    if (!session) {
        const created = await api.start(options, signal);
        session = {
            jobID: created.job_id,
            file,
            uploadedBytes: created.uploaded_bytes || 0,
            chunkBytes: created.chunk_bytes || 0,
            options,
        };
        onSession(session);
    } else {
        const latest = await api.status(session.jobID, signal);
        session = {
            ...session,
            uploadedBytes: latest.uploaded_bytes || 0,
            chunkBytes: latest.chunk_bytes || session.chunkBytes,
            file,
            options,
        };
        onSession(session);
    }

    if (!Number.isSafeInteger(session.chunkBytes) || session.chunkBytes <= 0) {
        throw new Error('The server did not provide a valid dataset chunk size.');
    }
    let offset = session.uploadedBytes;
    if (offset < 0 || offset > file.size) throw new Error('The server reported an invalid upload offset.');
    while (offset < file.size) {
        const chunk = file.slice(offset, Math.min(offset + session.chunkBytes, file.size));
        let uploaded: UploadJob | null = null;
        let lastError: unknown;
        for (let attempt = 0; attempt < 3 && !uploaded; attempt += 1) {
            try {
                uploaded = await api.chunk(session.jobID, offset, chunk, signal);
            } catch (chunkError) {
                if (signal.aborted) throw chunkError;
                lastError = chunkError;
                try {
                    const latest = await api.status(session.jobID, signal);
                    const serverOffset = latest.uploaded_bytes || 0;
                    if (serverOffset > file.size) throw new Error('The server reported an invalid upload offset.');
                    if (serverOffset > offset) {
                        uploaded = latest;
                    }
                } catch (statusError) {
                    if (signal.aborted) throw statusError;
                    if (statusError instanceof Error && statusError.message === 'The server reported an invalid upload offset.') {
                        throw statusError;
                    }
                }
            }
        }
        if (!uploaded) throw lastError || new Error('The dataset chunk could not be uploaded.');
        const nextOffset = uploaded.uploaded_bytes ?? Math.min(offset + chunk.size, file.size);
        if (nextOffset <= offset || nextOffset > file.size) throw new Error('The server reported an invalid upload offset.');
        offset = nextOffset;
        session = { ...session, uploadedBytes: offset };
        onSession(session);
    }
    const job = await api.complete(session.jobID, signal);
    return { session, job };
}

// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

// Client for the AutoLabel VM API. The browser authenticates with its CVAT session;
// no service credential is ever handled here.

export const AUTOLABEL_API = '/autolabel/api/v1';

export type VmJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string;
export type VmPipeline = 'sam' | 'hybrid_frame' | 'hybrid_propagate' | string;

export interface VmCapabilities {
    enabled: boolean;
    pipelines?: VmPipeline[];
    hybrid_variant?: string;
    cache_max_bytes?: number;
}

export interface VmJob {
    job_id: string;
    status: VmJobStatus;
    stage: string;
    classes: string[];
    variant: string;
    pipeline: VmPipeline;
    total_frames: number;
    privacy_frames?: number;
    delivered_frames?: number;
    processed_frames?: number;
    complete_frames?: number;
    published_frames?: number;
    cvat_job_id?: number | null;
    cvat_task_id?: number | null;
    error?: string | null;
    completed_windows?: number;
    class_coverage?: Record<string, number>;
    cache_bytes?: number;
    cap_warning?: boolean;
    mask_absence_count?: number;
    publication_version?: number;
    frame_states?: number[];
    vlm_status?: string;
    // Set when the run was started from the video already stored in this CVAT job.
    origin_cvat_job_id?: number | null;
}

export interface ReviewTrack {
    track_id: string;
    class: string;
    frame: number;
    state: ReviewState;
    reason: string;
}

export type ReviewState = 'unseen' | 'seen' | 'resolved';

export interface ReviewPage {
    tracks: ReviewTrack[];
    total: number;
    page: number;
}

export type ProposalStatus = 'pending' | 'accepting' | 'accepted' | 'rejected';

export interface VlmProposal {
    label: string;
    bbox: [number, number, number, number];
    reason: string;
    status: ProposalStatus;
    confidence?: 'low' | 'medium' | 'high';
    occlusion?: string;
    box_extent?: 'amodal_estimate' | 'visible';
}

export interface VlmResult {
    result_id: string;
    source_frame: number;
    width: number;
    height: number;
    model: string;
    reason: string;
    preview: string;
    proposals: VlmProposal[];
    cache_hit?: boolean;
}

export interface RefineResult {
    found: boolean;
    // Normalized xyxy on the source frame, or null when the VLM saw no matching object.
    bbox: [number, number, number, number] | null;
    reason: string;
    source_frame: number;
    model: string;
    cache_hit: boolean;
}

export interface VlmSettings {
    model: string;
    endpoint: string;
    key_configured: boolean;
}

export interface PrivacyRegion {
    start: number;
    end: number;
    box: [number, number, number, number];
}

export interface PrivacyTrack {
    track_id: string;
    keyframes: { frame: number; box: [number, number, number, number] }[];
}

export interface RunOptions {
    classes: string[];
    variant: string;
    pipeline: VmPipeline;
    vlm_enabled: boolean;
}

export const TERMINAL_STATUSES = new Set<VmJobStatus>(['completed', 'failed', 'cancelled']);

export class AutoLabelError extends Error {
    public readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

function csrfToken(): string {
    const cookie = document.cookie.split('; ').find((part) => part.startsWith('csrftoken='));
    return cookie ? decodeURIComponent(cookie.slice('csrftoken='.length)) : '';
}

async function errorFrom(response: Response): Promise<AutoLabelError> {
    let detail = `AutoLabel HTTP ${response.status}`;
    try {
        const payload = await response.json();
        // Cloudflare answers for the origin while the AutoLabel service restarts; that is not an app error.
        if (payload.cloudflare_error) detail = 'The AutoLabel server is temporarily unreachable. Retry in a minute.';
        else if (typeof payload.detail === 'string') detail = payload.detail;
    } catch {
        // Keep the HTTP status as the message.
    }
    return new AutoLabelError(detail, response.status);
}

export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'X-CSRFToken': csrfToken() };
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) payload = JSON.stringify(body);
    const response = await fetch(`${AUTOLABEL_API}${path}`, {
        method, credentials: 'same-origin', headers, body: payload,
    });
    if (!response.ok) throw await errorFrom(response);
    return response.json();
}

// fetch() cannot report upload progress, so large videos go through XHR.
export function uploadVideo(
    video: File, options: RunOptions, onProgress: (percent: number) => void,
): Promise<VmJob> {
    const data = new FormData();
    data.append('video', video);
    data.append('options', JSON.stringify(options));
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${AUTOLABEL_API}/vm/jobs`);
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-CSRFToken', csrfToken());
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
            let parsed: any = null;
            try { parsed = JSON.parse(xhr.responseText); } catch { /* handled below */ }
            if (xhr.status >= 200 && xhr.status < 300 && parsed) resolve(parsed);
            else {
                const detail = typeof parsed?.detail === 'string' ? parsed.detail : `AutoLabel HTTP ${xhr.status}`;
                reject(new AutoLabelError(detail, xhr.status));
            }
        };
        xhr.onerror = () => reject(new AutoLabelError('Network error while uploading the video', 0));
        xhr.send(data);
    });
}

export const vmApi = {
    capabilities: () => request<VmCapabilities>('/vm/capabilities'),
    job: (jobID: string) => request<VmJob>(`/vm/jobs/${encodeURIComponent(jobID)}/processing`),
    findByCvatJob: (cvatJobID: number) => request<{ job: VmJob | null }>(`/vm/cvat-jobs/${cvatJobID}`),
    // The server reads the video CVAT already stores for this job, so nothing is uploaded again.
    startFromCvatJob: (cvatJobID: number, options: RunOptions) => request<VmJob>(
        `/vm/cvat-jobs/${cvatJobID}/runs`, 'POST', options,
    ),
    cancel: (jobID: string) => request<VmJob>(`/vm/jobs/${encodeURIComponent(jobID)}/cancel`, 'POST'),
    retry: (jobID: string) => request<VmJob>(`/vm/jobs/${encodeURIComponent(jobID)}/retry`, 'POST'),
    videoURL: (jobID: string) => `${AUTOLABEL_API}/vm/jobs/${encodeURIComponent(jobID)}/video`,
    privacyRegions: (jobID: string, regions: PrivacyRegion[], tracks: PrivacyTrack[]) => request<VmJob>(
        `/vm/jobs/${encodeURIComponent(jobID)}/privacy-regions`, 'POST', { regions, tracks },
    ),
    review: (jobID: string, page: number, className: string, viewed: string) => request<ReviewPage>(
        `/vm/jobs/${encodeURIComponent(jobID)}/review?page=${page}` +
        `&class_name=${encodeURIComponent(className)}&viewed=${encodeURIComponent(viewed)}`,
    ),
    setReviewState: (jobID: string, trackID: string, state: ReviewState) => request<unknown>(
        `/vm/jobs/${encodeURIComponent(jobID)}/review/state`, 'POST', { track_id: trackID, state },
    ),
    askVlm: (jobID: string, frame: number) => request<VlmResult>(
        `/vm/jobs/${encodeURIComponent(jobID)}/vlm`, 'POST', { source_frame: frame },
    ),
    vlmResults: (jobID: string) => request<{ results: VlmResult[] }>(`/vm/jobs/${encodeURIComponent(jobID)}/vlm`),
    vlmDecision: (jobID: string, resultID: string, index: number, accept: boolean) => request<VlmResult>(
        `/vm/jobs/${encodeURIComponent(jobID)}/vlm/${encodeURIComponent(resultID)}/decision`, 'POST', { index, accept },
    ),
    refineBox: (jobID: string, body: {
        source_frame: number; label: string; bbox: [number, number, number, number]; instruction: string;
    }) => request<RefineResult>(`/vm/jobs/${encodeURIComponent(jobID)}/vlm/refine`, 'POST', body),
    bindVlmProfile: (jobID: string) => request<VmJob>(`/vm/jobs/${encodeURIComponent(jobID)}/vlm/profile`, 'POST'),
    vlmSettings: () => request<VlmSettings>('/settings/vlm'),
    saveVlmSettings: (body: { base_url: string; model: string; api_key?: string }) => request<VlmSettings>(
        '/settings/vlm', 'PUT', body,
    ),
    deleteVlmKey: () => request<VlmSettings>('/settings/vlm', 'DELETE'),
    testVlmSettings: () => request<unknown>('/settings/vlm/test', 'POST'),
};

let bridgeCounter = 0;

// Talks to utils/autolabel-vm-bridge, which owns frame changes and annotation reloads.
export function bridge<T = Record<string, unknown>>(action: string, extra: object = {}): Promise<T> {
    return new Promise((resolve, reject) => {
        bridgeCounter += 1;
        const requestID = `${Date.now()}-${bridgeCounter}`;
        let timer = 0;
        const done = (event: Event): void => {
            const { detail } = event as CustomEvent;
            if (detail.requestID !== requestID) return;
            window.clearTimeout(timer);
            window.removeEventListener('autolabel:vm-reply', done);
            if (detail.ok) resolve(detail);
            else reject(new Error(detail.error));
        };
        timer = window.setTimeout(() => {
            window.removeEventListener('autolabel:vm-reply', done);
            reject(new Error('CVAT job is not ready for this action'));
        }, 6000);
        window.addEventListener('autolabel:vm-reply', done);
        window.dispatchEvent(new CustomEvent('autolabel:vm-command', { detail: { requestID, action, ...extra } }));
    });
}

export interface BridgeStatus {
    dirty: boolean;
    frame: number;
}

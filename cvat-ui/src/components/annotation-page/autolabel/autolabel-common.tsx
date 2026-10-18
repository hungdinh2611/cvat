// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useRef, useState } from 'react';
import Tag from 'antd/lib/tag';
import notification from 'antd/lib/notification';
import {
    CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, MinusCircleOutlined, StopOutlined, SyncOutlined,
} from '@ant-design/icons';

import {
    AutoLabelError, BridgeStatus, VmJobStatus, bridge,
} from './autolabel-api';
import T from './autolabel-text';

const STATUS_VIEW: Record<string, { color: string; label: string; icon: JSX.Element }> = {
    queued: { color: 'default', label: T.statusQueued, icon: <ClockCircleOutlined /> },
    running: { color: 'processing', label: T.statusRunning, icon: <SyncOutlined spin /> },
    completed: { color: 'success', label: T.statusCompleted, icon: <CheckCircleOutlined /> },
    failed: { color: 'error', label: T.statusFailed, icon: <CloseCircleOutlined /> },
    cancelled: { color: 'warning', label: T.statusCancelled, icon: <StopOutlined /> },
};

export function JobStatusTag({ status }: { status: VmJobStatus }): JSX.Element {
    const view = STATUS_VIEW[status] ?? { color: 'processing', label: status, icon: <SyncOutlined spin /> };
    return <Tag className='cvat-autolabel-status-tag' color={view.color} icon={view.icon}>{view.label}</Tag>;
}

// The VLM audit has its own lifecycle: a completed run can still have an audit running or failed.
const VLM_STATUS_VIEW: Record<string, { color: string; label: string; icon: JSX.Element }> = {
    idle: { color: 'default', label: T.vlmIdle, icon: <MinusCircleOutlined /> },
    running: { color: 'processing', label: T.vlmRunning, icon: <SyncOutlined spin /> },
    completed: { color: 'success', label: T.vlmCompleted, icon: <CheckCircleOutlined /> },
    failed: { color: 'error', label: T.vlmFailed, icon: <CloseCircleOutlined /> },
};

export function VlmStatusTag({ status }: { status: string | undefined }): JSX.Element {
    const view = VLM_STATUS_VIEW[status ?? 'idle'] ?? { color: 'default', label: status, icon: <MinusCircleOutlined /> };
    return <Tag className='cvat-autolabel-vlm-status-tag' color={view.color} icon={view.icon}>{view.label}</Tag>;
}

const STAGE_LABELS: Record<string, string> = {
    uploading: T.stageUploading,
    queued_privacy: T.stageQueuedPrivacy,
    privacy: T.stagePrivacy,
    sam_starting: T.stageStarting,
    sam_streaming: T.stageStreaming,
    awaiting_human_review: T.stageReview,
};

// Unknown stages read like "queued_privacy"; show them as plain words.
export function stageLabel(stage: string | undefined): string {
    if (!stage) return '';
    if (STAGE_LABELS[stage]) return STAGE_LABELS[stage];
    const text = stage.replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

const HTTP_TITLES: Record<number, string> = {
    401: T.http401,
    403: T.http403,
    404: T.http404,
    409: T.http409,
    413: T.http413,
    422: T.http422,
    502: T.http502,
    503: T.http502,
};

// The server detail explains which case applies (e.g. which 409); the title says what to do next.
export function reportError(failure: unknown): void {
    const status = failure instanceof AutoLabelError ? failure.status : 0;
    notification.error({
        message: HTTP_TITLES[status] ?? T.title,
        description: (failure as Error).message,
        className: 'cvat-autolabel-notification-error',
    });
}

export async function requireSavedAnnotations(): Promise<BridgeStatus> {
    const status = await bridge<BridgeStatus>('status');
    if (status.dirty) throw new Error(T.saveFirst);
    return status;
}

// Each action key runs at most once at a time, so a long upload or sync never blocks Stop.
// `isBusy()` without a key reports whether anything is running.
type RunAction = (key: string, action: () => Promise<unknown>) => Promise<void>;

export function useAction(): [(key?: string) => boolean, RunAction] {
    const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
    const active = useRef(new Set<string>());
    const run = useCallback(async (key: string, action: () => Promise<unknown>): Promise<void> => {
        if (active.current.has(key)) return;
        active.current.add(key);
        setRunning(new Set(active.current));
        try {
            await action();
        } catch (failure) {
            reportError(failure);
        } finally {
            active.current.delete(key);
            setRunning(new Set(active.current));
        }
    }, []);
    const isBusy = useCallback((key?: string): boolean => (key ? running.has(key) : running.size > 0), [running]);
    return [isBusy, run];
}

export function jumpToFrame(frame: number, trackID?: string): Promise<unknown> {
    return bridge('jump', trackID ? { frame, trackID } : { frame });
}

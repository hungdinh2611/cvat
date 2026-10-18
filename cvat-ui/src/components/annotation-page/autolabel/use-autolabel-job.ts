// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    useCallback, useEffect, useRef, useState,
} from 'react';

import {
    AutoLabelError, BridgeStatus, TERMINAL_STATUSES, VmCapabilities, VmJob, bridge, vmApi,
} from './autolabel-api';
import T from './autolabel-text';

const POLL_INTERVAL = 2000;

export type SyncState = 'idle' | 'needs-save' | 'synced';

export interface AutoLabelJobState {
    capabilities: VmCapabilities | null;
    job: VmJob | null;
    error: string | null;
    loading: boolean;
    syncState: SyncState;
    // True when the open CVAT job is the result job of the VM run.
    onResultJob: boolean;
    reload(): Promise<void>;
    replaceJob(job: VmJob | null): void;
    syncNow(): Promise<void>;
}

function storageKey(cvatJobID: number): string {
    return `autolabel-vm-job-${cvatJobID}`;
}

function readSavedJobID(cvatJobID: number): string | null {
    try { return sessionStorage.getItem(storageKey(cvatJobID)); } catch { return null; }
}

function writeSavedJobID(cvatJobID: number, jobID: string | null): void {
    try {
        if (jobID) sessionStorage.setItem(storageKey(cvatJobID), jobID);
        else sessionStorage.removeItem(storageKey(cvatJobID));
    } catch {
        // The run is still found by its CVAT job on the next visit.
    }
}

export function useAutoLabelJob(cvatJobID: number): AutoLabelJobState {
    const [capabilities, setCapabilities] = useState<VmCapabilities | null>(null);
    const [job, setJob] = useState<VmJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncState, setSyncState] = useState<SyncState>('idle');
    const sequence = useRef(0);
    const shownVersion = useRef<number | null>(null);
    const syncing = useRef(false);

    const onResultJob = !!job?.cvat_job_id && job.cvat_job_id === cvatJobID;

    const syncIfNeeded = useCallback(async (next: VmJob, force = false): Promise<void> => {
        const version = next.publication_version ?? 0;
        if (next.cvat_job_id !== cvatJobID || syncing.current) return;
        if (shownVersion.current === null) {
            // CVAT has just loaded this job's annotations; only later publications need a reload.
            shownVersion.current = version;
            return;
        }
        if (!force && version <= shownVersion.current) return;
        syncing.current = true;
        try {
            const status = await bridge<BridgeStatus>('status');
            if (status.dirty) {
                setSyncState('needs-save');
                return;
            }
            await bridge('sync');
            shownVersion.current = version;
            setSyncState('synced');
        } finally {
            syncing.current = false;
        }
    }, [cvatJobID]);

    const fetchJob = useCallback(async (current: VmJob | null): Promise<VmJob | null> => {
        const savedID = current?.job_id ?? readSavedJobID(cvatJobID);
        if (savedID) {
            try {
                return await vmApi.job(savedID);
            } catch (failure) {
                if (!(failure instanceof AutoLabelError) || failure.status !== 404) throw failure;
                writeSavedJobID(cvatJobID, null);
            }
        }
        const found = await vmApi.findByCvatJob(cvatJobID);
        return found.job ? vmApi.job(found.job.job_id) : null;
    }, [cvatJobID]);

    const reload = useCallback(async (): Promise<void> => {
        sequence.current += 1;
        const { current } = sequence;
        setLoading(true);
        try {
            const caps = capabilities ?? await vmApi.capabilities();
            if (current !== sequence.current) return;
            setCapabilities(caps);
            const next = caps.enabled ? await fetchJob(job) : null;
            if (current !== sequence.current) return;
            setJob(next);
            if (next) writeSavedJobID(cvatJobID, next.job_id);
            setError(null);
            if (next) await syncIfNeeded(next);
        } catch (failure) {
            if (current === sequence.current) setError((failure as Error).message);
        } finally {
            if (current === sequence.current) setLoading(false);
        }
    }, [capabilities, job, fetchJob, syncIfNeeded, cvatJobID]);

    const replaceJob = useCallback((next: VmJob | null): void => {
        sequence.current += 1; // Drop polling responses that started before this action.
        setJob(next);
        setSyncState('idle');
        shownVersion.current = null;
        writeSavedJobID(cvatJobID, next?.job_id ?? null);
    }, [cvatJobID]);

    const syncNow = useCallback(async (): Promise<void> => {
        if (!job) return;
        await syncIfNeeded(job, true);
    }, [job, syncIfNeeded]);

    useEffect(() => {
        reload();
        // Only the CVAT job identity decides which run is shown.
    }, [cvatJobID]);

    // A finished run can still have its VLM audit running; keep polling until that settles too.
    const active = !!job && (!TERMINAL_STATUSES.has(job.status) || job.vlm_status === 'running');
    useEffect(() => {
        if (!active || !job) return undefined;
        const { job_id: jobID } = job;
        let stopped = false;
        let polling = false;
        const timer = window.setInterval(async () => {
            if (stopped || polling || document.hidden) return;
            polling = true;
            const { current } = sequence;
            try {
                const next = await vmApi.job(jobID);
                if (stopped || current !== sequence.current) return;
                setJob(next);
                setError(null);
                await syncIfNeeded(next);
            } catch (failure) {
                if (stopped || current !== sequence.current) return;
                if (failure instanceof AutoLabelError && failure.status === 404) {
                    // Owner mismatch or a deleted run: forget it rather than polling a dead ID.
                    sequence.current += 1;
                    writeSavedJobID(cvatJobID, null);
                    setJob(null);
                    setError(T.runGone);
                } else {
                    setError((failure as Error).message);
                }
            } finally {
                polling = false;
            }
        }, POLL_INTERVAL);
        return () => {
            stopped = true;
            window.clearInterval(timer);
        };
    }, [active, job?.job_id, syncIfNeeded, cvatJobID]);

    return {
        capabilities, job, error, loading, syncState, onResultJob, reload, replaceJob, syncNow,
    };
}

// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

const KEY = 'cvat-demo-guide-seen';
let seenInMemory = false;

export function demoGuideSeen(): boolean {
    try { return seenInMemory || sessionStorage.getItem(KEY) === '1'; } catch { return seenInMemory; }
}

export function markDemoGuideSeen(): void {
    seenInMemory = true;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* Session memory still works. */ }
}

export function resetDemoGuideSession(): void {
    seenInMemory = false;
    try { sessionStorage.removeItem(KEY); } catch { /* Storage is optional. */ }
}

// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

export type Journey = 'view2d' | 'view3d' | 'create2d' | 'create3d';
export type GuidePanel = 'closed' | 'run' | 'review' | 'vlm' | 'settings' | 'ai-box';

export interface GuideStep {
    title: string;
    description: string;
    route: string;
    target?: string;
    panel?: GuidePanel;
    placement?: 'left' | 'right' | 'top' | 'bottom';
}

export const GUIDE_UI_EVENT = 'cvat:demo-guide-ui';
export const GUIDE_RESTORE_EVENT = 'cvat:demo-guide-restore';

export const JOURNEYS: { id: Journey; title: string; description: string; kind: string }[] = [
    {
        id: 'view2d',
        title: 'Explore 2D results',
        kind: 'Explore',
        description: 'Follow tracked objects and discover AutoLabel and VLM box fitting.',
    },
    {
        id: 'view3d',
        title: 'Explore 3D results',
        kind: 'Explore',
        description: 'Inspect LiDAR cuboids alongside the camera views.',
    },
    {
        id: 'create2d',
        title: 'Create a 2D task',
        kind: 'Create',
        description: 'Walk through video setup and the AutoLabel workflow, without submitting.',
    },
    {
        id: 'create3d',
        title: 'Create a 3D task',
        kind: 'Create',
        description: 'Compare standard point-cloud tasks with native-dataset AutoLabel.',
    },
];

// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import { GuideStep } from './types';

export const DEMO_2D = '/tasks/23/jobs/19';

const view2d: GuideStep[] = [
    {
        route: DEMO_2D,
        target: '.cvat-canvas-container',
        title: 'A video, already labelled by AI',
        description: 'This existing nuScenes demo contains rectangle tracks. Each track follows an object across frames. AI output is a starting point: a human still checks the labels.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-player-buttons',
        title: 'Inspect the sequence',
        placement: 'bottom',
        description: 'Play and pause, step between frames, or jump with the frame number. Check object identity and box boundaries over time. This walkthrough does not edit or play the video for you.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-objects-sidebar-sider',
        title: 'Tracks, labels and visibility',
        placement: 'left',
        description: 'The Objects sidebar lists tracks and their labels. Select an object to inspect it; visibility and lock controls help isolate crowded scenes. Edits are only kept after Save.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-autolabel-open-button',
        title: 'AutoLabel on the current job',
        placement: 'bottom',
        description: 'AutoLabel processes the video already associated with this CVAT job. The default pipeline uses YOLO detections, ByteTrack identities and SAM3 masks to derive rectangle tracks. Faces and plates are redacted before model processing.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-autolabel-drawer .ant-drawer-body',
        panel: 'run',
        title: 'Run and monitor AutoLabel',
        placement: 'left',
        description: 'Run shows the current job configuration or processing status when a run exists. Every job label is included; unsupported detector classes use the SAM fallback. Published frames can be inspected while later frames are still processing. Completed does not mean human-approved.',
    },
    {
        route: DEMO_2D,
        target: '[data-tour="autolabel-review-tab"]',
        panel: 'run',
        title: 'Review the AI output',
        placement: 'left',
        description: 'Review helps you find tracks and frames that need attention. Review and VLM tabs become available when this job has an AutoLabel run. Scores prioritize inspection; they do not certify label accuracy.',
    },
    {
        route: DEMO_2D,
        target: '[data-tour="autolabel-vlm-tab"]',
        panel: 'run',
        title: 'VLM suggestions are separate',
        placement: 'left',
        description: 'VLM suggestions propose additional boxes. Accept writes the selected proposal to CVAT; Reject dismisses it. Asking the VLM is an explicit action and may use the configured provider. The guide never sends a request.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-autolabel-vlm-settings',
        panel: 'settings',
        title: 'Choose a VLM',
        placement: 'left',
        description: 'VLM settings show the configured model and key source. Use the shared default when available or your own private provider settings. A run can retain its earlier settings until you explicitly apply changes. Do not expose a private key in a demo.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-ai-box-control',
        title: 'AI box: fit one object',
        description: 'The OpenAI icon opens AI box (VLM). It helps fit a rough rectangle to an object on the current redacted frame. It is distinct from running AutoLabel across a video.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-ai-box-popover-content',
        panel: 'ai-box',
        title: 'Label, hint, draw or refine',
        description: 'Choose Label and optionally describe the object in Hint. Draw AI box fits a rough rectangle after you release it; Refine selected box fits an existing selected rectangle. It requires an AutoLabel result job with redacted frames; otherwise this panel explains why it is unavailable. No box is drawn or sent during this guide.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-annotation-header-save-button',
        title: 'Review, undo, then save',
        placement: 'bottom',
        description: 'Inspect the fitted box before keeping it. Ctrl+Z undoes a change; Save persists annotations. AI labels still need human review. You can finish here or choose another walkthrough.',
    },
];

export default view2d;

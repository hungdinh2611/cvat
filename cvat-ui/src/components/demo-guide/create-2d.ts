// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import { GuideStep } from './types';
import { DEMO_2D } from './view-2d';

const CREATE = '/tasks/create';

const create2d: GuideStep[] = [
    {
        route: CREATE,
        target: '.cvat-create-task-content',
        title: 'Create a standard CVAT video task',
        description: 'This is the real CVAT task form. Standard CVAT tasks support both 2D videos/images and correctly structured 3D point-cloud archives. For this 2D journey, you would choose a video. We will not select a file or submit.',
    },
    {
        route: CREATE,
        target: '#name',
        title: 'Name the task',
        description: 'Choose a name that identifies the source sequence and its purpose. You can optionally assign a project and inherit its labels.',
    },
    {
        route: CREATE,
        target: '[data-tour="create-labels"]',
        title: 'Define the labels',
        description: 'Add the object classes you need, for example car and person. AutoLabel includes every label in the current job. If any requested class has no detector mapping, the run uses the SAM fallback instead of silently dropping that class.',
    },
    {
        route: CREATE,
        target: '[data-tour="create-files"]',
        title: 'Select a source video',
        description: 'In normal use, choose the video from your computer or another supported source. AutoLabel will process the video attached to the job; you do not upload it again in the AutoLabel panel. This guide does not open a file picker.',
    },
    {
        route: CREATE,
        target: '.cvat-advanced-configuration-wrapper',
        title: 'Check task configuration',
        description: 'Advanced configuration controls frame ranges, sorting and job segmentation. AutoLabel validates whether a job is suitable for the current-video workflow; not every filtered or segmented video is compatible. Keep the source sequence intact unless you have checked those constraints.',
    },
    {
        route: CREATE,
        target: '.cvat-submit-open-task-button',
        placement: 'top',
        title: 'Submit and open — in normal use',
        description: 'Submit & Open creates the task; you then open its annotation job. We stop before submission. Next opens an existing demonstration job, not a new task made from this form.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-autolabel-drawer .ant-drawer-body',
        panel: 'run',
        title: 'Next: run AutoLabel inside the job',
        placement: 'left',
        description: 'This is the existing demo job. In a new job, Run on this job’s video starts redaction and labelling. YOLO + ByteTrack + SAM3 is the default for mapped classes. Monitor processing and publication here; configuration or progress is shown according to the job’s existing run.',
    },
    {
        route: DEMO_2D,
        target: '.cvat-ai-box-control',
        title: 'Finish with human review and AI box fitting',
        description: 'Inspect the generated tracks, use AI box when available to fit an individual rectangle, and Save deliberate edits. VLM requests and review actions are explicit; finishing this guide runs nothing and leaves annotations unchanged.',
    },
];

export default create2d;

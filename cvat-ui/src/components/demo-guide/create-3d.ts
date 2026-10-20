// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import { GuideStep } from './types';
import { DEMO_3D } from './view-3d';

const STANDARD = '/tasks/create';
const AUTO = '/tasks/create?workflow=autolabel3d';

const create3d: GuideStep[] = [
    {
        route: STANDARD,
        target: '[data-tour="create-workflow"]',
        title: 'One task page, two workflows',
        description: 'CVAT already supports 3D. Standard CVAT task accepts a correctly structured point-cloud archive and opens the 3D editor. AutoLabel 3D adds native-dataset processing and creates a CVAT result task for you. Neither choice submits anything automatically.',
    },
    {
        route: STANDARD,
        target: '[data-tour="create-files"]',
        title: 'The standard 3D path',
        description: 'Use a supported PCD or Velodyne archive layout, optionally with related camera images. CVAT detects the 3D dimension from the uploaded data; there is no separate 3D checkbox. This creates a task for annotation, without automatically running BEVFusion.',
    },
    {
        route: AUTO,
        target: '[data-tour="create-3d-form"]',
        title: 'Preview the AutoLabel 3D path',
        description: 'This is the real native-dataset form, in a protected tour preview. In normal use, it uploads to P-116, runs Detect or imports existing annotations, then links you to the generated CVAT task. The guide will not upload or start a job.',
    },
    {
        route: AUTO,
        target: '[data-tour="3d-file"]',
        title: 'Prepare a native dataset archive',
        description: 'Choose ZIP, TAR.GZ or TGZ in normal use. nuScenes BEVFusion needs LiDAR, all six cameras, calibration, ego pose, metadata and referenced sweeps. A standalone MP4 or generic point-cloud ZIP is not a complete native inference dataset.',
    },
    {
        route: AUTO,
        target: '[data-tour="3d-format"]',
        title: 'Choose the dataset format',
        description: 'nuScenes and KITTI have different file layouts and coordinate conventions. Keep native calibration and frame identity. Select the format matching the archive rather than renaming files to force a match.',
    },
    {
        route: AUTO,
        target: '[data-tour="3d-mode"]',
        title: 'Detect or import',
        description: 'nuScenes Detect uses the installed BEVFusion LiDAR + camera checkpoint. Import reads existing native annotations. KITTI supports Import only here; nuScenes weights cannot be used as a KITTI detector.',
    },
    {
        route: AUTO,
        target: '[data-tour="3d-scene"]',
        title: 'Select a scene or sequence',
        description: 'Leave this blank when the archive contains a single scene, or enter its native scene/sequence identifier. For the prepared nuScenes demo, the scene is scene-0061. The guide does not modify the form.',
    },
    {
        route: AUTO,
        target: '[data-tour="3d-frames"]',
        title: 'Bound the processing run',
        description: 'The supported limit is 1–200 frames. A two-frame run is useful for a deliberate smoke test with the prepared dataset. We use existing results instead of running that test during this tour.',
    },
    {
        route: AUTO,
        target: '[data-tour="3d-submit"]',
        placement: 'top',
        title: 'Stop before upload',
        description: 'In normal use, Upload and process sends chunks, validates the archive and queues processing. Progress will show the stage and a link when the CVAT result is ready. The preview disables submission; Next opens the existing 3D demonstration.',
    },
    {
        route: DEMO_3D,
        target: '.cvat-canvas3d-perspective',
        title: 'The existing result, ready for review',
        description: 'This is task 22, not a task created during the guide. Inspect cuboids and camera context, correct errors and Save in normal use. AI output remains pending human review; processing completion is not a quality certificate.',
    },
];

export default create3d;

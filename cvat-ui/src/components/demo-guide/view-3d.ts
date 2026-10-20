// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import { GuideStep } from './types';

export const DEMO_3D = '/tasks/22/jobs/18';

const view3d: GuideStep[] = [
    {
        route: DEMO_3D,
        target: '.cvat-canvas3d-perspective',
        title: 'LiDAR and camera-based 3D results',
        description: 'This existing nuScenes demo contains BEVFusion cuboid tracks. The point cloud gives scene geometry; cuboids estimate object position, size and heading. These AI results still need human inspection.',
    },
    {
        route: DEMO_3D,
        target: '.cvat-canvas3d-perspective-arrow-directions',
        title: 'Navigate the 3D scene',
        description: 'Rotate the perspective view with these arrows. The neighbouring controls move and zoom the camera. Inspect a cuboid from several angles instead of judging only the front view.',
    },
    {
        route: DEMO_3D,
        target: '.cvat-canvas3d-topview',
        title: 'Use the orthographic views',
        description: 'Top, Side and Front isolate different axes. Together they help you adjust a cuboid’s centre, dimensions and orientation. This tour does not change the scene or annotations.',
    },
    {
        route: DEMO_3D,
        target: '.cvat-player-buttons',
        placement: 'bottom',
        title: 'Check the track through time',
        description: 'Step through frames or use the frame number to follow the same object. Check continuity, object identity and occlusion. A cuboid track links observations across frames; an individual shape does not.',
    },
    {
        route: DEMO_3D,
        target: '.cvat-context-image-wrapper',
        title: 'Compare with the camera images',
        description: 'Related images provide camera context for the current LiDAR frame. The camera selector changes the image shown in a tile. Compare visible objects with cuboids; the camera image itself is not an editable 2D annotation canvas.',
    },
    {
        route: DEMO_3D,
        target: '.cvat-context-image-wrapper',
        title: 'Understand 2D–3D camera evidence',
        description: 'Where a 2D boxes overlay is available, green camera boxes have a saved linked 3D identity and yellow boxes are unlinked. These read-only YOLO detections are additional evidence, not BEVFusion cuboids. This React viewer may show camera images without that overlay control. Editing a cuboid does not recompute saved associations.',
    },
    {
        route: DEMO_3D,
        target: '.cvat-objects-sidebar',
        placement: 'left',
        title: 'Inspect the objects and review status',
        description: 'The sidebar lists labels and cuboid tracks. Select an object and expand Details to inspect its attributes, including review_status when present. Pending AI output is not automatically approved training data.',
    },
    {
        route: DEMO_3D,
        target: '.cvat-annotation-header-save-button',
        placement: 'bottom',
        title: 'Save the human corrections',
        description: 'After a real inspection, Save keeps your cuboid edits. The backend supports Draft exports with pending objects; Training exports require review decisions. Saving geometry alone does not accept every object. No save or export is performed by the guide.',
    },
];

export default view3d;

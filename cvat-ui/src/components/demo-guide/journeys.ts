// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import { GuideStep, Journey } from './types';
import view2d from './view-2d';
import view3d from './view-3d';

const journeys: Record<Journey, GuideStep[]> = {
    view2d, view3d, create2d: [], create3d: [],
};

export default journeys;

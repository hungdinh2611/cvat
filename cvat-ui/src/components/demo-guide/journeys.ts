// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import { GuideStep, Journey } from './types';

const journeys: Record<Journey, GuideStep[]> = {
    view2d: [], view3d: [], create2d: [], create3d: [],
};

export default journeys;

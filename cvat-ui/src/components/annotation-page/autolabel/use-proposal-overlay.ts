// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface OverlayBox {
    frame: number;
    label: string;
    // Normalized [x1, y1, x2, y2] in source-image coordinates.
    bbox: [number, number, number, number];
}

// Draws a suggestion on top of the 2D canvas without creating an annotation.
// The SVG copies the background's geometry so it follows zoom and pan.
export function useProposalOverlay(box: OverlayBox | null, currentFrame: number): void {
    useEffect(() => {
        const background = document.getElementById('cvat_canvas_background') as HTMLCanvasElement | null;
        if (!box || !background?.parentElement || box.frame !== currentFrame) return undefined;

        const overlay = document.createElementNS(SVG_NS, 'svg');
        overlay.classList.add('cvat-autolabel-proposal-overlay');
        background.parentElement.appendChild(overlay);

        const draw = (): void => {
            const css = getComputedStyle(background);
            Object.assign(overlay.style, {
                left: css.left,
                top: css.top,
                width: css.width,
                height: css.height,
                transform: css.transform,
                transformOrigin: css.transformOrigin,
            });
            const { width, height } = background;
            const [x1, y1, x2, y2] = box.bbox;
            overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
            overlay.replaceChildren();
            const rect = document.createElementNS(SVG_NS, 'rect');
            Object.entries({
                x: x1 * width, y: y1 * height, width: (x2 - x1) * width, height: (y2 - y1) * height,
            }).forEach(([key, value]) => rect.setAttribute(key, String(value)));
            const text = document.createElementNS(SVG_NS, 'text');
            text.setAttribute('x', String(x1 * width));
            text.setAttribute('y', String(Math.max(18, y1 * height - 6)));
            text.textContent = box.label;
            overlay.append(rect, text);
        };

        draw();
        const observer = new MutationObserver(draw);
        observer.observe(background, { attributes: true, attributeFilter: ['style', 'width', 'height'] });
        return () => {
            observer.disconnect();
            overlay.remove();
        };
    }, [box, currentFrame]);
}

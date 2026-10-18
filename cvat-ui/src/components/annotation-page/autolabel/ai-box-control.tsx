// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { Store } from 'redux';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Input from 'antd/lib/input';
import message from 'antd/lib/message';
import Popover from 'antd/lib/popover';
import Select from 'antd/lib/select';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import { AimOutlined, BorderOuterOutlined, ScanOutlined } from '@ant-design/icons';

import { CombinedState } from 'reducers';
import { Canvas, RectDrawingMethod } from 'cvat-canvas-wrapper';
import {
    LabelType, ObjectState, ObjectType, ShapeType,
} from 'cvat-core-wrapper';
import { rememberObject, updateAnnotationsAsync } from 'actions/annotation-actions';
import CVATTooltip from 'components/common/cvat-tooltip';
import { VmJob, vmApi } from './autolabel-api';
import T from './autolabel-text';
import { useAction } from './autolabel-common';

const HISTORY_SIZE = 5;
// Canvas coordinates of a drawn box and the object CVAT creates from it can differ by rounding.
const POINT_TOLERANCE = 1;
const CREATE_TIMEOUT_MS = 5000;

interface Exchange {
    key: number;
    frame: number;
    label: string;
    hint: string;
    reply: string;
    found: boolean;
}

interface Props {
    canvasInstance: Canvas;
    disabled?: boolean;
}

// Waits for the object CVAT creates from a finished drawing, identified by its points.
function waitForCreatedState(
    store: Store<CombinedState>, points: number[], frame: number, known: Set<number>,
): Promise<ObjectState> {
    return new Promise((resolve, reject) => {
        const find = (): ObjectState | undefined => store.getState().annotation.annotations.states.find(
            (state) => state.frame === frame && state.shapeType === ShapeType.RECTANGLE &&
                !known.has(state.clientID as number) &&
                state.points?.every((value, index) => Math.abs(value - points[index]) <= POINT_TOLERANCE),
        );
        let unsubscribe = (): void => {};
        const timer = window.setTimeout(() => {
            unsubscribe();
            reject(new Error(T.aiBoxNotCreated));
        }, CREATE_TIMEOUT_MS);
        const check = (): void => {
            const created = find();
            if (!created) return;
            window.clearTimeout(timer);
            unsubscribe();
            resolve(created);
        };
        unsubscribe = store.subscribe(check);
        check();
    });
}

function AIBoxControl({ canvasInstance, disabled }: Props): JSX.Element {
    const dispatch = useDispatch();
    const store = useStore<CombinedState>();
    const jobInstance = useSelector((state: CombinedState) => state.annotation.job.instance);
    const labels = useSelector((state: CombinedState) => state.annotation.job.labels);
    const frame = useSelector((state: CombinedState) => state.annotation.player.frame.number);
    const [vmJob, setVmJob] = useState<VmJob | null>(null);
    const [open, setOpen] = useState(false);
    const [labelID, setLabelID] = useState<number | null>(null);
    const [hint, setHint] = useState('');
    const [history, setHistory] = useState<Exchange[]>([]);
    const [drawing, setDrawing] = useState(false);
    const [isBusy, run] = useAction();
    const sequence = useRef(0);

    const boxLabels = labels.filter((label) => [LabelType.ANY, LabelType.RECTANGLE].includes(label.type as LabelType));
    const selectedLabel = boxLabels.find((label) => label.id === labelID) ?? boxLabels[0];
    // Frames only leave the server redacted, so AI box is limited to a run's result job.
    const available = !!jobInstance && vmJob?.cvat_job_id === jobInstance.id;

    useEffect(() => {
        if (!jobInstance) return;
        vmApi.findByCvatJob(jobInstance.id).then(({ job }) => setVmJob(job)).catch(() => setVmJob(null));
    }, [jobInstance?.id]);

    const refine = async (state: ObjectState): Promise<void> => {
        if (!vmJob) return;
        if (state.rotation) throw new Error(T.aiBoxRotated);
        const { data } = store.getState().annotation.player.frame;
        const width = data?.width;
        const height = data?.height;
        if (!width || !height) throw new Error(T.aiBoxNotCreated);
        const [x1, y1, x2, y2] = state.points as number[];
        const clamp = (value: number): number => Math.min(1, Math.max(0, value));
        const label = state.label.name;
        const instruction = hint.trim();
        const hide = message.loading(T.aiBoxRefining, 0);
        try {
            const result = await vmApi.refineBox(vmJob.job_id, {
                source_frame: state.frame as number,
                label,
                bbox: [
                    clamp(Math.min(x1, x2) / width), clamp(Math.min(y1, y2) / height),
                    clamp(Math.max(x1, x2) / width), clamp(Math.max(y1, y2) / height),
                ],
                instruction,
            });
            sequence.current += 1;
            setHistory((previous) => [{
                key: sequence.current,
                frame: state.frame as number,
                label,
                hint: instruction,
                reply: result.reason,
                found: result.found,
            }, ...previous].slice(0, HISTORY_SIZE));
            if (!result.found || !result.bbox) {
                message.warning(`${T.aiBoxNotFound} ${result.reason}`);
                return;
            }
            const [a, b, c, d] = result.bbox;
            // Goes through the normal annotation update so undo and the guarded Save both apply.
            // eslint-disable-next-line no-param-reassign
            state.points = [a * width, b * height, c * width, d * height];
            await dispatch(updateAnnotationsAsync([state]));
            message.success(T.aiBoxRefined);
        } finally {
            hide();
        }
    };

    const startDrawing = (): void => {
        if (!selectedLabel) return;
        setOpen(false);
        canvasInstance.cancel();
        const container = canvasInstance.html();
        // Taken before drawing so the new box can never be mistaken for an existing object.
        const known = new Set(
            store.getState().annotation.annotations.states.map((item) => item.clientID as number),
        );
        // One drawing only: both listeners are removed by whichever event comes first.
        const listeners = {
            drawn: (event: Event): void => {
                listeners.stop();
                const { state } = (event as CustomEvent).detail;
                if (state?.shapeType !== ShapeType.RECTANGLE) return;
                const points = [...state.points];
                const drawnFrame = store.getState().annotation.player.frame.number;
                run('draw', async () => refine(await waitForCreatedState(store, points, drawnFrame, known)));
            },
            stop: (): void => {
                container.removeEventListener('canvas.drawn', listeners.drawn);
                container.removeEventListener('canvas.canceled', listeners.stop);
                setDrawing(false);
            },
        };
        container.addEventListener('canvas.drawn', listeners.drawn);
        container.addEventListener('canvas.canceled', listeners.stop);
        canvasInstance.draw({
            enabled: true,
            shapeType: ShapeType.RECTANGLE,
            rectDrawingMethod: RectDrawingMethod.CLASSIC,
            crosshair: true,
        });
        dispatch(rememberObject({
            activeObjectType: ObjectType.SHAPE,
            activeShapeType: ShapeType.RECTANGLE,
            activeLabelID: selectedLabel.id,
            activeRectDrawingMethod: RectDrawingMethod.CLASSIC,
        }));
        setDrawing(true);
        message.info(T.aiBoxDrawing);
    };

    const refineSelected = (): Promise<void> => run('selected', async () => {
        const { annotations } = store.getState().annotation;
        const state = annotations.states.find((item) => item.clientID === annotations.activatedStateID);
        if (!state || state.shapeType !== ShapeType.RECTANGLE || state.frame !== frame) {
            throw new Error(T.aiBoxNoSelection);
        }
        await refine(state);
    });

    const content = available ? (
        <div className='cvat-ai-box-popover-content'>
            <Text strong>{T.aiBoxTitle}</Text>
            <Text type='secondary' className='cvat-autolabel-meta'>{T.aiBoxPrivacy}</Text>
            <Text className='cvat-ai-box-field-label'>{T.aiBoxLabel}</Text>
            <Select
                value={selectedLabel?.id}
                onChange={setLabelID}
                options={boxLabels.map((label) => ({ value: label.id, label: label.name }))}
                className='cvat-ai-box-label'
                popupClassName='cvat-ai-box-label-dropdown'
            />
            <Text className='cvat-ai-box-field-label'>{T.aiBoxHint}</Text>
            <Input.TextArea
                value={hint}
                onChange={(event) => setHint(event.target.value)}
                maxLength={500}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder={T.aiBoxHintPlaceholder}
                onKeyDown={(event) => event.stopPropagation()}
            />
            <div className='cvat-ai-box-actions'>
                <CVATTooltip title={T.aiBoxDrawHelp}>
                    <Button
                        type='primary'
                        icon={<BorderOuterOutlined />}
                        disabled={!selectedLabel || drawing}
                        loading={isBusy('draw')}
                        onClick={startDrawing}
                    >
                        {T.aiBoxDraw}
                    </Button>
                </CVATTooltip>
                <CVATTooltip title={T.aiBoxRefineSelectedHelp}>
                    <Button icon={<AimOutlined />} loading={isBusy('selected')} onClick={refineSelected}>
                        {T.aiBoxRefineSelected}
                    </Button>
                </CVATTooltip>
            </div>
            {!!history.length && (
                <div className='cvat-ai-box-history'>
                    <Text type='secondary'>{T.aiBoxHistory}</Text>
                    {history.map((item) => (
                        <div key={item.key} className='cvat-ai-box-exchange'>
                            <div>
                                <Tag>{`${T.frame} ${item.frame}`}</Tag>
                                <Text strong>{`${T.aiBoxYou}: `}</Text>
                                <Text>{`${item.label} · ${item.hint || T.aiBoxNoHint}`}</Text>
                            </div>
                            <div>
                                <Tag color={item.found ? 'success' : 'warning'}>VLM</Tag>
                                <Text type='secondary'>{item.reply}</Text>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    ) : (
        <Alert type='info' showIcon message={T.aiBoxUnavailable} className='cvat-ai-box-popover-content' />
    );

    if (disabled) return <ScanOutlined className='cvat-ai-box-control cvat-disabled-canvas-control' />;

    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger={['click']}
            placement='right'
            content={content}
            overlayClassName='cvat-ai-box-popover'
        >
            <CVATTooltip title={T.aiBoxTooltip} placement='right'>
                <ScanOutlined
                    className={`cvat-ai-box-control${drawing ? ' cvat-active-canvas-control' : ''}`}
                    onClick={() => {
                        if (drawing) canvasInstance.draw({ enabled: false });
                    }}
                />
            </CVATTooltip>
        </Popover>
    );
}

export default React.memo(AIBoxControl);

// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useRef } from 'react';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import message from 'antd/lib/message';
import Popconfirm from 'antd/lib/popconfirm';
import Progress from 'antd/lib/progress';
import Space from 'antd/lib/space';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import {
    ExportOutlined, PlusOutlined, RedoOutlined, StopOutlined, SyncOutlined, EyeInvisibleOutlined,
    QuestionCircleOutlined,
} from '@ant-design/icons';

import CVATTooltip from 'components/common/cvat-tooltip';
import { TERMINAL_STATUSES, VmJob, vmApi } from './autolabel-api';
import T from './autolabel-text';
import {
    JobStatusTag, VlmStatusTag, stageLabel, jumpToFrame, useAction,
} from './autolabel-common';
import { SyncState } from './use-autolabel-job';

// Each counter has its own meaning; the help text keeps users from reading them as label counts.
const STEPS: [keyof VmJob, string, string][] = [
    ['privacy_frames', T.stepPrivacy, T.stepPrivacyHelp],
    ['delivered_frames', T.stepDelivered, T.stepDeliveredHelp],
    ['processed_frames', T.stepProcessed, T.stepProcessedHelp],
    ['complete_frames', T.stepComplete, T.stepCompleteHelp],
    ['published_frames', T.stepPublished, T.stepPublishedHelp],
];

// Indexes match the frame_states values returned by the API.
const FRAME_STATE_COLORS = ['#d9d9d9', '#faad14', '#1677ff', '#ff4d4f'];
const FRAME_STATE_LABELS = [T.legendPending, T.legendPartial, T.legendComplete, T.legendError];

// Colors alone are not accessible, so the legend repeats each state as text with a count.
function TimelineLegend({ states }: { states: number[] }): JSX.Element {
    const counts = [0, 0, 0, 0];
    states.forEach((state) => { counts[state] = (counts[state] ?? 0) + 1; });
    return (
        <div className='cvat-autolabel-timeline-legend'>
            {FRAME_STATE_LABELS.map((label, state) => (
                <span key={label} className='cvat-autolabel-legend-item'>
                    <span className='cvat-autolabel-legend-swatch' style={{ background: FRAME_STATE_COLORS[state] }} />
                    {`${label} ${counts[state]}`}
                </span>
            ))}
        </div>
    );
}
const TIMELINE_WIDTH = 1000;

function FrameTimeline({ job, clickable }: { job: VmJob; clickable: boolean }): JSX.Element {
    const canvas = useRef<HTMLCanvasElement>(null);
    const states = job.frame_states ?? [];

    useEffect(() => {
        const context = canvas.current?.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, TIMELINE_WIDTH, 1);
        const step = TIMELINE_WIDTH / Math.max(1, job.total_frames);
        states.forEach((state, index) => {
            context.fillStyle = FRAME_STATE_COLORS[state] ?? FRAME_STATE_COLORS[0];
            context.fillRect(index * step, 0, Math.ceil(step), 1);
        });
    }, [states, job.total_frames]);

    const onClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
        if (!clickable || !job.total_frames) return;
        const ratio = event.nativeEvent.offsetX / event.currentTarget.clientWidth;
        jumpToFrame(Math.min(job.total_frames - 1, Math.floor(ratio * job.total_frames))).catch(() => {});
    };

    return (
        <CVATTooltip overlay={clickable ? T.timelineHint : T.needCurrentJob}>
            <canvas
                ref={canvas}
                width={TIMELINE_WIDTH}
                height={1}
                aria-label={T.timelineHint}
                className={`cvat-autolabel-timeline${clickable ? ' cvat-autolabel-timeline-clickable' : ''}`}
                onClick={onClick}
            />
        </CVATTooltip>
    );
}

interface Props {
    job: VmJob;
    onResultJob: boolean;
    syncState: SyncState;
    onJobChange(job: VmJob | null): void;
    onSync(): Promise<void>;
    onOpenPrivacy(): void;
}

function JobProgress(props: Props): JSX.Element {
    const {
        job, onResultJob, syncState, onJobChange, onSync, onOpenPrivacy,
    } = props;
    const [isBusy, run] = useAction();
    const terminal = TERMINAL_STATUSES.has(job.status);
    const total = job.total_frames || 0;
    const vlmStatus = job.vlm_status ?? 'idle';

    return (
        <div className='cvat-autolabel-job-progress'>
            <div className='cvat-autolabel-job-header'>
                <JobStatusTag status={job.status} />
                <Text type='secondary'>{stageLabel(job.stage)}</Text>
                {vlmStatus !== 'idle' && (
                    <span className='cvat-autolabel-vlm-chip'>
                        <Text type='secondary'>{T.vlmAuditLabel}</Text>
                        <VlmStatusTag status={vlmStatus} />
                    </span>
                )}
            </div>
            {job.error && <Alert type='error' showIcon className='cvat-autolabel-block' message={job.error} />}
            {job.status === 'completed' && (
                <Alert type='success' showIcon className='cvat-autolabel-block' message={T.doneButPending} />
            )}
            {vlmStatus === 'failed' && (
                <Alert type='warning' showIcon className='cvat-autolabel-block' message={T.vlmFailedNote} />
            )}
            {!terminal && !!job.cvat_job_id && !onResultJob && (
                <Alert type='info' showIcon className='cvat-autolabel-block' message={T.openEarly} />
            )}
            {syncState === 'needs-save' && (
                <Alert
                    type='warning'
                    showIcon
                    className='cvat-autolabel-block'
                    message={T.syncNeedSave}
                    action={(
                        <Button size='small' loading={isBusy('sync')} onClick={() => run('sync', onSync)}>
                            {T.sync}
                        </Button>
                    )}
                />
            )}

            <div className='cvat-autolabel-steps'>
                {STEPS.map(([key, label, help]) => {
                    const value = (job[key] as number | undefined) ?? 0;
                    const percent = total ? Math.round((value / total) * 100) : 0;
                    return (
                        <div key={key} className='cvat-autolabel-step'>
                            <div className='cvat-autolabel-step-label'>
                                <CVATTooltip overlay={help}>
                                    <Text>
                                        {label}
                                        <QuestionCircleOutlined className='cvat-autolabel-help-icon' />
                                    </Text>
                                </CVATTooltip>
                                <Text type='secondary'>{`${value} / ${total || '?'}`}</Text>
                            </div>
                            <Progress
                                percent={percent}
                                size='small'
                                showInfo={false}
                                status={job.status === 'failed' && percent < 100 ? 'exception' : undefined}
                            />
                        </div>
                    );
                })}
            </div>

            {total > 0 && (
                <div className='cvat-autolabel-block'>
                    <Text type='secondary'>{T.timeline}</Text>
                    <FrameTimeline job={job} clickable={onResultJob} />
                    <TimelineLegend states={job.frame_states ?? []} />
                </div>
            )}

            {!!job.classes?.length && (
                <div className='cvat-autolabel-block'>
                    <Text type='secondary'>{T.coverage}</Text>
                    <div>
                        {job.classes.map((name) => (
                            <Tag key={name}>{`${name}: ${job.class_coverage?.[name] ?? 0}`}</Tag>
                        ))}
                    </div>
                    <Text type='secondary' className='cvat-autolabel-meta'>
                        {`${T.checkpoint} ${job.completed_windows ?? 0} · ${T.cache} `}
                        {`${Math.round((job.cache_bytes ?? 0) / 1048576)} MiB`}
                    </Text>
                </div>
            )}
            {job.cap_warning && <Alert type='warning' showIcon className='cvat-autolabel-block' message={T.capWarning} />}
            {!!job.mask_absence_count && (
                <Alert
                    type='warning'
                    showIcon
                    className='cvat-autolabel-block'
                    message={`${job.mask_absence_count} ${T.maskAbsence}`}
                />
            )}

            <Space wrap className='cvat-autolabel-actions'>
                {job.cvat_task_id && job.cvat_job_id && !onResultJob && (
                    <CVATTooltip overlay={T.openResultHint}>
                        <Button
                            type='primary'
                            icon={<ExportOutlined />}
                            href={`/tasks/${job.cvat_task_id}/jobs/${job.cvat_job_id}`}
                        >
                            {T.openResult}
                        </Button>
                    </CVATTooltip>
                )}
                {onResultJob && (
                    <Button
                        icon={<SyncOutlined />}
                        loading={isBusy('sync')}
                        onClick={() => run('sync', onSync)}
                    >
                        {T.sync}
                    </Button>
                )}
                {!terminal && (
                    <Popconfirm
                        title={T.cancelConfirm}
                        onConfirm={() => run('cancel', async () => {
                            onJobChange(await vmApi.cancel(job.job_id));
                            message.info(T.cancelRequested);
                        })}
                    >
                        <Button danger icon={<StopOutlined />} loading={isBusy('cancel')}>{T.cancel}</Button>
                    </Popconfirm>
                )}
                {['failed', 'cancelled'].includes(job.status) && (
                    <Button
                        icon={<RedoOutlined />}
                        loading={isBusy('retry')}
                        onClick={() => run('retry', async () => onJobChange(await vmApi.retry(job.job_id)))}
                    >
                        {T.retry}
                    </Button>
                )}
                {job.status === 'completed' && (
                    <Button icon={<EyeInvisibleOutlined />} onClick={onOpenPrivacy}>{T.privacy}</Button>
                )}
                {terminal && (
                    <Button icon={<PlusOutlined />} onClick={() => onJobChange(null)}>{T.newVideo}</Button>
                )}
            </Space>
            {onResultJob && <Text type='secondary' className='cvat-autolabel-meta'>{T.onResultJob}</Text>}
            <Text type='secondary' className='cvat-autolabel-meta'>{T.pendingNote}</Text>
        </div>
    );
}

export default React.memo(JobProgress);

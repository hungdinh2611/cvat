// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Empty from 'antd/lib/empty';
import Segmented from 'antd/lib/segmented';
import Select from 'antd/lib/select';
import Space from 'antd/lib/space';
import Table, { ColumnsType } from 'antd/lib/table';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import {
    AimOutlined, CheckOutlined, EyeOutlined, ReloadOutlined,
} from '@ant-design/icons';

import CVATTooltip from 'components/common/cvat-tooltip';
import {
    ReviewPage, ReviewState, ReviewTrack, VmJob, vmApi,
} from './autolabel-api';
import T from './autolabel-text';
import { jumpToFrame, useAction } from './autolabel-common';

const PAGE_SIZE = 50; // Fixed by the API.

const STATE_VIEW: Record<ReviewState, { color: string; label: string }> = {
    unseen: { color: 'default', label: T.stateUnseen },
    seen: { color: 'blue', label: T.stateSeen },
    resolved: { color: 'green', label: T.stateResolved },
};

interface Props {
    job: VmJob;
    onResultJob: boolean;
}

function ReviewTab({ job, onResultJob }: Props): JSX.Element {
    const [className, setClassName] = useState('');
    const [viewed, setViewed] = useState<'' | ReviewState>('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState<ReviewPage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isBusy, run] = useAction();

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        try {
            setData(await vmApi.review(job.job_id, page, className, viewed));
            setError(null);
        } catch (failure) {
            setError((failure as Error).message);
        } finally {
            setLoading(false);
        }
    }, [job.job_id, page, className, viewed]);

    useEffect(() => {
        if (job.cvat_job_id) load();
    }, [load, job.cvat_job_id]);

    const setState = (track: ReviewTrack, state: ReviewState): Promise<void> => run(
        `${track.track_id}:${state}`,
        async () => {
            await vmApi.setReviewState(job.job_id, track.track_id, state);
            await load();
        },
    );

    const goTo = (track: ReviewTrack): Promise<void> => run(
        `${track.track_id}:jump`, () => jumpToFrame(track.frame, track.track_id),
    );

    if (!job.cvat_job_id) return <Empty description={T.reviewNeedJob} />;

    const columns: ColumnsType<ReviewTrack> = [
        {
            title: T.columnTrack,
            key: 'track',
            render: (_, track) => (
                <div className='cvat-autolabel-review-track'>
                    <Text strong>{track.class}</Text>
                    <Text type='secondary' className='cvat-autolabel-review-reason'>{track.reason}</Text>
                </div>
            ),
        },
        {
            title: T.columnFrame,
            dataIndex: 'frame',
            key: 'frame',
            width: 64,
        },
        {
            title: T.columnState,
            dataIndex: 'state',
            key: 'state',
            width: 92,
            render: (state: ReviewState) => (
                <Tag color={STATE_VIEW[state]?.color}>{STATE_VIEW[state]?.label ?? state}</Tag>
            ),
        },
        {
            title: T.columnActions,
            key: 'actions',
            width: 104,
            render: (_, track) => (
                <Space size={2}>
                    <CVATTooltip overlay={onResultJob ? T.goTo : T.needCurrentJob}>
                        <Button
                            size='small'
                            type='text'
                            icon={<AimOutlined />}
                            aria-label={T.goTo}
                            disabled={!onResultJob}
                            onClick={() => goTo(track)}
                        />
                    </CVATTooltip>
                    <CVATTooltip overlay={T.markSeen}>
                        <Button
                            size='small'
                            type='text'
                            icon={<EyeOutlined />}
                            aria-label={T.markSeen}
                            disabled={track.state !== 'unseen'}
                            loading={isBusy(`${track.track_id}:seen`)}
                            onClick={() => setState(track, 'seen')}
                        />
                    </CVATTooltip>
                    <CVATTooltip overlay={T.markResolved}>
                        <Button
                            size='small'
                            type='text'
                            icon={<CheckOutlined />}
                            aria-label={T.markResolved}
                            disabled={track.state === 'resolved'}
                            loading={isBusy(`${track.track_id}:resolved`)}
                            onClick={() => setState(track, 'resolved')}
                        />
                    </CVATTooltip>
                </Space>
            ),
        },
    ];

    return (
        <div className='cvat-autolabel-review'>
            <div className='cvat-autolabel-review-filters'>
                <Select
                    value={className}
                    onChange={(value) => { setClassName(value); setPage(1); }}
                    aria-label={T.filterClass}
                    options={[
                        { value: '', label: `${T.filterClass}: ${T.filterAll}` },
                        ...job.classes.map((name) => ({ value: name, label: name })),
                    ]}
                    className='cvat-autolabel-review-class'
                />
                <CVATTooltip overlay={T.refresh}>
                    <Button icon={<ReloadOutlined />} aria-label={T.refresh} loading={loading} onClick={load} />
                </CVATTooltip>
            </div>
            <Segmented
                block
                value={viewed}
                onChange={(value) => { setViewed(value as '' | ReviewState); setPage(1); }}
                options={[
                    { value: '', label: T.filterAll },
                    { value: 'unseen', label: T.stateUnseen },
                    { value: 'seen', label: T.stateSeen },
                    { value: 'resolved', label: T.stateResolved },
                ]}
                className='cvat-autolabel-block'
            />
            {error && <Alert type='error' showIcon className='cvat-autolabel-block' message={error} />}
            <Table<ReviewTrack>
                size='small'
                rowKey='track_id'
                loading={loading}
                columns={columns}
                dataSource={data?.tracks ?? []}
                pagination={{
                    current: page,
                    pageSize: PAGE_SIZE,
                    total: data?.total ?? 0,
                    showSizeChanger: false,
                    size: 'small',
                    showTotal: (total) => `${total} ${T.tracks}`,
                    onChange: setPage,
                }}
                onRow={(track) => ({
                    onDoubleClick: () => {
                        if (onResultJob) goTo(track);
                    },
                })}
                className='cvat-autolabel-review-table'
            />
            <Text type='secondary' className='cvat-autolabel-meta'>{T.reviewNote}</Text>
        </div>
    );
}

export default React.memo(ReviewTab);

// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Card from 'antd/lib/card';
import Empty from 'antd/lib/empty';
import Image from 'antd/lib/image';
import message from 'antd/lib/message';
import Select from 'antd/lib/select';
import Space from 'antd/lib/space';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import {
    CheckOutlined, CloseOutlined, EyeInvisibleOutlined, EyeOutlined, RobotOutlined, SettingOutlined,
} from '@ant-design/icons';

import CVATTooltip from 'components/common/cvat-tooltip';
import {
    AutoLabelError, ProposalStatus, VlmProposal, VlmResult, VmJob, bridge, vmApi,
} from './autolabel-api';
import T from './autolabel-text';
import {
    VlmStatusTag, jumpToFrame, requireSavedAnnotations, useAction,
} from './autolabel-common';
import { OverlayBox, useProposalOverlay } from './use-proposal-overlay';

const MAX_SHOWN = 20;

const PROPOSAL_STATUS: Record<ProposalStatus, { color: string; label: string }> = {
    pending: { color: 'gold', label: T.proposalPending },
    accepting: { color: 'processing', label: T.proposalAccepting },
    accepted: { color: 'success', label: T.proposalAccepted },
    rejected: { color: 'default', label: T.proposalRejected },
};

const CONFIDENCE: Record<string, { color: string; label: string }> = {
    high: { color: 'green', label: T.confidenceHigh },
    medium: { color: 'orange', label: T.confidenceMedium },
    low: { color: 'default', label: T.confidenceLow },
};

interface Props {
    job: VmJob;
    onResultJob: boolean;
    currentFrame: number;
    // Bumped when the settings dialog closes, so the key status is read again.
    settingsRevision: number;
    onOpenSettings(): void;
}

function VlmTab({
    job, onResultJob, currentFrame, settingsRevision, onOpenSettings,
}: Props): JSX.Element {
    const [results, setResults] = useState<VlmResult[]>([]);
    const [selected, setSelected] = useState<VlmResult | null>(null);
    const [overlay, setOverlay] = useState<OverlayBox | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
    // Runs snapshot VLM settings at creation; older runs need an explicit apply after a key is saved.
    const [needsProfile, setNeedsProfile] = useState(false);
    const [isBusy, run] = useAction();
    useProposalOverlay(overlay, currentFrame);

    const show = useCallback((result: VlmResult | null): void => {
        setSelected(result);
        setOverlay(null);
        if (result) {
            setResults((previous) => [result, ...previous.filter((item) => item.result_id !== result.result_id)]);
        }
    }, []);

    const loadResults = useCallback(async (): Promise<void> => {
        try {
            const data = await vmApi.vlmResults(job.job_id);
            setResults(data.results);
            setSelected((current) => current ?? data.results[0] ?? null);
            setError(null);
        } catch (failure) {
            setError((failure as Error).message);
        }
    }, [job.job_id]);

    // Saved results are read again when the background audit finishes; opening the tab never calls the VLM.
    useEffect(() => { loadResults(); }, [loadResults, job.vlm_status]);
    useEffect(() => {
        vmApi.vlmSettings()
            .then((settings) => setKeyConfigured(settings.key_configured))
            .catch(() => setKeyConfigured(null));
    }, [settingsRevision]);
    useEffect(() => () => setOverlay(null), []);

    const ask = (): Promise<void> => run('ask', async () => {
        const status = await requireSavedAnnotations();
        try {
            show(await vmApi.askVlm(job.job_id, status.frame));
            setNeedsProfile(false);
        } catch (failure) {
            if (failure instanceof AutoLabelError && failure.status === 409 && job.status === 'completed') {
                setNeedsProfile(true);
                return;
            }
            throw failure;
        }
    });

    const applyProfile = (): Promise<void> => run('profile', async () => {
        await vmApi.bindVlmProfile(job.job_id);
        setNeedsProfile(false);
        message.success(T.profileApplied);
    });

    const decide = (result: VlmResult, index: number, accept: boolean): Promise<void> => run(
        `${index}:${accept}`,
        async () => {
            await requireSavedAnnotations();
            show(await vmApi.vlmDecision(job.job_id, result.result_id, index, accept));
            if (accept) await bridge('sync');
        },
    );

    const toggleOverlay = (result: VlmResult, proposal: VlmProposal): Promise<void> => run('overlay', async () => {
        const visible = overlay?.frame === result.source_frame && overlay.bbox === proposal.bbox;
        if (visible) {
            setOverlay(null);
            return;
        }
        await jumpToFrame(result.source_frame);
        setOverlay({ frame: result.source_frame, label: proposal.label, bbox: proposal.bbox });
    });

    if (!job.cvat_job_id) return <Empty description={T.reviewNeedJob} />;

    return (
        <div className='cvat-autolabel-vlm'>
            <Alert type='info' showIcon className='cvat-autolabel-block' message={T.vlmHint} />
            <div className='cvat-autolabel-block'>
                <Text type='secondary'>{`${T.vlmAuditLabel} `}</Text>
                <VlmStatusTag status={job.vlm_status} />
            </div>
            {needsProfile && keyConfigured !== false && (
                <Alert
                    type='warning'
                    showIcon
                    className='cvat-autolabel-block'
                    message={T.needsProfile}
                    action={(
                        <Button size='small' type='primary' loading={isBusy('profile')} onClick={applyProfile}>
                            {T.applyProfile}
                        </Button>
                    )}
                />
            )}
            {keyConfigured === false && (
                <Alert
                    type='warning'
                    showIcon
                    className='cvat-autolabel-block'
                    message={T.noKey}
                    action={<Button size='small' onClick={onOpenSettings}>{T.settings}</Button>}
                />
            )}
            <Space wrap className='cvat-autolabel-actions'>
                <CVATTooltip overlay={onResultJob ? `${T.frame} ${currentFrame}. ${T.askHint}` : T.needCurrentJob}>
                    <Button
                        type='primary'
                        icon={<RobotOutlined />}
                        disabled={!onResultJob || keyConfigured === false}
                        loading={isBusy('ask')}
                        onClick={ask}
                    >
                        {T.askCurrent}
                    </Button>
                </CVATTooltip>
                {job.status === 'completed' && (
                    <CVATTooltip overlay={T.profileHint}>
                        <Button
                            loading={isBusy('profile')}
                            onClick={applyProfile}
                        >
                            {T.applyProfile}
                        </Button>
                    </CVATTooltip>
                )}
                <Button icon={<SettingOutlined />} onClick={onOpenSettings}>{T.settings}</Button>
            </Space>
            {error && <Alert type='error' showIcon className='cvat-autolabel-block' message={error} />}

            {results.length ? (
                <Select
                    value={selected?.result_id}
                    onChange={(id) => show(results.find((result) => result.result_id === id) ?? null)}
                    aria-label={T.savedResults}
                    className='cvat-autolabel-block cvat-autolabel-vlm-results'
                    options={results.map((result) => ({
                        value: result.result_id,
                        label: `${T.frame} ${result.source_frame} · ${result.proposals.length} ${T.suggestions}`,
                    }))}
                />
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={T.noResults} />
            )}

            {selected && (
                <div className='cvat-autolabel-vlm-result'>
                    <Image src={selected.preview} alt={`${T.frame} ${selected.source_frame}`} />
                    <Text type='secondary' className='cvat-autolabel-meta'>
                        {`${T.frame} ${selected.source_frame} · ${selected.model}`}
                    </Text>
                    {selected.reason && <Text className='cvat-autolabel-meta'>{selected.reason}</Text>}
                    {!selected.proposals.length && (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={T.noProposals} />
                    )}
                    {selected.proposals.slice(0, MAX_SHOWN).map((proposal, index) => {
                        const status = PROPOSAL_STATUS[proposal.status] ?? { color: 'default', label: proposal.status };
                        const confidence = proposal.confidence ? CONFIDENCE[proposal.confidence] : null;
                        const shown = overlay?.frame === selected.source_frame && overlay.bbox === proposal.bbox;
                        const acceptable = proposal.status === 'pending' || proposal.status === 'accepting';
                        return (
                            <Card
                                // Proposals have no ID; the API addresses them by index.

                                key={index}
                                size='small'
                                className='cvat-autolabel-proposal'
                                title={(
                                    <Space size={4}>
                                        <Text strong>{`${index + 1}. ${proposal.label}`}</Text>
                                        <Tag color={status.color}>{status.label}</Tag>
                                    </Space>
                                )}
                                extra={(
                                    <CVATTooltip overlay={shown ? T.hideBox : T.showBox}>
                                        <Button
                                            size='small'
                                            type='text'
                                            aria-label={shown ? T.hideBox : T.showBox}
                                            icon={shown ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                                            disabled={!onResultJob}
                                            onClick={() => toggleOverlay(selected, proposal)}
                                        />
                                    </CVATTooltip>
                                )}
                            >
                                <div>
                                    {confidence && <Tag color={confidence.color}>{confidence.label}</Tag>}
                                    <Tag>{proposal.box_extent === 'amodal_estimate' ? T.amodal : T.visible}</Tag>
                                </div>
                                <Text className='cvat-autolabel-meta'>{proposal.reason}</Text>
                                {acceptable && (
                                    <Space className='cvat-autolabel-proposal-actions'>
                                        <Button
                                            size='small'
                                            type='primary'
                                            icon={<CheckOutlined />}
                                            disabled={!onResultJob}
                                            loading={isBusy(`${index}:true`)}
                                            onClick={() => decide(selected, index, true)}
                                        >
                                            {proposal.status === 'accepting' ? T.retryAccept : T.accept}
                                        </Button>
                                        <Button
                                            size='small'
                                            icon={<CloseOutlined />}
                                            disabled={!onResultJob || proposal.status === 'accepting'}
                                            loading={isBusy(`${index}:false`)}
                                            onClick={() => decide(selected, index, false)}
                                        >
                                            {T.reject}
                                        </Button>
                                    </Space>
                                )}
                            </Card>
                        );
                    })}
                    {selected.proposals.length > MAX_SHOWN && (
                        <Text type='secondary' className='cvat-autolabel-meta'>
                            {`${selected.proposals.length - MAX_SHOWN} ${T.hiddenProposals}`}
                        </Text>
                    )}
                </div>
            )}
        </div>
    );
}

export default React.memo(VlmTab);

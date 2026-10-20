// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import Alert from 'antd/lib/alert';
import Badge from 'antd/lib/badge';
import Button from 'antd/lib/button';
import Drawer from 'antd/lib/drawer';
import Empty from 'antd/lib/empty';
import Modal from 'antd/lib/modal';
import Result from 'antd/lib/result';
import Space from 'antd/lib/space';
import Spin from 'antd/lib/spin';
import Tabs from 'antd/lib/tabs';
import { ReloadOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons';

import { GUIDE_UI_EVENT, GUIDE_RESTORE_EVENT, GuidePanel } from 'components/demo-guide/types';
import { CombinedState } from 'reducers';
import { DimensionType } from 'cvat-core-wrapper';
import CVATTooltip from 'components/common/cvat-tooltip';
import { TERMINAL_STATUSES } from './autolabel-api';
import T from './autolabel-text';
import { JobStatusTag } from './autolabel-common';
import { useAutoLabelJob } from './use-autolabel-job';
import UploadForm from './upload-form';
import JobProgress from './job-progress';
import ReviewTab from './review-tab';
import VlmTab from './vlm-tab';
import VlmSettingsForm from './vlm-settings-form';
import PrivacyRegionsModal from './privacy-regions-modal';
import SaveConflictModal from './save-conflict-modal';

const OPEN_KEY = 'autolabel-drawer-open';
const TAB_KEY = 'autolabel-tab';

function readStorage(storage: Storage, key: string): string | null {
    try { return storage.getItem(key); } catch { return null; }
}

function writeStorage(storage: Storage, key: string, value: string): void {
    try { storage.setItem(key, value); } catch { /* Only a convenience; the panel works without it. */ }
}

function AutoLabelPanel({ cvatJobID }: { cvatJobID: number }): JSX.Element {
    const currentFrame = useSelector((state: CombinedState) => state.annotation.player.frame.number);
    const [open, setOpen] = useState(() => readStorage(sessionStorage, OPEN_KEY) === '1');
    const [tab, setTab] = useState(() => readStorage(localStorage, TAB_KEY) ?? 'run');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsRevision, setSettingsRevision] = useState(0);
    const [privacyOpen, setPrivacyOpen] = useState(false);
    const guideSnapshot = useRef<{ open: boolean; tab: string; settingsOpen: boolean } | null>(null);
    useEffect(() => {
        const guide = (event: Event): void => {
            if (!guideSnapshot.current) guideSnapshot.current = { open, tab, settingsOpen };
            const panel = (event as CustomEvent<GuidePanel>).detail;
            setOpen(['run', 'review', 'vlm', 'settings'].includes(panel));
            setSettingsOpen(panel === 'settings');
            if (['run', 'review', 'vlm'].includes(panel)) setTab(panel);
        };
        const restore = (): void => {
            if (guideSnapshot.current) {
                setOpen(guideSnapshot.current.open);
                setTab(guideSnapshot.current.tab);
                setSettingsOpen(guideSnapshot.current.settingsOpen);
                guideSnapshot.current = null;
            }
        };
        window.addEventListener(GUIDE_UI_EVENT, guide);
        window.addEventListener(GUIDE_RESTORE_EVENT, restore);
        return () => {
            window.removeEventListener(GUIDE_UI_EVENT, guide);
            window.removeEventListener(GUIDE_RESTORE_EVENT, restore);
        };
    }, [open, tab, settingsOpen]);
    const state = useAutoLabelJob(cvatJobID);
    const {
        capabilities, job, error, loading, syncState, onResultJob, reload, replaceJob, syncNow,
    } = state;
    const running = !!job && !TERMINAL_STATUSES.has(job.status);

    const toggle = (next: boolean): void => {
        setOpen(next);
        writeStorage(sessionStorage, OPEN_KEY, next ? '1' : '0');
    };

    const changeTab = (key: string): void => {
        setTab(key);
        writeStorage(localStorage, TAB_KEY, key);
    };

    let body: JSX.Element;
    if (!capabilities) {
        body = error ? (
            <Result
                status='warning'
                title={error}
                extra={<Button onClick={reload}>{T.reconnect}</Button>}
            />
        ) : <Spin className='cvat-autolabel-loading' tip={T.loading}><div /></Spin>;
    } else if (!capabilities.enabled) {
        body = <Result status='info' title={T.disabled} />;
    } else {
        const noRun = <Empty description={T.reviewNeedJob} />;
        body = (
            <>
                {error && <Alert type='error' showIcon closable className='cvat-autolabel-block' message={error} />}
                <Tabs
                    activeKey={job ? tab : 'run'}
                    onChange={changeTab}
                    items={[
                        {
                            key: 'run',
                            label: <span data-tour='autolabel-run-tab'>{T.tabRun}</span>,
                            children: job ? (
                                <JobProgress
                                    job={job}
                                    onResultJob={onResultJob}
                                    syncState={syncState}
                                    onJobChange={replaceJob}
                                    onSync={syncNow}
                                    onOpenPrivacy={() => setPrivacyOpen(true)}
                                />
                            ) : <UploadForm capabilities={capabilities} cvatJobID={cvatJobID} onCreated={replaceJob} />,
                        },
                        {
                            key: 'review',
                            label: <span data-tour='autolabel-review-tab'>{T.tabReview}</span>,
                            disabled: !job,
                            children: job ? <ReviewTab job={job} onResultJob={onResultJob} /> : noRun,
                        },
                        {
                            key: 'vlm',
                            label: <span data-tour='autolabel-vlm-tab'>{T.tabVlm}</span>,
                            disabled: !job,
                            children: job ? (
                                <VlmTab
                                    job={job}
                                    onResultJob={onResultJob}
                                    currentFrame={currentFrame}
                                    settingsRevision={settingsRevision}
                                    onOpenSettings={() => setSettingsOpen(true)}
                                />
                            ) : noRun,
                        },
                    ]}
                />
            </>
        );
    }

    return (
        <>
            <CVATTooltip overlay={job ? `${T.title}: ${job.status}` : T.title}>
                <Button
                    type='link'
                    className={`cvat-annotation-header-button cvat-autolabel-open-button${open ? ' cvat-button-active' : ''}`}
                    onClick={() => toggle(!open)}
                >
                    <Badge dot={running} status='processing' offset={[-2, 4]}>
                        <RobotOutlined />
                    </Badge>
                    {T.open}
                </Button>
            </CVATTooltip>
            <Drawer
                open={open}
                onClose={() => toggle(false)}
                placement='right'
                width={440}
                // The canvas stays usable so the user can jump, inspect and edit while the panel is open.
                mask={false}
                title={(
                    <Space size={8}>
                        <span>{T.title}</span>
                        {job && <JobStatusTag status={job.status} />}
                    </Space>
                )}
                extra={(
                    <Space size={0}>
                        <CVATTooltip overlay={T.refresh}>
                            <Button type='text' icon={<ReloadOutlined />} aria-label={T.refresh} loading={loading} onClick={reload} />
                        </CVATTooltip>
                        <CVATTooltip overlay={T.settings}>
                            <Button
                                type='text'
                                icon={<SettingOutlined />}
                                aria-label={T.settings}
                                onClick={() => setSettingsOpen(true)}
                            />
                        </CVATTooltip>
                    </Space>
                )}
                className='cvat-autolabel-drawer'
            >
                {body}
            </Drawer>
            <Modal
                open={settingsOpen}
                title={T.vlmSettingsTitle}
                footer={null}
                onCancel={() => {
                    setSettingsOpen(false);
                    setSettingsRevision((revision) => revision + 1);
                }}
                destroyOnClose
            >
                <VlmSettingsForm />
            </Modal>
            {job && (
                <PrivacyRegionsModal
                    job={job}
                    open={privacyOpen}
                    onClose={() => setPrivacyOpen(false)}
                    onCreated={replaceJob}
                />
            )}
        </>
    );
}

// Entry point in the annotation top bar. The panel itself covers the 2D workflow only.
function AutoLabelLauncher(): JSX.Element {
    const jobInstance = useSelector((state: CombinedState) => state.annotation.job.instance);
    const is2D = !!jobInstance && jobInstance.dimension !== DimensionType.DIMENSION_3D;
    return (
        <>
            {/* Keyed by job so that switching jobs starts with a fresh state. */}
            {is2D && <AutoLabelPanel key={jobInstance.id} cvatJobID={jobInstance.id} />}
            {/* Progressive saves wait for this answer in every workspace, 3D included. */}
            <SaveConflictModal />
        </>
    );
}

export default React.memo(AutoLabelLauncher);

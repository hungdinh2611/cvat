// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, {
    createContext, useContext, useEffect, useRef, useState,
} from 'react';
import { useSelector, useStore } from 'react-redux';
import { useHistory, useLocation } from 'react-router';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Card from 'antd/lib/card';
import Modal from 'antd/lib/modal';
import Space from 'antd/lib/space';
import Spin from 'antd/lib/spin';
import Tour from 'antd/lib/tour';
import Typography from 'antd/lib/typography';
import { CompassOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { CombinedState } from 'reducers';
import { demoGuideSeen, markDemoGuideSeen } from 'utils/demo-guide-session';
import journeys from './journeys';
import {
    GUIDE_RESTORE_EVENT, GUIDE_UI_EVENT, JOURNEYS, Journey,
} from './types';

interface GuideContextValue {
    active: boolean;
    open: () => void;
}

const GuideContext = createContext<GuideContextValue>({ active: false, open: () => {} });
export const useDemoGuide = (): GuideContextValue => useContext(GuideContext);

export function DemoGuideButton(): JSX.Element | null {
    const user = useSelector((state: CombinedState) => state.auth.user);
    const { open } = useDemoGuide();
    return user?.username === 'test_demo' ? (
        <Button type='link' icon={<CompassOutlined />} onClick={open} className='cvat-header-button cvat-demo-guide-button'>
            Demo guide
        </Button>
    ) : null;
}

export default function DemoGuideProvider({ children }: { children: React.ReactNode }): JSX.Element {
    const user = useSelector((state: CombinedState) => state.auth.user);
    const store = useStore<CombinedState>();
    const history = useHistory();
    const location = useLocation();
    const [chooser, setChooser] = useState(false);
    const [journey, setJourney] = useState<Journey | null>(null);
    const [current, setCurrent] = useState(0);
    const [target, setTarget] = useState<HTMLElement | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const active = user?.username === 'test_demo' && journey !== null;
    const steps = journey ? journeys[journey] : [];
    const step = steps[current];
    const routeRef = useRef(location.pathname + location.search);
    routeRef.current = location.pathname + location.search;

    const restore = (): void => {
        window.dispatchEvent(new Event(GUIDE_RESTORE_EVENT));
    };

    const stop = (showChooser = false): void => {
        restore();
        setJourney(null);
        setReady(false);
        setError('');
        setChooser(showChooser);
    };

    useEffect(() => {
        if (user?.username === 'test_demo' && !demoGuideSeen()) {
            markDemoGuideSeen();
            setChooser(true);
        }
        return () => { window.dispatchEvent(new Event(GUIDE_RESTORE_EVENT)); };
    }, [user?.id]);

    // Block canvas shortcuts, form submits and actions even while targets are loading.
    // Only the guide's own controls may receive input during a tour.
    useEffect(() => {
        if (!active) return undefined;
        const block = (event: Event): void => {
            if ((event.target as Element)?.closest?.('.ant-tour, .cvat-demo-guide-dialog')) {
                // Keep keyboard input in the guide from reaching canvas-wide shortcuts.
                if (event.type === 'keydown') {
                    const key = event as KeyboardEvent;
                    event.stopImmediatePropagation();
                    if (key.ctrlKey || key.metaKey || key.altKey) event.preventDefault();
                }
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        const events = ['click', 'dblclick', 'pointerdown', 'mousedown', 'keydown', 'submit', 'drop'];
        events.forEach((name) => window.addEventListener(name, block, true));
        return () => events.forEach((name) => window.removeEventListener(name, block, true));
    }, [active]);

    useEffect(() => {
        if (!active || !step) return undefined;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const started = Date.now();
        setReady(false);
        setTarget(null);
        setError('');
        const prepare = (): void => {
            if (cancelled) return;
            if (routeRef.current !== step.route) {
                if (store.getState().annotation.job.instance?.annotations.hasUnsavedChanges()) {
                    setError('Save or undo your annotation changes before navigating with the guide.');
                    return;
                }
                history.push(step.route);
            } else {
                const jobID = step.route.match(/\/jobs\/(\d+)/)?.[1];
                if (jobID && store.getState().annotation.job.instance?.id !== Number(jobID)) {
                    if (Date.now() - started > 30000) {
                        setError('The demo job could not load. Check your access and retry.');
                        return;
                    }
                    timer = setTimeout(prepare, 150);
                    return;
                }
                window.dispatchEvent(new CustomEvent(GUIDE_UI_EVENT, { detail: step.panel ?? 'closed' }));
                const node = step.target ? Array.from(document.querySelectorAll<HTMLElement>(step.target))
                    .find((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden') : null;
                if (!step.target || node) {
                    setTarget(node ?? null);
                    setReady(true);
                    return;
                }
            }
            if (Date.now() - started > 30000) {
                setError('This step could not load. Check access to the demo task and the AutoLabel service, then retry.');
                return;
            }
            timer = setTimeout(prepare, 150);
        };
        prepare();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [active, step, retry]);

    const open = (): void => { setChooser(true); };
    const start = (id: Journey): void => {
        if (store.getState().annotation.job.instance?.annotations.hasUnsavedChanges()) {
            setError('Save or undo your annotation changes before starting a guide.');
            return;
        }
        setChooser(false);
        setCurrent(0);
        setJourney(id);
    };

    return (
        <GuideContext.Provider value={{ active, open }}>
            {children}
            <Modal
                open={user?.username === 'test_demo' && chooser}
                title={<Space><CompassOutlined />Discover AI-X AutoLabel</Space>}
                width={760}
                className='cvat-demo-guide-dialog'
                onCancel={() => setChooser(false)}
                footer={<Button onClick={() => setChooser(false)}>Skip for now</Button>}
            >
                <Typography.Paragraph type='secondary'>
                    Choose a short guided walkthrough. Explore existing results or preview task setup.
                    The guide does not upload data, run AI or change annotations.
                </Typography.Paragraph>
                {error && <Alert type='warning' message={error} />}
                <div className='cvat-demo-guide-choices'>
                    {JOURNEYS.map((item) => (
                        <Card key={item.id} size='small'>
                            <Typography.Text type='secondary'>{item.kind}</Typography.Text>
                            <Typography.Title level={5}>{item.title}</Typography.Title>
                            <Typography.Paragraph>{item.description}</Typography.Paragraph>
                            <Button
                                type='link'
                                disabled={!journeys[item.id].length}
                                onClick={() => start(item.id)}
                                aria-label={item.title}
                                icon={<ArrowRightOutlined />}
                            >
                                Start tour
                            </Button>
                        </Card>
                    ))}
                </div>
            </Modal>
            <Modal
                open={active && !ready}
                title={error ? 'The guide needs your attention' : 'Preparing your walkthrough'}
                className='cvat-demo-guide-dialog'
                onCancel={() => stop()}
                footer={(
                    <Space>
                        <Button onClick={() => stop(true)}>Back to guide</Button>
                        {error && <Button type='primary' onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
                    </Space>
                )}
            >
                {error ? <Alert type='warning' showIcon message={error} /> : <Spin tip='Opening the demo and its controls'><div /></Spin>}
            </Modal>
            <Tour
                open={active && ready}
                current={current}
                onChange={(value) => { setReady(false); setCurrent(value); }}
                onClose={() => stop()}
                onFinish={() => stop(true)}
                disabledInteraction
                zIndex={2100}
                steps={steps.map((item, index) => ({
                    title: item.title,
                    description: item.description,
                    target: index === current ? target : null,
                    placement: item.placement ?? 'right',
                    nextButtonProps: { children: index === steps.length - 1 ? 'Finish' : 'Next' },
                    prevButtonProps: { children: 'Back' },
                }))}
            />
        </GuideContext.Provider>
    );
}

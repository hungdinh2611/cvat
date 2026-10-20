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
    const [showPreparing, setShowPreparing] = useState(false);
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
        setShowPreparing(false);
        if (!active || ready) return undefined;
        const timer = setTimeout(() => setShowPreparing(true), 300);
        return () => clearTimeout(timer);
    }, [active, ready, step]);

    useEffect(() => {
        if (!active || !step) return undefined;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const started = Date.now();
        let previousNode: HTMLElement | null = null;
        let previousRect: DOMRect | null = null;
        let stableSince = 0;
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
                // CVAT reuses the annotation route component between job URLs.
                // Unmount it first so its previous job is closed before opening another.
                const switchingJobs = /\/jobs\/\d+/.test(routeRef.current) && /\/jobs\/\d+/.test(step.route);
                history.push(switchingJobs ? '/tasks' : step.route);
            } else {
                const jobID = step.route.match(/\/jobs\/(\d+)/)?.[1];
                if (jobID && store.getState().annotation.job.instance?.id !== Number(jobID)) {
                    if (Date.now() - started > 30000) {
                        setError('The demo job could not load. Check your access and retry.');
                        return;
                    }
                    timer = setTimeout(prepare, 80);
                    return;
                }
                window.dispatchEvent(new CustomEvent(GUIDE_UI_EVENT, { detail: step.panel ?? 'closed' }));
                const node = step.target ? Array.from(document.querySelectorAll<HTMLElement>(step.target))
                    .find((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden') : null;
                if (!step.target) {
                    setReady(true);
                    return;
                }
                if (node) {
                    if (previousNode !== node) {
                        node.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' });
                    }
                    const rect = node.getBoundingClientRect();
                    const moving = !previousRect || previousNode !== node ||
                        ['x', 'y', 'width', 'height'].some((key: 'x' | 'y' | 'width' | 'height') => (
                            Math.abs(rect[key] - previousRect![key]) > 0.5
                        ));
                    if (moving) {
                        previousNode = node;
                        previousRect = rect;
                        stableSince = Date.now();
                    }
                    if (Date.now() - stableSince >= 240) {
                        setTarget(node);
                        setReady(true);
                        return;
                    }
                } else {
                    previousNode = null;
                    previousRect = null;
                }
            }
            if (Date.now() - started > 30000) {
                setError('This step could not load. Check access to the demo task and the AutoLabel service, then retry.');
                return;
            }
            timer = setTimeout(prepare, 80);
        };
        prepare();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [active, step, retry]);

    useEffect(() => {
        if (!ready || !target || typeof ResizeObserver === 'undefined') return undefined;
        // Remote progress and form content can resize a target after it first appears.
        // AntD Tour recalculates its mask on resize, but does not observe the target.
        const updatePosition = (): void => { window.dispatchEvent(new Event('resize')); };
        const observer = new ResizeObserver(updatePosition);
        observer.observe(target);
        if (target.parentElement) observer.observe(target.parentElement);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [ready, target]);

    // Large canvas targets leave no room outside their edges for the popover.
    // Place their explanation inside the viewport without covering the toolbar.
    const targetRect = target?.getBoundingClientRect();
    const overview = targetRect && targetRect.width > window.innerWidth * 0.65 &&
        targetRect.height > window.innerHeight * 0.65;
    const sideHasRoom = !targetRect || (step?.placement === 'left' ? targetRect.left >= 416 :
        window.innerWidth - targetRect.right >= 416);
    let placement = step?.placement ?? 'right';
    if (!sideHasRoom && (placement === 'left' || placement === 'right')) {
        placement = window.innerHeight - (targetRect?.bottom ?? 0) >= 260 ? 'bottom' : 'top';
    }
    const overviewStyle: React.CSSProperties | undefined = overview ? {
        position: 'fixed',
        left: Math.max(16, Math.min(targetRect.x + targetRect.width / 2 - 200, window.innerWidth - 416)),
        top: Math.max(16, targetRect.y + 16),
    } : undefined;

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
            {active && !ready && showPreparing && <Modal
                open
                centered
                width={440}
                title={error ? 'The guide needs your attention' : 'Preparing your walkthrough'}
                className='cvat-demo-guide-dialog cvat-demo-guide-preparing'
                onCancel={() => stop()}
                footer={(
                    <Space>
                        <Button onClick={() => stop(true)}>Back to guide</Button>
                        {error && <Button type='primary' onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
                    </Space>
                )}
            >
                {error ? <Alert type='warning' showIcon message={error} /> : (
                    <div className='cvat-demo-guide-loading' role='status' aria-live='polite'>
                        <Spin size='small' />
                        <Typography.Text type='secondary'>Opening the demo and its controls…</Typography.Text>
                    </div>
                )}
            </Modal>}
            <Tour
                open={active && ready}
                current={current}
                onChange={(value) => { setReady(false); setCurrent(value); }}
                onClose={() => stop()}
                onFinish={() => stop(true)}
                disabledInteraction
                gap={{ offset: 2, radius: 4 }}
                scrollIntoViewOptions={false}
                rootClassName='cvat-demo-tour'
                zIndex={2100}
                steps={steps.map((item, index) => ({
                    title: item.title,
                    description: item.description,
                    target: index === current ? target : null,
                    placement: index === current ? placement : item.placement ?? 'right',
                    style: index === current ? overviewStyle : undefined,
                    arrow: !overview,
                    nextButtonProps: { children: index === steps.length - 1 ? 'Finish' : 'Next' },
                    prevButtonProps: { children: 'Back' },
                }))}
            />
        </GuideContext.Provider>
    );
}

// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import Alert from 'antd/lib/alert';
import Form from 'antd/lib/form';
import InputNumber from 'antd/lib/input-number';
import Input from 'antd/lib/input';
import Modal from 'antd/lib/modal';
import Space from 'antd/lib/space';
import Text from 'antd/lib/typography/Text';

import {
    PrivacyRegion, PrivacyTrack, VmJob, vmApi,
} from './autolabel-api';
import T from './autolabel-text';
import { useAction } from './autolabel-common';

interface FormValues {
    start?: number;
    end?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    tracks?: string;
}

function parseTracks(text: string | undefined): PrivacyTrack[] {
    if (!text?.trim()) return [];
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error(T.invalidJson);
    return parsed;
}

interface Props {
    job: VmJob;
    open: boolean;
    onClose(): void;
    onCreated(job: VmJob): void;
}

function PrivacyRegionsModal({
    job, open, onClose, onCreated,
}: Props): JSX.Element {
    const [form] = Form.useForm<FormValues>();
    const [isBusy, run] = useAction();
    const lastFrame = Math.max(0, job.total_frames - 1);

    const submit = (): Promise<void> => run('create', async () => {
        // Field errors are already shown inline by the form.
        const values = await form.validateFields().catch(() => null);
        if (!values) return;
        const corners = [values.x1, values.y1, values.x2, values.y2];
        const regions: PrivacyRegion[] = corners.every((value) => typeof value === 'number') ? [{
            start: values.start ?? 0,
            end: values.end ?? 0,
            box: corners as PrivacyRegion['box'],
        }] : [];
        const tracks = parseTracks(values.tracks);
        if (!regions.length && !tracks.length) throw new Error(T.regionRequired);
        const created = await vmApi.privacyRegions(job.job_id, regions, tracks);
        form.resetFields();
        onCreated(created);
        onClose();
    });

    return (
        <Modal
            open={open}
            title={T.privacyTitle}
            okText={T.createRedacted}
            onOk={submit}
            onCancel={onClose}
            confirmLoading={isBusy('create')}
            width={640}
            destroyOnClose
            className='cvat-autolabel-privacy-modal'
        >
            <Alert type='warning' showIcon className='cvat-autolabel-block' message={T.privacyWarning} />
            <Text type='secondary'>{T.privacyIntro}</Text>
            {/* Shows the redacted video so pixel coordinates can be read off it; it has no speech to caption. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={vmApi.videoURL(job.job_id)} controls className='cvat-autolabel-privacy-video' />
            <Form form={form} layout='vertical' requiredMark={false} initialValues={{ start: 0, end: 0 }}>
                <Space wrap>
                    <Form.Item name='start' label={T.startFrame}>
                        <InputNumber min={0} max={lastFrame} precision={0} />
                    </Form.Item>
                    <Form.Item
                        name='end'
                        label={T.endFrame}
                        dependencies={['start']}
                        rules={[({ getFieldValue }) => ({
                            validator: (_, value?: number) => (
                                value === undefined || value >= (getFieldValue('start') ?? 0) ?
                                    Promise.resolve() : Promise.reject(new Error(`≥ ${T.startFrame}`))
                            ),
                        })]}
                    >
                        <InputNumber min={0} max={lastFrame} precision={0} />
                    </Form.Item>
                </Space>
                <Form.Item label={T.box}>
                    <Space wrap>
                        {(['x1', 'y1', 'x2', 'y2'] as const).map((key) => (
                            <Form.Item key={key} name={key} noStyle>
                                <InputNumber min={0} placeholder={key} />
                            </Form.Item>
                        ))}
                    </Space>
                </Form.Item>
                <Form.Item
                    name='tracks'
                    label={T.movingTracks}
                    rules={[{
                        validator: (_, value?: string) => {
                            try {
                                parseTracks(value);
                                return Promise.resolve();
                            } catch {
                                return Promise.reject(new Error(T.invalidJson));
                            }
                        },
                    }]}
                >
                    <Input.TextArea rows={3} placeholder={T.movingTracksHint} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export default React.memo(PrivacyRegionsModal);

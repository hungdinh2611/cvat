// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import Form from 'antd/lib/form';
import Upload, { UploadFile } from 'antd/lib/upload';
import Select from 'antd/lib/select';
import Radio from 'antd/lib/radio';
import Checkbox from 'antd/lib/checkbox';
import Collapse from 'antd/lib/collapse';
import Button from 'antd/lib/button';
import Progress from 'antd/lib/progress';
import Alert from 'antd/lib/alert';
import Text from 'antd/lib/typography/Text';
import { InboxOutlined, CloudUploadOutlined } from '@ant-design/icons';

import {
    VmCapabilities, VmJob, VmPipeline, uploadVideo,
} from './autolabel-api';
import T from './autolabel-text';
import { useAction } from './autolabel-common';

// The product default; other pipelines stay reachable for deliberate testing only.
const DEFAULT_PIPELINE = 'hybrid_frame';

const PIPELINE_VIEW: Record<string, { label: string; description: string }> = {
    hybrid_frame: {
        label: 'YOLO + ByteTrack + SAM3 (default)',
        description: 'Detects and tracks objects on every frame, then derives boxes from SAM3 masks.',
    },
    hybrid_propagate: {
        label: 'Hybrid + SAM propagation',
        description: 'Seeds objects with YOLO + ByteTrack and lets SAM3 propagate them.',
    },
    sam: {
        label: 'SAM only',
        description: 'Text-prompted SAM tracking.',
    },
};

// Classes mapped to the detector out of the box; others need a server-side mapping.
const SUGGESTED_CLASSES = ['car', 'person'];

interface FormValues {
    classes: string[];
    pipeline: VmPipeline;
    vlmEnabled: boolean;
}

interface Props {
    capabilities: VmCapabilities;
    onCreated(job: VmJob): void;
}

function UploadForm({ capabilities, onCreated }: Props): JSX.Element {
    const [form] = Form.useForm<FormValues>();
    const [files, setFiles] = useState<UploadFile[]>([]);
    const [progress, setProgress] = useState<number | null>(null);
    const [isBusy, run] = useAction();
    const pipelines = capabilities.pipelines?.length ? capabilities.pipelines : ['sam'];
    const initialPipeline = pipelines.includes(DEFAULT_PIPELINE) ? DEFAULT_PIPELINE : pipelines[0];

    const submit = (values: FormValues): Promise<void> => run('upload', async () => {
        const video = files[0]?.originFileObj;
        if (!video) throw new Error(T.videoRequired);
        setProgress(0);
        try {
            const job = await uploadVideo(video, {
                classes: values.classes.map((value) => value.trim()),
                variant: capabilities.hybrid_variant ?? 'sam3',
                // The pipeline field is only mounted when the server offers a choice.
                pipeline: values.pipeline ?? initialPipeline,
                vlm_enabled: values.vlmEnabled,
            }, setProgress);
            setFiles([]);
            onCreated(job);
        } finally {
            setProgress(null);
        }
    });

    return (
        <Form
            form={form}
            layout='vertical'
            className='cvat-autolabel-upload-form'
            requiredMark={false}
            disabled={isBusy('upload')}
            initialValues={{ classes: SUGGESTED_CLASSES, pipeline: initialPipeline, vlmEnabled: false }}
            onFinish={submit}
        >
            <Alert type='info' showIcon className='cvat-autolabel-block' message={T.privacyNote} />
            <Form.Item label={T.video} required>
                <Upload.Dragger
                    accept='video/*'
                    maxCount={1}
                    fileList={files}
                    beforeUpload={() => false}
                    onChange={({ fileList }) => setFiles(fileList.slice(-1))}
                    className='cvat-autolabel-video-dragger'
                >
                    <p className='ant-upload-drag-icon'><InboxOutlined /></p>
                    <p className='ant-upload-text'>{T.videoHint}</p>
                </Upload.Dragger>
            </Form.Item>
            <Form.Item
                name='classes'
                label={T.classes}
                extra={T.classesHint}
                rules={[{
                    validator: (_, value: string[] = []) => {
                        const names = value.map((name) => name.trim()).filter(Boolean);
                        const valid = names.length >= 1 && names.length <= 8 &&
                            new Set(names).size === names.length && names.every((name) => name.length <= 128);
                        return valid ? Promise.resolve() : Promise.reject(new Error(T.classesRule));
                    },
                }]}
            >
                <Select
                    mode='tags'
                    tokenSeparators={[',']}
                    options={SUGGESTED_CLASSES.map((name) => ({ value: name, label: name }))}
                />
            </Form.Item>
            <Form.Item name='vlmEnabled' valuePropName='checked'>
                <Checkbox>{T.vlmAudit}</Checkbox>
            </Form.Item>
            {pipelines.length > 1 && (
                <Collapse
                    ghost
                    size='small'
                    className='cvat-autolabel-block cvat-autolabel-advanced'
                    items={[{
                        key: 'advanced',
                        label: T.advanced,
                        forceRender: true,
                        children: (
                            <Form.Item name='pipeline' extra={T.advancedHint}>
                                <Radio.Group className='cvat-autolabel-pipeline-group'>
                                    {pipelines.map((value) => (
                                        <Radio key={value} value={value}>
                                            <Text strong>{PIPELINE_VIEW[value]?.label ?? value}</Text>
                                            {PIPELINE_VIEW[value] && (
                                                <Text type='secondary' className='cvat-autolabel-option-description'>
                                                    {PIPELINE_VIEW[value].description}
                                                </Text>
                                            )}
                                        </Radio>
                                    ))}
                                </Radio.Group>
                            </Form.Item>
                        ),
                    }]}
                />
            )}
            {progress !== null && (
                <div className='cvat-autolabel-block'>
                    <Text type='secondary'>{T.uploading}</Text>
                    <Progress percent={progress} size='small' />
                </div>
            )}
            <Button
                type='primary'
                htmlType='submit'
                block
                icon={<CloudUploadOutlined />}
                loading={isBusy('upload')}
                className='cvat-autolabel-submit-button'
            >
                {T.submit}
            </Button>
        </Form>
    );
}

export default React.memo(UploadForm);

// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import Form from 'antd/lib/form';
import Select from 'antd/lib/select';
import Radio from 'antd/lib/radio';
import Checkbox from 'antd/lib/checkbox';
import Collapse from 'antd/lib/collapse';
import Button from 'antd/lib/button';
import Alert from 'antd/lib/alert';
import Text from 'antd/lib/typography/Text';
import { PlayCircleOutlined } from '@ant-design/icons';

import { CombinedState } from 'reducers';
import {
    RunOptions, VmCapabilities, VmJob, VmPipeline, vmApi,
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

interface FormValues {
    classes: string[];
    pipeline: VmPipeline;
    vlmEnabled: boolean;
}

interface Props {
    capabilities: VmCapabilities;
    cvatJobID: number;
    onCreated(job: VmJob): void;
}

function UploadForm({ capabilities, cvatJobID, onCreated }: Props): JSX.Element {
    const [form] = Form.useForm<FormValues>();
    const labels = useSelector((state: CombinedState) => state.annotation.job.labels);
    const jobClasses = labels.map((label) => label.name);
    const [isBusy, run] = useAction();
    const pipelines = capabilities.pipelines?.length ? capabilities.pipelines : ['sam'];
    const initialPipeline = pipelines.includes(DEFAULT_PIPELINE) ? DEFAULT_PIPELINE : pipelines[0];

    useEffect(() => {
        form.setFieldsValue({ classes: jobClasses });
    }, [form, labels]);

    const submit = (values: FormValues): Promise<void> => run('upload', async () => {
        const options: RunOptions = {
            // Keep every current-job label in the request. The server uses SAM for the
            // whole run when any requested class lacks a detector mapping.
            classes: jobClasses,
            variant: capabilities.hybrid_variant ?? 'sam3',
            // The pipeline field is only mounted when the server offers a choice.
            pipeline: values.pipeline ?? initialPipeline,
            vlm_enabled: values.vlmEnabled,
        };
        onCreated(await vmApi.startFromCvatJob(cvatJobID, options));
    });

    return (
        <Form
            form={form}
            layout='vertical'
            className='cvat-autolabel-upload-form'
            requiredMark={false}
            disabled={isBusy('upload')}
            initialValues={{ classes: jobClasses, pipeline: initialPipeline, vlmEnabled: false }}
            onFinish={submit}
        >
            <Alert type='info' showIcon className='cvat-autolabel-block' message={T.privacyNote} />
            <Form.Item label={T.video}>
                <Text type='secondary'>{T.sourceThisJobHint}</Text>
            </Form.Item>
            <Form.Item
                name='classes'
                label={T.classes}
                extra={T.classesHint}
                rules={[{
                    validator: (_, value: string[] = []) => {
                        const valid = value.length >= 1;
                        return valid ? Promise.resolve() : Promise.reject(new Error(T.classesRule));
                    },
                }]}
            >
                <Select
                    mode='tags'
                    tokenSeparators={[',']}
                    options={jobClasses.map((name) => ({ value: name, label: name }))}
                    disabled
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
            <Button
                type='primary'
                htmlType='submit'
                block
                icon={<PlayCircleOutlined />}
                loading={isBusy('upload')}
                className='cvat-autolabel-submit-button'
            >
                {T.submitThisJob}
            </Button>
        </Form>
    );
}

export default React.memo(UploadForm);

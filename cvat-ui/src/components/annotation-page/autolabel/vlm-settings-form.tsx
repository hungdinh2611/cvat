// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Form from 'antd/lib/form';
import Input from 'antd/lib/input';
import message from 'antd/lib/message';
import Popconfirm from 'antd/lib/popconfirm';
import Space from 'antd/lib/space';
import Spin from 'antd/lib/spin';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import { ApiOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';

import { VlmSettings, vmApi } from './autolabel-api';
import T from './autolabel-text';
import { useAction } from './autolabel-common';

const OPENROUTER = { baseURL: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-5.5' };

interface FormValues {
    baseURL: string;
    model: string;
    apiKey: string;
}

function VlmSettingsForm(): JSX.Element {
    const [form] = Form.useForm<FormValues>();
    const [settings, setSettings] = useState<VlmSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, run] = useAction();

    const apply = (next: VlmSettings): void => {
        setSettings(next);
        form.setFieldsValue({
            baseURL: next.endpoint.replace(/\/chat\/completions$/, ''),
            model: next.model,
            apiKey: '',
        });
    };

    useEffect(() => {
        vmApi.vlmSettings().then(apply).catch((failure: Error) => setError(failure.message));
    }, []);

    // The key never stays in component state longer than one request.
    const save = (values: FormValues): Promise<void> => run('save', async () => {
        try {
            const body: { base_url: string; model: string; api_key?: string } = {
                base_url: values.baseURL.trim(), model: values.model.trim(),
            };
            if (values.apiKey) body.api_key = values.apiKey;
            await vmApi.saveVlmSettings(body);
            apply(await vmApi.vlmSettings());
            message.success(T.saved);
        } finally {
            form.setFieldValue('apiKey', '');
        }
    });

    if (error) return <Alert type='error' showIcon message={error} />;

    const usingDefault = settings?.mode === 'system' && !!settings.key_configured;
    let keyTag = { color: 'warning', label: T.keyMissing };
    if (settings?.mode === 'custom') keyTag = { color: 'success', label: T.keyPrivate };
    else if (usingDefault) keyTag = { color: 'blue', label: T.keyDefault };

    // The form stays mounted while loading so setFieldsValue always has a target.
    return (
        <Spin spinning={!settings}>
            <Form
                form={form}
                layout='vertical'
                requiredMark={false}
                onFinish={save}
                className='cvat-autolabel-vlm-settings'
            >
                {settings && (
                    <div className='cvat-autolabel-block'>
                        <Text type='secondary'>{`${T.vlmCurrent} `}</Text>
                        <Text strong>{settings.model}</Text>
                        <Tag color={keyTag.color} className='cvat-autolabel-key-tag'>{keyTag.label}</Tag>
                    </div>
                )}
                {usingDefault && <Alert type='info' showIcon className='cvat-autolabel-block' message={T.usingDefault} />}
                <Form.Item
                    name='baseURL'
                    label={T.baseURL}
                    rules={[{ required: true, type: 'url', pattern: /^https:\/\//i }]}
                >
                    <Input placeholder={OPENROUTER.baseURL} />
                </Form.Item>
                <Form.Item name='model' label={T.model} rules={[{ required: true, max: 200 }]}>
                    <Input placeholder={OPENROUTER.model} />
                </Form.Item>
                <Form.Item name='apiKey' label={T.apiKey} extra={T.apiKeyHint}>
                    <Input.Password autoComplete='new-password' />
                </Form.Item>
                <Space wrap>
                    <Button type='primary' htmlType='submit' icon={<SaveOutlined />} loading={isBusy('save')}>
                        {T.save}
                    </Button>
                    <Button
                        icon={<ApiOutlined />}
                        loading={isBusy('test')}
                        onClick={() => run('test', async () => {
                            await vmApi.testVlmSettings();
                            message.success(T.testOk);
                        })}
                    >
                        {T.test}
                    </Button>
                    <Button
                        type='link'
                        onClick={() => form.setFieldsValue({ baseURL: OPENROUTER.baseURL, model: OPENROUTER.model })}
                    >
                        {T.presetOpenRouter}
                    </Button>
                    {settings?.mode === 'custom' && (
                        <Popconfirm
                            title={settings.default_available ? T.deleteKeyToDefaultConfirm : T.deleteKeyConfirm}
                            onConfirm={() => run('delete', async () => {
                                await vmApi.deleteVlmKey();
                                apply(await vmApi.vlmSettings());
                                message.success(settings.default_available ? T.switchedToDefault : T.keyDeleted);
                            })}
                        >
                            <Button danger type='text' icon={<DeleteOutlined />} loading={isBusy('delete')}>
                                {settings.default_available ? T.deleteKeyToDefault : T.deleteKey}
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
                <Text type='secondary' className='cvat-autolabel-meta'>{T.runningJobsNote}</Text>
            </Form>
        </Spin>
    );
}

export default React.memo(VlmSettingsForm);

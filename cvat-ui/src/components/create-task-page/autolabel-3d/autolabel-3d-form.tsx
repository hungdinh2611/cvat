// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useRef, useState } from 'react';
import {
    Alert, Button, Form, Input, InputNumber, Progress, Radio, Select, Upload, notification,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import {
    DatasetFormat, DatasetMode, UploadJob, UploadOptions, UploadSession, uploadApi, uploadDataset,
} from './upload-api';

interface Props {
    tourPreview?: boolean;
}

interface FormValues {
    dataset_format: DatasetFormat;
    mode: DatasetMode;
    scene: string;
    max_frames: number;
}

const initialValues: FormValues = {
    dataset_format: 'nuscenes',
    mode: 'detect',
    scene: '',
    max_frames: 200,
};

function validArchive(file: File): boolean {
    return /\.(zip|tar\.gz|tgz)$/i.test(file.name);
}

function jobURL(job: UploadJob): string | null {
    return job.cvat_task_id && job.cvat_job_id ? `/tasks/${job.cvat_task_id}/jobs/${job.cvat_job_id}` : null;
}

export default function AutoLabel3DForm({ tourPreview = false }: Props): JSX.Element {
    const [form] = Form.useForm<FormValues>();
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [session, setSession] = useState<UploadSession | null>(null);
    const [uploadedBytes, setUploadedBytes] = useState(0);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [resultURL, setResultURL] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [format, setFormat] = useState<DatasetFormat>('nuscenes');
    const [mode, setMode] = useState<DatasetMode>('detect');
    const controllerRef = useRef<AbortController | null>(null);
    const busyRef = useRef(false);
    const autoForcedImport = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            controllerRef.current?.abort();
        };
    }, []);

    const startOrResume = async (values?: FormValues): Promise<void> => {
        if (tourPreview || busyRef.current) return;
        if (!session && !selectedFile) {
            setError('Choose a dataset archive to continue.');
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setError('');
        setResultURL(null);
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            const fields = values || form.getFieldsValue(true);
            const options: UploadOptions = session?.options || {
                filename: selectedFile!.name,
                size: selectedFile!.size,
                dataset_format: fields.dataset_format,
                mode: fields.mode,
                scene: fields.scene || '',
                max_frames: fields.max_frames,
            };
            const transfer = await uploadDataset(
                session?.file || selectedFile!,
                options,
                session,
                controller.signal,
                (nextSession) => {
                    if (mountedRef.current) {
                        setSession(nextSession);
                        setUploadedBytes(nextSession.uploadedBytes);
                    }
                },
            );
            const active = transfer.session;
            const finished = transfer.job;
            if (mountedRef.current) {
                setStatus('queued');
                setResultURL(jobURL(finished));
            }
            let current = finished;
            while (!['completed', 'failed', 'cancelled'].includes(current.status)) {
                await new Promise<void>((resolve, reject) => {
                    let timer: number | undefined;
                    const onAbort = (): void => {
                        if (timer !== undefined) window.clearTimeout(timer);
                        reject(new DOMException('Aborted', 'AbortError'));
                    };
                    const finish = (): void => {
                        controller.signal.removeEventListener('abort', onAbort);
                        resolve();
                    };
                    if (controller.signal.aborted) {
                        onAbort();
                        return;
                    }
                    timer = window.setTimeout(finish, 1500);
                    controller.signal.addEventListener('abort', onAbort, { once: true });
                });
                current = await uploadApi.status(active.jobID, controller.signal);
                if (mountedRef.current) {
                    setStatus(current.stage ? `${current.status}: ${current.stage}` : current.status);
                    setResultURL(jobURL(current));
                }
            }
            if (current.status !== 'completed') throw new Error(current.error || `3D job ${current.status}.`);
            if (mountedRef.current) setStatus('completed');
        } catch (submitError) {
            if (mountedRef.current && !controller.signal.aborted) {
                setError(submitError instanceof Error ? submitError.message : 'Upload failed.');
            }
        } finally {
            controllerRef.current = null;
            busyRef.current = false;
            if (mountedRef.current) setBusy(false);
        }
    };

    const onFormatChange = (next: DatasetFormat): void => {
        setFormat(next);
        if (next === 'kitti' && mode !== 'import') {
            autoForcedImport.current = true;
            setMode('import');
            form.setFieldValue('mode', 'import');
        } else if (next === 'nuscenes' && autoForcedImport.current) {
            autoForcedImport.current = false;
            setMode('detect');
            form.setFieldValue('mode', 'detect');
        }
    };

    const onModeChange = (next: DatasetMode): void => {
        autoForcedImport.current = false;
        setMode(next);
    };

    const progressPercent = session ? Math.floor((uploadedBytes * 100) / session.file.size) : 0;
    const progressLabel = session ? `${uploadedBytes.toLocaleString()} / ${session.file.size.toLocaleString()} bytes uploaded` : '';

    const uploadProps: UploadProps = {
        accept: '.zip,.tar.gz,.tgz',
        multiple: false,
        maxCount: 1,
        disabled: tourPreview || busy || Boolean(session),
        fileList,
        beforeUpload: (file) => {
            if (!validArchive(file)) {
                notification.error({ message: 'Choose a ZIP, TAR.GZ, or TGZ archive.' });
                return Upload.LIST_IGNORE;
            }
            setSelectedFile(file);
            setFileList([file as UploadFile]);
            setSession(null);
            setUploadedBytes(0);
            setError('');
            return false;
        },
        onRemove: () => {
            setFileList([]);
            setSelectedFile(null);
            setSession(null);
            setUploadedBytes(0);
        },
    };

    return (
        <div data-tour='create-3d-form' className='cvat-create-3d-form'>
            {tourPreview && (
                <Alert
                    type='info'
                    showIcon
                    message='Preview mode'
                    description='This guided preview shows the 3D dataset form. Inputs, file selection, and upload actions are disabled.'
                    style={{ marginBottom: 16 }}
                />
            )}
            <Form<FormValues>
                form={form}
                layout='vertical'
                initialValues={initialValues}
                onFinish={(values) => startOrResume(values)}
                disabled={tourPreview || busy || Boolean(session)}
            >
                <Form.Item label='Dataset archive' required data-tour='3d-file'>
                    <Upload.Dragger {...uploadProps}>
                        <p className='ant-upload-drag-icon'><InboxOutlined /></p>
                        <p className='ant-upload-text'>Select or drop a dataset archive</p>
                        <p className='ant-upload-hint'>ZIP, TAR.GZ, or TGZ</p>
                    </Upload.Dragger>
                </Form.Item>
                <Form.Item name='dataset_format' label='Dataset format' data-tour='3d-format' rules={[{ required: true }]}>
                    <Select onChange={onFormatChange} options={[
                        { value: 'nuscenes', label: 'nuScenes' },
                        { value: 'kitti', label: 'KITTI' },
                    ]} />
                </Form.Item>
                <Form.Item name='mode' label='Workflow' data-tour='3d-mode' rules={[{ required: true }]}>
                    <Radio.Group onChange={(event) => onModeChange(event.target.value)}>
                        <Radio value='detect' disabled={format === 'kitti'}>Run BEVFusion detection</Radio>
                        <Radio value='import'>Import existing annotations</Radio>
                    </Radio.Group>
                </Form.Item>
                {format === 'kitti' && <Alert type='info' showIcon message='KITTI supports annotation import. Detection is available for nuScenes.' style={{ marginBottom: 16 }} />}
                <Form.Item
                    name='scene'
                    label='Scene (optional)'
                    data-tour='3d-scene'
                    rules={[{ max: 40, message: 'Scene must be 40 characters or fewer.' }, { pattern: /^[a-zA-Z0-9_-]*$/, message: 'Use letters, numbers, underscores, or hyphens.' }]}
                >
                    <Input placeholder='Scene identifier' />
                </Form.Item>
                <Form.Item name='max_frames' label='Maximum frames' data-tour='3d-frames' rules={[
                    { required: true, message: 'Enter a frame limit.' },
                    {
                        type: 'number', min: 1, max: 200, message: 'Choose between 1 and 200 frames.',
                    },
                ]}>
                    <InputNumber min={1} max={200} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item>
                    <Button data-tour='3d-submit' type='primary' htmlType='submit' loading={busy} disabled={tourPreview || busy}>
                        {session ? 'Retry / check status' : 'Upload and process'}
                    </Button>
                </Form.Item>
            </Form>
            {session && (
                <div data-tour='3d-progress'>
                    <Progress percent={progressPercent} />
                    <div>{status || progressLabel}</div>
                </div>
            )}
            {resultURL && <Button href={resultURL} style={{ marginTop: 12 }}>Open result job</Button>}
            {error && <Alert type='error' showIcon message={error} style={{ marginTop: 16 }} />}
        </div>
    );
}

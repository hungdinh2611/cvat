// Copyright (C) 2019-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React from 'react';
import { useHistory, useLocation } from 'react-router';
import { Row, Col } from 'antd/lib/grid';
import Text from 'antd/lib/typography/Text';
import Radio from 'antd/lib/radio';

import AudioCreateTaskContent from 'audio/components/create-task-page/audio-create-task-content';
import { useDemoGuide } from 'components/demo-guide/demo-guide';
import AutoLabel3DForm from './autolabel-3d/autolabel-3d-form';
import CreateTaskContent, { CreateTaskData } from './create-task-content';

interface Props {
    onCreate: (data: CreateTaskData, onProgress?: (status: string) => void) => Promise<any>;
}

export default function CreateTaskPage(props: Props): JSX.Element {
    const { onCreate } = props;

    const location = useLocation();
    const history = useHistory();
    const { active: tourPreview } = useDemoGuide();

    let projectId = null;
    const params = new URLSearchParams(location.search);
    if (params.get('projectId')?.match(/^[1-9]+[0-9]*$/)) {
        projectId = +(params.get('projectId') as string);
    }
    const many = params.get('many') === 'true';
    const audio = params.get('type') === 'audio';
    const autoLabel3D = !audio && !many && !projectId && params.get('workflow') === 'autolabel3d';
    const handleCreate: typeof onCreate = (...onCreateParams) => onCreate(...onCreateParams);

    return (
        <Row justify='center' align='top' className='cvat-create-work-form-wrapper'>
            <Col md={20} lg={16} xl={14} xxl={9}>
                <Text className='cvat-title' data-tour='create-task-heading'>{audio ? 'Create a new audio task' : 'Create a new task'}</Text>
                {!audio && !many && !projectId && (
                    <div className='cvat-create-workflow-choice' data-tour='create-workflow'>
                        <Radio.Group
                            value={autoLabel3D ? 'autolabel3d' : 'standard'}
                            onChange={({ target }) => {
                                const next = new URLSearchParams(location.search);
                                if (target.value === 'autolabel3d') next.set('workflow', 'autolabel3d');
                                else next.delete('workflow');
                                history.replace({ pathname: location.pathname, search: next.toString() });
                            }}
                            options={[
                                { label: 'Standard CVAT task', value: 'standard' },
                                { label: 'AutoLabel 3D', value: 'autolabel3d' },
                            ]}
                            optionType='button'
                            buttonStyle='solid'
                        />
                        <Text type='secondary'>
                            {autoLabel3D ? 'Process a native dataset with AutoLabel, then open its CVAT result.' :
                                'Create an image, video or 3D point-cloud task. CVAT detects the dimension from your data.'}
                        </Text>
                    </div>
                )}
                {autoLabel3D && <AutoLabel3DForm tourPreview={tourPreview} />}
                {!autoLabel3D && (audio ? (
                    <AudioCreateTaskContent
                        projectId={projectId}
                        onCreate={handleCreate}
                    />
                ) : (
                    <CreateTaskContent
                        projectId={projectId}
                        onCreate={handleCreate}
                        many={many}
                    />
                ))}
            </Col>
        </Row>
    );
}

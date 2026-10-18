// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Button from 'antd/lib/button';
import Modal from 'antd/lib/modal';
import Text from 'antd/lib/typography/Text';

import T from './autolabel-text';

type Choice = 'local' | 'remote' | 'cancel';

interface Conflict {
    path: string;
    local: unknown;
    remote: unknown;
    choose(choice: Choice): void;
}

// Resolves a path such as "tracks/12/shapes/0/frames/7" inside a serialized collection.
function valueAt(data: any, path: string): unknown {
    const [kind, id, ...rest] = path.split('/');
    let row = data?.[kind]?.find((item: any) => String(item.id) === id);
    for (let index = 0; index < rest.length; index++) {
        const part = rest[index];
        if (part === 'frames') {
            index += 1;
            const frame = rest[index];
            row = row?.find((item: any) => String(item.frame) === frame);
        } else if (part === 'specs') {
            index += 1;
            const spec = rest[index];
            row = row?.find((item: any) => String(item.spec_id) === spec);
        } else {
            row = row?.[part];
        }
    }
    return row;
}

function Snapshot({ title, value }: { title: string; value: unknown }): JSX.Element {
    return (
        <div className='cvat-autolabel-conflict-side'>
            <Text strong>{title}</Text>
            <pre>{value === undefined ? T.conflictDeleted : JSON.stringify(value, null, 2)}</pre>
        </div>
    );
}

// cvat-core asks which value to keep when two sessions edited the same object.
// Without an answer the save waits, so this listener is mounted with the annotation page.
function SaveConflictModal(): JSX.Element | null {
    const [conflict, setConflict] = useState<Conflict | null>(null);

    useEffect(() => {
        const listener = (event: Event): void => setConflict((event as CustomEvent<Conflict>).detail);
        window.addEventListener('autolabel:save-conflict', listener);
        return () => window.removeEventListener('autolabel:save-conflict', listener);
    }, []);

    if (!conflict) return null;
    const resolve = (choice: Choice): void => {
        conflict.choose(choice);
        setConflict(null);
    };

    return (
        <Modal
            open
            title={T.conflictTitle}
            width={720}
            maskClosable={false}
            onCancel={() => resolve('cancel')}
            className='cvat-autolabel-conflict-modal'
            footer={[
                <Button key='cancel' onClick={() => resolve('cancel')}>{T.cancelSave}</Button>,
                <Button key='remote' onClick={() => resolve('remote')}>{T.keepRemote}</Button>,
                <Button key='local' type='primary' onClick={() => resolve('local')}>{T.keepLocal}</Button>,
            ]}
        >
            <Text>{T.conflictIntro}</Text>
            <Text code className='cvat-autolabel-conflict-path'>{conflict.path}</Text>
            <div className='cvat-autolabel-conflict-compare'>
                <Snapshot title={T.conflictLocal} value={valueAt(conflict.local, conflict.path)} />
                <Snapshot title={T.conflictRemote} value={valueAt(conflict.remote, conflict.path)} />
            </div>
        </Modal>
    );
}

export default React.memo(SaveConflictModal);

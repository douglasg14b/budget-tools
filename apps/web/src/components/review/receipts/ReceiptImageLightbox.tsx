import { Modal } from '@mantine/core';

import classes from './ReceiptImageLightbox.module.css';

type ReceiptImageLightboxProps = {
    readonly opened: boolean;
    readonly src: string;
    readonly onClose: () => void;
};

export function ReceiptImageLightbox({ opened, src, onClose }: ReceiptImageLightboxProps) {
    return (
        <Modal
            fullScreen
            opened={opened}
            padding={0}
            title="Receipt"
            classNames={{
                overlay: classes.overlay,
                content: classes.content,
                header: classes.header,
                title: classes.title,
                body: classes.body,
                close: classes.close,
            }}
            onClose={onClose}
        >
            <div className={classes.frame}>
                <img alt="" className={classes.image} src={src} />
            </div>
        </Modal>
    );
}

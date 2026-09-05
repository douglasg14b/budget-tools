import { describe, expect, it } from 'vitest';

import { cameraVideoConstraints, preferWideEnvironmentCamera, viewfinderZoom } from '../receiptCamera';

describe('cameraVideoConstraints', () => {
    it('asks for the rear camera and does not request a frame size', () => {
        expect(cameraVideoConstraints()).toEqual({
            facingMode: { ideal: 'environment' },
        });
        expect(cameraVideoConstraints()).not.toHaveProperty('width');
        expect(cameraVideoConstraints()).not.toHaveProperty('height');
    });
});

describe('viewfinderZoom', () => {
    it('uses optical 1x when the track can do it', () => {
        expect(viewfinderZoom({ min: 0.5, max: 8 })).toBe(1);
        expect(viewfinderZoom({ min: 1, max: 8 })).toBe(1);
    });

    it('cannot widen a telephoto-only track', () => {
        expect(viewfinderZoom({ min: 2, max: 5 })).toBe(2);
    });
});

describe('preferWideEnvironmentCamera', () => {
    it('switches off a telephoto module when a 1x rear camera exists', () => {
        expect(
            preferWideEnvironmentCamera(
                [
                    {
                        deviceId: 'tele',
                        label: 'camera2 2, facing back',
                        facingMode: ['environment'],
                        zoomMin: 2,
                    },
                    {
                        deviceId: 'wide',
                        label: 'camera2 0, facing back',
                        facingMode: ['environment'],
                        zoomMin: 1,
                    },
                ],
                'tele',
            ),
        ).toBe('wide');
    });

    it('prefers a wide label over telephoto when zoom is unknown', () => {
        expect(
            preferWideEnvironmentCamera(
                [
                    { deviceId: 'tele', label: 'Back Telephoto Camera 2x', facingMode: ['environment'] },
                    { deviceId: 'wide', label: 'Back Camera', facingMode: ['environment'] },
                ],
                'tele',
            ),
        ).toBe('wide');
    });

    it('stays on the current camera when it is already the wide rear one', () => {
        expect(
            preferWideEnvironmentCamera(
                [
                    {
                        deviceId: 'wide',
                        label: 'camera2 0, facing back',
                        facingMode: ['environment'],
                        zoomMin: 1,
                    },
                    {
                        deviceId: 'tele',
                        label: 'camera2 2, facing back',
                        facingMode: ['environment'],
                        zoomMin: 2,
                    },
                ],
                'wide',
            ),
        ).toBeUndefined();
    });

    it('ignores the front camera', () => {
        expect(
            preferWideEnvironmentCamera(
                [
                    { deviceId: 'front', label: 'Front Camera', facingMode: ['user'], zoomMin: 1 },
                    { deviceId: 'tele', label: 'camera2 2, facing back', facingMode: ['environment'], zoomMin: 2 },
                ],
                'tele',
            ),
        ).toBeUndefined();
    });
});

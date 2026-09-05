export type ZoomRange = {
    readonly min: number;
    readonly max: number;
};

export type CameraCandidate = {
    readonly deviceId: string;
    readonly label: string;
    readonly facingMode: readonly string[];
    readonly zoomMin?: number;
};

type CameraTrackCapabilities = MediaTrackCapabilities & {
    readonly zoom?: { readonly min?: number; readonly max?: number };
};

type CameraTrackSettings = MediaTrackSettings;

type CameraConstraintSet = MediaTrackConstraintSet & {
    zoom?: number;
};

/**
 * Rear camera only. Do not ask for a size: high ideals make Chrome pick a 2x telephoto module.
 */
export function cameraVideoConstraints(): MediaTrackConstraints {
    return {
        facingMode: { ideal: 'environment' },
    };
}

/**
 * Optical 1x when the track can do it. Telephoto-only tracks cannot go wider than their min.
 */
export function viewfinderZoom(range: ZoomRange): number {
    if (range.min > 1) {
        return range.min;
    }
    if (range.max < 1) {
        return range.max;
    }
    return 1;
}

/**
 * Prefer the 1x wide rear camera over telephoto / ultrawide modules.
 * Returns a different deviceId only when a better camera exists.
 */
export function preferWideEnvironmentCamera(
    cameras: readonly CameraCandidate[],
    currentDeviceId: string | undefined,
): string | undefined {
    const rear = cameras.filter(isRearCamera);
    if (rear.length === 0) {
        return undefined;
    }
    const ranked = [...rear].sort((left, right) => wideCameraScore(right) - wideCameraScore(left));
    const best = ranked[0];
    if (!best || best.deviceId === currentDeviceId) {
        return undefined;
    }
    return best.deviceId;
}

/**
 * Open the rear camera, force 1x zoom, and switch off a telephoto module when a wider one exists.
 */
export async function openReceiptCameraStream(
    mediaDevices: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'> = navigator.mediaDevices,
): Promise<MediaStream> {
    const stream = await mediaDevices.getUserMedia({
        video: cameraVideoConstraints(),
        audio: false,
    });
    await applyViewfinderZoom(stream);
    const wideDeviceId = await wideCameraDeviceIdIfNeeded(mediaDevices, stream);
    if (!wideDeviceId) {
        return stream;
    }
    try {
        const wideStream = await mediaDevices.getUserMedia({
            video: {
                deviceId: { exact: wideDeviceId },
            },
            audio: false,
        });
        await applyViewfinderZoom(wideStream);
        stopTracks(stream);
        return wideStream;
    } catch {
        return stream;
    }
}

export async function applyViewfinderZoom(stream: MediaStream): Promise<void> {
    const track = stream.getVideoTracks()[0];
    if (!track) {
        return;
    }
    const range = trackZoomRange(track);
    if (!range) {
        return;
    }
    const zoom = viewfinderZoom(range);
    const constraint: CameraConstraintSet = { zoom };
    try {
        await track.applyConstraints({ advanced: [constraint] });
    } catch {
        try {
            await track.applyConstraints(constraint);
        } catch {
            return;
        }
    }
}

function isRearCamera(camera: CameraCandidate): boolean {
    if (camera.facingMode.includes('environment')) {
        return true;
    }
    if (camera.facingMode.includes('user')) {
        return false;
    }
    if (/front|user|face/i.test(camera.label)) {
        return false;
    }
    return /back|rear|environment/i.test(camera.label);
}

function wideCameraScore(camera: CameraCandidate): number {
    const label = camera.label.toLowerCase();
    let score = 0;
    if (/tele|telephoto|\b2x\b|\b3x\b|zoom/i.test(label)) {
        score -= 10;
    }
    if (/ultra|uw\b|0\.5/i.test(label)) {
        score -= 3;
    }
    if (/\bwide\b/.test(label) && !/ultra/.test(label)) {
        score += 8;
    }
    if (camera.zoomMin != null) {
        if (camera.zoomMin > 1) {
            score -= 10;
        } else if (camera.zoomMin >= 0.8) {
            score += 5;
        } else {
            score += 1;
        }
    }
    return score;
}

async function wideCameraDeviceIdIfNeeded(
    mediaDevices: Pick<MediaDevices, 'enumerateDevices'>,
    stream: MediaStream,
): Promise<string | undefined> {
    const track = stream.getVideoTracks()[0];
    if (!track) {
        return undefined;
    }
    const settings = track.getSettings() as CameraTrackSettings;
    const currentRange = trackZoomRange(track);
    if (currentRange && currentRange.min <= 1) {
        return undefined;
    }
    const devices = await mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput').map(cameraCandidateFromDevice);
    return preferWideEnvironmentCamera(cameras, settings.deviceId);
}

function cameraCandidateFromDevice(device: MediaDeviceInfo): CameraCandidate {
    const info = device as InputDeviceInfo;
    const capabilities =
        typeof info.getCapabilities === 'function' ? (info.getCapabilities() as CameraTrackCapabilities) : undefined;
    const facingMode = capabilities?.facingMode ?? [];
    const zoomMin = capabilities?.zoom?.min;
    return {
        deviceId: device.deviceId,
        label: device.label,
        facingMode,
        ...(typeof zoomMin === 'number' ? { zoomMin } : {}),
    };
}

function trackZoomRange(track: MediaStreamTrack): ZoomRange | null {
    if (typeof track.getCapabilities !== 'function') {
        return null;
    }
    const zoom = (track.getCapabilities() as CameraTrackCapabilities).zoom;
    if (!zoom || typeof zoom.min !== 'number' || typeof zoom.max !== 'number') {
        return null;
    }
    return { min: zoom.min, max: zoom.max };
}

function stopTracks(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
        track.stop();
    });
}

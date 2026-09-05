export type VideoCoverCropInput = {
    readonly videoWidth: number;
    readonly videoHeight: number;
    readonly displayWidth: number;
    readonly displayHeight: number;
};

export type VideoCoverCrop = {
    readonly sourceX: number;
    readonly sourceY: number;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
};

/**
 * Source rectangle for `object-fit: cover` so a snap matches the on-screen viewfinder.
 */
export function videoCoverCrop(input: VideoCoverCropInput): VideoCoverCrop {
    const { videoWidth, videoHeight, displayWidth, displayHeight } = input;
    if (videoWidth <= 0 || videoHeight <= 0) {
        return { sourceX: 0, sourceY: 0, sourceWidth: 0, sourceHeight: 0 };
    }
    if (displayWidth <= 0 || displayHeight <= 0) {
        return { sourceX: 0, sourceY: 0, sourceWidth: videoWidth, sourceHeight: videoHeight };
    }
    const videoAspect = videoWidth / videoHeight;
    const displayAspect = displayWidth / displayHeight;
    if (videoAspect > displayAspect) {
        const sourceWidth = videoHeight * displayAspect;
        return {
            sourceX: (videoWidth - sourceWidth) / 2,
            sourceY: 0,
            sourceWidth,
            sourceHeight: videoHeight,
        };
    }
    const sourceHeight = videoWidth / displayAspect;
    return {
        sourceX: 0,
        sourceY: (videoHeight - sourceHeight) / 2,
        sourceWidth: videoWidth,
        sourceHeight,
    };
}

/**
 * Draw a cover-cropped source into `canvas`. False when the source or crop is empty.
 */
export function drawCoverFrame(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    canvas: HTMLCanvasElement,
    displayWidth: number,
    displayHeight: number,
): boolean {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
        return false;
    }
    const crop = videoCoverCrop({
        videoWidth: sourceWidth,
        videoHeight: sourceHeight,
        displayWidth,
        displayHeight,
    });
    if (crop.sourceWidth <= 0 || crop.sourceHeight <= 0) {
        return false;
    }
    const width = Math.max(1, Math.round(crop.sourceWidth));
    const height = Math.max(1, Math.round(crop.sourceHeight));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
        return false;
    }
    context.drawImage(source, crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight, 0, 0, width, height);
    return true;
}

/**
 * Draw the cover-cropped viewfinder into `canvas`. False when the video has no frame yet.
 */
export function drawVideoCoverFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean {
    return drawCoverFrame(video, video.videoWidth, video.videoHeight, canvas, video.clientWidth, video.clientHeight);
}

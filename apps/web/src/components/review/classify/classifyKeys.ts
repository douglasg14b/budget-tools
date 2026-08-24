/** Bindings for the classify loop. Left hand + thumbs; skip/undo are secondary. */
export const CLASSIFY_HOTKEYS = {
    accept: 'space',
    acceptAllCertain: 'shift+space',
    next: 'j',
    previous: 'k',
    reject: 'x',
    undo: 'mod+z',
} as const;

export const CLASSIFY_KEY_LABELS = {
    accept: 'Space',
    acceptAllCertain: '⇧ Space',
    next: 'J',
    previous: 'K',
    reject: 'X',
    undo: undoKeyLabel(),
} as const;

/** Marks an overlay that should pause classify hotkeys. */
export const CLASSIFY_DIALOG_ATTR = 'data-classify-dialog';

function undoKeyLabel(): string {
    if (typeof navigator === 'undefined') {
        return 'Ctrl+Z';
    }
    return /mac|iphone|ipad/i.test(navigator.platform) || /mac/i.test(navigator.userAgent) ? '⌘Z' : 'Ctrl+Z';
}

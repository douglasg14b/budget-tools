import { useEffect, useState } from 'react';

const ROW_SELECTOR = '[data-row-id]';

/**
 * The row in the middle of what is on screen, so scoring follows the scroll instead of a focused
 * card. Rows mark themselves with `data-row-id`; `rowsKey` changes whenever the rendered rows do.
 */
export function useVisibleRowAnchor(list: HTMLElement | null, rowsKey: string): string | undefined {
    const [anchorId, setAnchorId] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!list || !rowsKey) {
            return;
        }
        const visible = new Set<Element>();
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    visible.add(entry.target);
                } else {
                    visible.delete(entry.target);
                }
            }
            const onScreen = [...list.querySelectorAll(ROW_SELECTOR)].filter((row) => visible.has(row));
            const middle = onScreen[Math.floor(onScreen.length / 2)];
            const id = middle?.getAttribute('data-row-id') ?? undefined;
            if (id) {
                setAnchorId(id);
            }
        });
        for (const row of list.querySelectorAll(ROW_SELECTOR)) {
            observer.observe(row);
        }
        return () => {
            observer.disconnect();
        };
    }, [list, rowsKey]);

    return anchorId;
}

import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { ActionIcon, Button, Collapse, UnstyledButton } from '@mantine/core';
import { IconCheck, IconChevronLeft, IconChevronRight, IconSearch, IconX } from '@tabler/icons-react';
import type { MutableRefObject } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { ClassifyFocus } from '../classify/ClassifyWorkspace';
import type { ClassifySession } from '../classify/useClassifySession';
import type { LiveClassification } from '../classify/useLiveClassification';
import { QueueSearchInput } from '../QueueSearchInput';
import classes from './MobileClassifySheet.module.css';
import { useSwipeNavigation } from './useSwipeNavigation';

type MobileClassifySheetProps = {
    classify: ClassifySession;
    displayedItemRef: MutableRefObject<CategorizationQueueItemDto | undefined>;
    hasMoreNewer: boolean;
    hasMoreOlder: boolean;
    isExpandingNewer: boolean;
    isExpandingOlder: boolean;
    items: readonly CategorizationQueueItemDto[];
    live?: LiveClassification;
    onAcceptAllCertain: () => void;
    onClose: () => void;
    onNeedNewer: () => void;
    onNeedOlder: () => void;
    onSearchChange: (q: string | undefined) => void;
    searchValue: string | undefined;
};

/**
 * One transaction filling the phone. Swipe or use the thumb bar to move between transactions;
 * search and bulk actions fold away under the top bar so the card keeps the screen.
 */
export function MobileClassifySheet({
    classify,
    displayedItemRef,
    hasMoreNewer,
    hasMoreOlder,
    isExpandingNewer,
    isExpandingOlder,
    items,
    live,
    onAcceptAllCertain,
    onClose,
    onNeedNewer,
    onNeedOlder,
    onSearchChange,
    searchValue,
}: MobileClassifySheetProps) {
    const [surface, setSurface] = useState<HTMLDivElement | null>(null);
    const [card, setCard] = useState<HTMLDivElement | null>(null);
    const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);
    const [toolsOpen, setToolsOpen] = useState(Boolean(searchValue));
    const currentId = classify.current?.transaction.id;
    const splitOpen = Boolean(currentId && classify.splitDrafts[currentId]);
    const { tally } = classify;
    const certainCount = classify.certainRemaining.length;

    useSwipeNavigation({
        surface,
        card,
        enabled: !splitOpen,
        onSwipe: (step) => {
            if (step === 'next') {
                classify.goNext();
            } else {
                classify.goPrevious();
            }
        },
    });

    useEffect(() => {
        surface?.scrollTo({ top: 0 });
    }, [currentId, surface]);

    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    // Portaled: the shell's page column is its own stacking context, which would pin the sheet
    // under the tab bar whatever its z-index.
    return createPortal(
        <section className={classes.sheet} aria-label="Classify transaction" data-live={live ? true : undefined}>
            <header className={classes.top}>
                <ActionIcon aria-label="Back to list" size="xl" variant="subtle" color="gray" onClick={onClose}>
                    <IconX size={22} />
                </ActionIcon>
                <div className={classes.position}>
                    <span className={classes.positionCount}>
                        {classify.position} of {items.length}
                        {hasMoreOlder ? '+' : ''}
                    </span>
                    <span className={classes.positionLeft}>
                        {tally.remaining > 0 ? `${tally.remaining} left` : 'All decided'}
                        {tally.accepted > 0 ? ` · ${tally.accepted} accepted` : ''}
                    </span>
                </div>
                <ActionIcon
                    aria-label="Search and bulk actions"
                    aria-expanded={toolsOpen}
                    size="xl"
                    variant={toolsOpen ? 'light' : 'subtle'}
                    color="gray"
                    onClick={() => {
                        setToolsOpen((open) => !open);
                    }}
                >
                    <IconSearch size={20} />
                </ActionIcon>
            </header>
            <div className={classes.track} aria-hidden="true">
                <span
                    className={classes.fill}
                    style={{ width: `${items.length === 0 ? 0 : (tally.decided / items.length) * 100}%` }}
                />
            </div>
            <Collapse expanded={toolsOpen}>
                <div className={classes.tools}>
                    <QueueSearchInput compact value={searchValue} onChange={onSearchChange} />
                    {certainCount > 0 ? (
                        <Button
                            fullWidth
                            leftSection={<IconCheck size={18} />}
                            variant="light"
                            onClick={() => {
                                onAcceptAllCertain();
                                setToolsOpen(false);
                            }}
                        >
                            Accept all {certainCount} certain
                        </Button>
                    ) : null}
                </div>
            </Collapse>
            <div ref={setSurface} className={classes.body}>
                <div ref={setCard} className={classes.card}>
                    <ClassifyFocus
                        chrome="mobile"
                        classify={classify}
                        displayedItemRef={displayedItemRef}
                        hasMoreNewer={hasMoreNewer}
                        hasMoreOlder={hasMoreOlder}
                        isExpandingNewer={isExpandingNewer}
                        isExpandingOlder={isExpandingOlder}
                        items={items}
                        live={live}
                        onNeedNewer={onNeedNewer}
                        onNeedOlder={onNeedOlder}
                        renderActions={({ canAccept }) =>
                            actionSlot
                                ? createPortal(
                                      <ThumbBar
                                          canAccept={canAccept}
                                          canGoNext={classify.canGoNext}
                                          canGoPrevious={classify.canGoPrevious}
                                          onAccept={classify.acceptCurrent}
                                          onNext={classify.goNext}
                                          onPrevious={classify.goPrevious}
                                          onReject={classify.rejectCurrent}
                                      />,
                                      actionSlot,
                                  )
                                : null
                        }
                    />
                </div>
            </div>
            {/* Outside the swiped card: a transformed ancestor would drag the bar along with it. */}
            <div ref={setActionSlot} className={classes.actionSlot} />
        </section>,
        document.body,
    );
}

type ThumbBarProps = {
    canAccept: boolean;
    canGoNext: boolean;
    canGoPrevious: boolean;
    onAccept: () => void;
    onNext: () => void;
    onPrevious: () => void;
    onReject: () => void;
};

function ThumbBar({ canAccept, canGoNext, canGoPrevious, onAccept, onNext, onPrevious, onReject }: ThumbBarProps) {
    return (
        <div className={classes.thumbBar}>
            <UnstyledButton
                aria-label="Previous transaction"
                className={classes.step}
                disabled={!canGoPrevious}
                onClick={onPrevious}
            >
                <IconChevronLeft size={22} />
            </UnstyledButton>
            <Button className={classes.reject} size="lg" variant="default" onClick={onReject}>
                Reject
            </Button>
            <Button
                className={classes.accept}
                disabled={!canAccept}
                leftSection={<IconCheck size={20} />}
                size="lg"
                onClick={onAccept}
            >
                Accept
            </Button>
            <UnstyledButton
                aria-label="Next transaction"
                className={classes.step}
                disabled={!canGoNext}
                onClick={onNext}
            >
                <IconChevronRight size={22} />
            </UnstyledButton>
        </div>
    );
}

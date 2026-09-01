import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

import type { PracticeReceipt } from './practiceReceipts';

type PracticeReceiptsContextValue = {
    readonly receipts: readonly PracticeReceipt[];
    readonly setReceipts: Dispatch<SetStateAction<PracticeReceipt[]>>;
};

const PracticeReceiptsContext = createContext<PracticeReceiptsContextValue | null>(null);

/**
 * Session-only Practice receipts shared by Classify capture and the inbox.
 */
export function PracticeReceiptsProvider({ children }: { readonly children: ReactNode }) {
    const [receipts, setReceipts] = useState<PracticeReceipt[]>([]);
    const value = useMemo(() => ({ receipts, setReceipts }), [receipts]);
    return <PracticeReceiptsContext.Provider value={value}>{children}</PracticeReceiptsContext.Provider>;
}

export function usePracticeReceipts(): PracticeReceiptsContextValue {
    const value = useContext(PracticeReceiptsContext);
    if (!value) {
        throw new Error('usePracticeReceipts requires PracticeReceiptsProvider');
    }
    return value;
}

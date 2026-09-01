import { getOperatingModeOptions } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';

import { ReceiptsInbox } from '../components/review/receipts/ReceiptsInbox';
import type { OperatingMode } from '../operatingMode/operatingModeCopy';
import { operatingModeReceiptsNote } from '../operatingMode/operatingModeCopy';
import classes from './ReceiptsPage.module.css';

export function ReceiptsPage() {
    const modeQuery = useQuery(getOperatingModeOptions());
    const mode: OperatingMode = modeQuery.data?.mode ?? 'practice';

    return (
        <div className={classes.page}>
            <header className={classes.header}>
                <div className={classes.headerCopy}>
                    <p className={classes.kicker}>Tapes</p>
                    <h1 className={classes.title}>Receipts</h1>
                    <p className={classes.lede}>
                        Capture a pile of stills without picking a charge first. Exact unique pairs bind themselves;
                        tips and misses wait for you.
                    </p>
                </div>
                <p className={classes.note} data-mode={mode}>
                    {operatingModeReceiptsNote(mode)}
                </p>
            </header>
            <ReceiptsInbox live={mode === 'live'} />
        </div>
    );
}

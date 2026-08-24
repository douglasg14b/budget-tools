import classes from './ClassifyShortcuts.module.css';
import { CLASSIFY_KEY_LABELS } from './classifyKeys';

type ShortcutRow = {
    readonly action: string;
    readonly keys: readonly string[];
};

type ClassifyShortcutsProps = {
    certainAvailable: boolean;
};

export function ClassifyShortcuts({ certainAvailable }: ClassifyShortcutsProps) {
    return (
        <aside className={classes.card} aria-label="Keyboard shortcuts">
            <p className={classes.heading}>Keys</p>
            <ul className={classes.list}>
                {SHORTCUTS.map((row) => (
                    <li
                        key={row.action}
                        className={classes.row}
                        data-dimmed={row.optional && !certainAvailable ? true : undefined}
                    >
                        <span className={classes.keys}>
                            {row.keys.map((key) => (
                                <kbd key={key} className={classes.key}>
                                    {key}
                                </kbd>
                            ))}
                        </span>
                        <span className={classes.action}>{row.action}</span>
                    </li>
                ))}
            </ul>
        </aside>
    );
}

const SHORTCUTS: readonly (ShortcutRow & { optional?: boolean })[] = [
    { keys: [CLASSIFY_KEY_LABELS.accept], action: 'Accept suggestion' },
    { keys: [CLASSIFY_KEY_LABELS.reject], action: 'Reject' },
    { keys: ['1–3'], action: 'Other category' },
    { keys: [CLASSIFY_KEY_LABELS.next, CLASSIFY_KEY_LABELS.previous], action: 'Next / previous' },
    { keys: [CLASSIFY_KEY_LABELS.acceptAllCertain], action: 'Accept all certain', optional: true },
    { keys: [CLASSIFY_KEY_LABELS.undo], action: 'Undo last' },
];

import { Button, Select, TextInput, UnstyledButton } from '@mantine/core';

import { formatYnabAmount } from '../formatYnabAmount';
import classes from './ClassifySplitEditor.module.css';
import type { CategoryChoice, CategorySelectGroup } from './flattenCategoryChoices';
import type { SplitLine } from './splitLines';
import { seedSingleSplitLine, splitRemainder } from './splitLines';

type ClassifySplitEditorProps = {
    categoryGroups: readonly CategorySelectGroup[];
    choicesById: ReadonlyMap<string, CategoryChoice>;
    error: string | null;
    lines: readonly SplitLine[];
    onChange: (lines: readonly SplitLine[]) => void;
    onClose: () => void;
    transactionAmount: number;
};

export function ClassifySplitEditor({
    categoryGroups,
    choicesById,
    error,
    lines,
    onChange,
    onClose,
    transactionAmount,
}: ClassifySplitEditorProps) {
    const remainder = splitRemainder(lines, transactionAmount);

    return (
        <div className={classes.editor}>
            <div className={classes.header}>
                <p className={classes.title}>Split</p>
                <UnstyledButton className={classes.close} onClick={onClose}>
                    Cancel split
                </UnstyledButton>
            </div>
            <ul className={classes.lines}>
                {lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: lines are edited by position
                    <li key={index} className={classes.line}>
                        <TextInput
                            aria-label={`Amount for line ${index + 1}`}
                            className={classes.amount}
                            size="xs"
                            value={milliunitsToInput(line.amount)}
                            onChange={(event) => {
                                const amount = inputToMilliunits(event.currentTarget.value);
                                if (amount == null) {
                                    return;
                                }
                                onChange(replaceLine(lines, index, { ...line, amount }));
                            }}
                        />
                        <Select
                            aria-label={`Category for line ${index + 1}`}
                            className={classes.category}
                            data={[...categoryGroups]}
                            nothingFoundMessage="No matching category"
                            placeholder="Category"
                            searchable
                            size="xs"
                            value={line.categoryId || null}
                            onChange={(categoryId) => {
                                if (!categoryId) {
                                    return;
                                }
                                const choice = choicesById.get(categoryId);
                                if (!choice) {
                                    return;
                                }
                                onChange(
                                    replaceLine(lines, index, {
                                        ...line,
                                        categoryId: choice.id,
                                        categoryName: choice.name,
                                        categoryGroup: choice.groupName,
                                    }),
                                );
                            }}
                        />
                        <TextInput
                            aria-label={`Memo for line ${index + 1}`}
                            className={classes.memo}
                            placeholder="Memo"
                            size="xs"
                            value={line.memo ?? ''}
                            onChange={(event) => {
                                const memo = event.currentTarget.value.trim() || null;
                                onChange(replaceLine(lines, index, { ...line, memo }));
                            }}
                        />
                        <UnstyledButton
                            className={classes.remove}
                            disabled={lines.length <= 1}
                            onClick={() => {
                                onChange(lines.filter((_, lineIndex) => lineIndex !== index));
                            }}
                        >
                            Remove
                        </UnstyledButton>
                    </li>
                ))}
            </ul>
            <div className={classes.footer}>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => {
                        onChange([...lines, ...seedSingleSplitLine(remainder === 0 ? 0 : remainder)]);
                    }}
                >
                    Add line
                </Button>
                <p className={remainder === 0 ? classes.balanceOk : classes.balance}>
                    Left {formatYnabAmount(remainder)}
                </p>
            </div>
            {error ? <p className={classes.error}>{error}</p> : null}
        </div>
    );
}

function replaceLine(lines: readonly SplitLine[], index: number, next: SplitLine): SplitLine[] {
    return lines.map((line, lineIndex) => (lineIndex === index ? next : line));
}

function milliunitsToInput(amount: number): string {
    return (amount / 1000).toFixed(2);
}

function inputToMilliunits(value: string): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.round(parsed * 1000);
}

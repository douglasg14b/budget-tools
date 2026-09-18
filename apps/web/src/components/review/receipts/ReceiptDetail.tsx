import type { ReceiptExtractStatus, ReceiptMatchDto, ReceiptSplitDraftDto } from '@budget-tools/web-sdk';
import { Button, Collapse, TextInput, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronLeft } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import type { ReceiptExtractEdit } from './applyReceiptExtractEdit';
import { parseReceiptExtract } from './parseReceiptExtract';
import { ReceiptBindPanel } from './ReceiptBindPanel';
import classes from './ReceiptDetail.module.css';
import { ReceiptImageLightbox } from './ReceiptImageLightbox';
import { receiptExtractCopy } from './receiptExtractCopy';

export type ReceiptDetailModel = {
    readonly id: string;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly totalsDisagree: boolean;
    readonly extractJson: string | null;
    readonly rawText: string | null;
    readonly extractCostUsd: number | null;
    readonly transactionId: string | null;
    readonly createdAt: string | null;
    readonly frameCount: number | null;
    readonly imageSrc: string | null;
};

type ReceiptDetailProps = {
    readonly askingMatch: boolean;
    readonly binding: boolean;
    readonly deleting: boolean;
    readonly error: string | null;
    readonly live: boolean;
    readonly loading: boolean;
    readonly match: ReceiptMatchDto | undefined;
    readonly missing: boolean;
    readonly receipt: ReceiptDetailModel | null;
    readonly retrying: boolean;
    readonly retryError: string | null;
    readonly saveError: string | null;
    readonly saveEpoch: number;
    readonly saving: boolean;
    readonly onBack: () => void;
    readonly onBind: (transactionId: string) => void;
    readonly onDelete: () => void;
    readonly onDetach: () => void;
    readonly onRetry: () => void;
    readonly onSave: (edit: ReceiptExtractEdit) => void;
};

export function ReceiptDetail({
    askingMatch,
    binding,
    deleting,
    error,
    live,
    loading,
    match,
    missing,
    receipt,
    retrying,
    retryError,
    saveError,
    saveEpoch,
    saving,
    onBack,
    onBind,
    onDelete,
    onDetach,
    onRetry,
    onSave,
}: ReceiptDetailProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [rawOpen, setRawOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const extract = parseReceiptExtract(receipt?.extractJson ?? null);
    const canEdit = Boolean(receipt && receipt.extractStatus !== 'pending');

    useEffect(() => {
        if (saveEpoch > 0) {
            setEditing(false);
        }
    }, [saveEpoch]);

    return (
        <div className={classes.page}>
            <button type="button" className={classes.back} aria-label="Back to receipts" onClick={onBack}>
                <IconChevronLeft size={18} aria-hidden="true" />
                Back to receipts
            </button>

            {loading ? <p className={classes.quiet}>Loading receipt…</p> : null}
            {missing && !loading ? <p className={classes.quiet}>That receipt is not in this session.</p> : null}
            {error ? <p className={classes.error}>{error}</p> : null}

            {receipt ? (
                <>
                    {receipt.imageSrc ? (
                        <button
                            type="button"
                            className={classes.imageHeader}
                            aria-haspopup="dialog"
                            aria-label="View full receipt"
                            onClick={() => {
                                setLightboxOpen(true);
                            }}
                        >
                            <img alt="" className={classes.thumb} src={receipt.imageSrc} />
                            <span className={classes.imageCopy}>
                                <span className={classes.imageTitle}>Receipt photo</span>
                                <span className={classes.imageHint}>Tap to open full size</span>
                            </span>
                        </button>
                    ) : null}

                    <section className={classes.card} aria-labelledby="extract-heading">
                        <div className={classes.cardHead}>
                            <h2 id="extract-heading" className={classes.heading}>
                                Extract
                            </h2>
                            {canEdit && !editing ? (
                                <Button
                                    size="compact-sm"
                                    variant="subtle"
                                    onClick={() => {
                                        setEditing(true);
                                    }}
                                >
                                    Edit
                                </Button>
                            ) : null}
                        </div>
                        <p className={classes.status}>{receiptExtractCopy(receipt)}</p>
                        {extract?.error ? <p className={classes.error}>{extract.error}</p> : null}
                        {live && receipt.extractStatus === 'failed' ? (
                            <div className={classes.retry}>
                                <Button size="compact-sm" loading={retrying} onClick={onRetry}>
                                    Retry parsing
                                </Button>
                                {retryError ? <p className={classes.error}>{retryError}</p> : null}
                            </div>
                        ) : null}

                        {editing && canEdit ? (
                            <ExtractEditor
                                receipt={receipt}
                                saving={saving}
                                saveError={saveError}
                                onCancel={() => {
                                    setEditing(false);
                                }}
                                onSave={onSave}
                            />
                        ) : (
                            <ExtractSummary receipt={receipt} />
                        )}
                    </section>

                    {editing && canEdit ? null : (
                        <section className={classes.card} aria-labelledby="lines-heading">
                            <h2 id="lines-heading" className={classes.heading}>
                                Line items
                            </h2>
                            {extract && extract.lines.length > 0 ? (
                                <ul className={classes.lines}>
                                    {extract.lines.map((line, index) => (
                                        // biome-ignore lint/suspicious/noArrayIndexKey: extract lines are not uniquely keyed
                                        <li key={`${line.name}-${index}`}>
                                            <span className={classes.lineName}>{line.name}</span>
                                            <span className={classes.lineMeta}>
                                                {line.quantity != null ? `${line.quantity} · ` : null}
                                                {line.amountMilliunits != null
                                                    ? formatYnabAmount(line.amountMilliunits)
                                                    : 'No amount'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className={classes.quiet}>No line items were extracted.</p>
                            )}
                            {extract && (extract.taxMilliunits !== 0 || extract.discountMilliunits !== 0) ? (
                                <p className={classes.meta}>
                                    {extract.taxMilliunits !== 0
                                        ? `Tax ${formatYnabAmount(extract.taxMilliunits)}`
                                        : null}
                                    {extract.taxMilliunits !== 0 && extract.discountMilliunits !== 0 ? ' · ' : null}
                                    {extract.discountMilliunits !== 0
                                        ? `Discount ${formatYnabAmount(extract.discountMilliunits)}`
                                        : null}
                                </p>
                            ) : null}
                        </section>
                    )}

                    <SplitDraftPreview draft={match?.splitDraft ?? null} />

                    <section className={classes.card} aria-labelledby="match-heading">
                        <h2 id="match-heading" className={classes.heading}>
                            Bank charge
                        </h2>
                        <ReceiptBindPanel
                            asking={askingMatch}
                            binding={binding}
                            boundTransactionId={receipt.transactionId}
                            error={null}
                            live={live}
                            match={match}
                            onBind={onBind}
                            onDetach={onDetach}
                        />
                    </section>

                    {receipt.rawText ? (
                        <section className={classes.card}>
                            <UnstyledButton
                                className={classes.toggle}
                                aria-expanded={rawOpen}
                                onClick={() => {
                                    setRawOpen((open) => !open);
                                }}
                            >
                                <IconChevronDown
                                    size={16}
                                    className={rawOpen ? `${classes.chevron} ${classes.chevronOpen}` : classes.chevron}
                                />
                                {rawOpen ? 'Hide raw text' : 'Show raw text'}
                            </UnstyledButton>
                            <Collapse expanded={rawOpen}>
                                <pre className={classes.raw}>{receipt.rawText}</pre>
                            </Collapse>
                        </section>
                    ) : null}

                    <p className={classes.meta}>
                        {receipt.createdAt ? `Captured ${formatCapturedAt(receipt.createdAt)}` : 'Session receipt'}
                        {receipt.frameCount != null
                            ? ` · ${receipt.frameCount} frame${receipt.frameCount === 1 ? '' : 's'}`
                            : null}
                    </p>

                    <Button color="red" size="compact-sm" variant="subtle" loading={deleting} onClick={onDelete}>
                        Delete receipt
                    </Button>

                    {receipt.imageSrc ? (
                        <ReceiptImageLightbox
                            opened={lightboxOpen}
                            src={receipt.imageSrc}
                            onClose={() => {
                                setLightboxOpen(false);
                            }}
                        />
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

function ExtractSummary({ receipt }: { readonly receipt: ReceiptDetailModel }) {
    return (
        <dl className={classes.facts}>
            <div>
                <dt>Payee</dt>
                <dd>{receipt.vendor ?? 'Unknown vendor'}</dd>
            </div>
            <div>
                <dt>Date</dt>
                <dd>{receipt.purchaseDate ? formatTransactionDate(receipt.purchaseDate) : 'No date yet'}</dd>
            </div>
            <div>
                <dt>Total</dt>
                <dd>
                    {receipt.printedMilliunits != null ? formatYnabAmount(receipt.printedMilliunits) : 'No total yet'}
                </dd>
            </div>
            {receipt.extractCostUsd != null ? (
                <div>
                    <dt>OCR cost</dt>
                    <dd>{formatInferenceCost(receipt.extractCostUsd)}</dd>
                </div>
            ) : null}
        </dl>
    );
}
export function formatInferenceCost(costUsd: number): string {
    if (costUsd === 0) {
        return '$0';
    }
    return `$${costUsd.toFixed(costUsd >= 0.01 ? 4 : 6)}`;
}

function SplitDraftPreview({ draft }: { readonly draft: ReceiptSplitDraftDto | null }) {
    if (!draft) {
        return null;
    }
    return (
        <section className={classes.card} aria-labelledby="seed-heading">
            <h2 id="seed-heading" className={classes.heading}>
                Classify would seed
            </h2>
            <p className={classes.lede}>
                {draft.kind === 'split'
                    ? 'These memos and amounts can seed a split. Categories are chosen in Classify.'
                    : 'One line — not a fake split. Category is chosen in Classify.'}
            </p>
            <ul className={classes.lines}>
                {draft.lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: split draft lines are not uniquely keyed
                    <li key={`${line.memo ?? 'line'}-${index}`}>
                        <span className={classes.lineName}>{line.memo ?? 'Line'}</span>
                        <span className={classes.lineMeta}>{formatYnabAmount(line.amountMilliunits)}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

type ExtractEditorProps = {
    readonly receipt: ReceiptDetailModel;
    readonly saveError: string | null;
    readonly saving: boolean;
    readonly onCancel: () => void;
    readonly onSave: (edit: ReceiptExtractEdit) => void;
};

function ExtractEditor({ receipt, saveError, saving, onCancel, onSave }: ExtractEditorProps) {
    const parsed = parseReceiptExtract(receipt.extractJson);
    const [vendor, setVendor] = useState(receipt.vendor ?? '');
    const [purchaseDate, setPurchaseDate] = useState(receipt.purchaseDate ?? '');
    const [printed, setPrinted] = useState(milliunitsToInput(receipt.printedMilliunits));
    const [tax, setTax] = useState(milliunitsToInput(parsed?.taxMilliunits ?? 0));
    const [discount, setDiscount] = useState(milliunitsToInput(parsed?.discountMilliunits ?? 0));
    const [lines, setLines] = useState(
        (parsed?.lines.length ? parsed.lines : [{ name: '', amountMilliunits: null, quantity: null }]).map((line) => ({
            name: line.name,
            amount: milliunitsToInput(line.amountMilliunits),
            quantity: line.quantity == null ? '' : String(line.quantity),
        })),
    );

    return (
        <form
            className={classes.form}
            onSubmit={(event) => {
                event.preventDefault();
                onSave({
                    vendor,
                    purchaseDate,
                    printedMilliunits: inputToMilliunits(printed),
                    taxMilliunits: inputToMilliunits(tax) ?? 0,
                    discountMilliunits: inputToMilliunits(discount) ?? 0,
                    lines: lines.map((line) => ({
                        name: line.name,
                        amountMilliunits: inputToMilliunits(line.amount),
                        quantity: parseQuantity(line.quantity),
                    })),
                });
            }}
        >
            <TextInput label="Payee" value={vendor} onChange={(event) => setVendor(event.currentTarget.value)} />
            <TextInput
                label="Date"
                type="date"
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.currentTarget.value)}
            />
            <TextInput
                label="Printed total"
                value={printed}
                onChange={(event) => setPrinted(event.currentTarget.value)}
            />
            <TextInput label="Tax" value={tax} onChange={(event) => setTax(event.currentTarget.value)} />
            <TextInput label="Discount" value={discount} onChange={(event) => setDiscount(event.currentTarget.value)} />
            <ul className={classes.editLines}>
                {lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: lines are edited by position
                    <li key={index}>
                        <TextInput
                            aria-label={`Line ${index + 1} name`}
                            placeholder="Item"
                            value={line.name}
                            onChange={(event) => {
                                setLines(replaceDraftLine(lines, index, { ...line, name: event.currentTarget.value }));
                            }}
                        />
                        <TextInput
                            aria-label={`Line ${index + 1} amount`}
                            placeholder="0.00"
                            value={line.amount}
                            onChange={(event) => {
                                setLines(
                                    replaceDraftLine(lines, index, { ...line, amount: event.currentTarget.value }),
                                );
                            }}
                        />
                        <TextInput
                            aria-label={`Line ${index + 1} quantity`}
                            placeholder="Qty"
                            value={line.quantity}
                            onChange={(event) => {
                                setLines(
                                    replaceDraftLine(lines, index, { ...line, quantity: event.currentTarget.value }),
                                );
                            }}
                        />
                    </li>
                ))}
            </ul>
            <Button
                size="compact-sm"
                type="button"
                variant="subtle"
                onClick={() => {
                    setLines([...lines, { name: '', amount: '', quantity: '' }]);
                }}
            >
                Add line
            </Button>
            {saveError ? <p className={classes.error}>{saveError}</p> : null}
            <div className={classes.formActions}>
                <Button size="compact-sm" type="submit" loading={saving}>
                    Save
                </Button>
                <Button size="compact-sm" type="button" variant="subtle" color="gray" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

function parseQuantity(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatCapturedAt(iso: string): string {
    const captured = new Date(iso);
    if (Number.isNaN(captured.getTime())) {
        return iso;
    }
    return captured.toLocaleString();
}

function replaceDraftLine<T>(lines: readonly T[], index: number, next: T): T[] {
    return lines.map((line, lineIndex) => (lineIndex === index ? next : line));
}

function milliunitsToInput(amount: number | null): string {
    if (amount == null) {
        return '';
    }
    return (amount / 1000).toFixed(2);
}

function inputToMilliunits(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.round(parsed * 1000);
}

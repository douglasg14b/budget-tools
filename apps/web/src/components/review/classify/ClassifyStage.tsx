import type {
    AmazonSplitOverlayDto,
    CategorizationQueueItemDto,
    CategoryOptionDto,
    PayeeSuggestionDto,
} from '@budget-tools/web-sdk';
import { Button, Loader, Select, Tooltip, UnstyledButton } from '@mantine/core';

import { FlagChips } from '../FlagChips';
import { formatConfidence } from '../formatConfidence';
import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import { ProposalDetails } from '../ProposalDetails';
import { alternativeOptions } from './alternativeOptions';
import { ClassifyAmazonContext } from './ClassifyAmazonContext';
import { ClassifyPayee } from './ClassifyPayee';
import { ClassifySplitEditor } from './ClassifySplitEditor';
import classes from './ClassifyStage.module.css';
import { CLASSIFY_KEY_LABELS } from './classifyKeys';
import type { CategoryChoice, CategorySelectGroup } from './flattenCategoryChoices';
import { formatCategoryLabel } from './formatCategoryLabel';
import { CERTAIN_EXPLANATION, isCertainProposal } from './isCertainProposal';
import { originalImportName } from './originalImportName';
import { PeriodicBadge } from './PeriodicBadge';
import type { SessionDecision } from './sessionDecisions';
import { decisionCategoryId, decisionCategoryName, isSplitDecision } from './sessionDecisions';
import type { SplitLine } from './splitLines';
import { validateSplitLines } from './splitLines';

type ClassifyStageProps = {
    assignableIds: ReadonlySet<string>;
    categoryGroups: readonly CategorySelectGroup[];
    choicesById: ReadonlyMap<string, CategoryChoice>;
    decision: SessionDecision | undefined;
    item: CategorizationQueueItemDto;
    llmAsking?: boolean;
    llmError?: string | null;
    onAccept: () => void;
    onBeginSplit: () => void;
    onCancelSplit: () => void;
    onChangeSplit: (lines: readonly SplitLine[]) => void;
    onCommitPayee: (name: string) => void;
    onDismissRename: () => void;
    onPickCategoryId: (categoryId: string) => void;
    onPickOption: (option: CategoryOptionDto) => void;
    onReject: () => void;
    onUndo: () => void;
    payee: string;
    rename: PayeeSuggestionDto | null;
    scoreError?: string | null;
    scoring?: boolean;
    splitLines?: readonly SplitLine[];
    amazon?: {
        overlay: AmazonSplitOverlayDto | undefined;
        asking: boolean;
        error: string | null;
        syncing: boolean;
        onSync: () => void;
    };
};

export function ClassifyStage({
    assignableIds,
    categoryGroups,
    choicesById,
    decision,
    item,
    llmAsking = false,
    llmError = null,
    onAccept,
    onBeginSplit,
    onCancelSplit,
    onChangeSplit,
    onCommitPayee,
    onDismissRename,
    onPickCategoryId,
    onPickOption,
    onReject,
    onUndo,
    payee,
    rename,
    scoreError = null,
    scoring = false,
    splitLines,
    amazon,
}: ClassifyStageProps) {
    const { transaction, proposal } = item;
    const originalName = originalImportName(transaction);
    const suggestion = formatCategoryLabel(
        proposal?.suggestedCategory ?? null,
        proposal?.suggestedCategoryGroup ?? null,
    );
    const certain = isCertainProposal(proposal);
    const amazonLines = amazon?.overlay?.lines ?? [];
    const amazonSuggestion =
        amazonLines.length === 0
            ? null
            : amazon?.overlay?.collapsed
              ? formatCategoryLabel(amazonLines[0]?.categoryName ?? null, amazonLines[0]?.categoryGroup ?? null)
              : `Split · ${amazonLines.length} lines`;
    const splitError = splitLines ? validateSplitLines(splitLines, transaction.amount, assignableIds) : null;
    const canAccept = splitLines ? splitError === null : Boolean(proposal?.suggestedCategory);
    const alternatives = alternativeOptions(proposal);

    return (
        <section className={classes.stage} data-certain={certain || undefined}>
            <p className={classes.context}>
                <span className={classes.contextMeta}>
                    <span>{formatTransactionDate(transaction.date)}</span>
                    {transaction.accountName ? (
                        <>
                            <span className={classes.contextSep} aria-hidden="true">
                                ·
                            </span>
                            <span>{transaction.accountName}</span>
                        </>
                    ) : null}
                </span>
                {originalName ? <span className={classes.originalName}>{originalName}</span> : null}
            </p>
            <header className={classes.hero}>
                <div className={classes.heroIdentity}>
                    <ClassifyPayee
                        payee={payee}
                        rename={rename}
                        onCommit={onCommitPayee}
                        onDismissRename={onDismissRename}
                    />
                    {proposal?.periodicMatch ? (
                        <PeriodicBadge
                            conflict={proposal.flags.isPeriodicConflict}
                            current={transaction}
                            match={proposal.periodicMatch}
                            relatedTransactions={item.relatedTransactions}
                        />
                    ) : null}
                </div>
                <p className={classes.amount} data-inflow={transaction.amount >= 0 || undefined}>
                    {formatYnabAmount(transaction.amount)}
                </p>
            </header>
            {transaction.memo ? <p className={classes.memo}>{transaction.memo}</p> : null}

            {splitLines ? (
                <ClassifySplitEditor
                    categoryGroups={categoryGroups}
                    choicesById={choicesById}
                    error={splitError}
                    lines={splitLines}
                    transactionAmount={transaction.amount}
                    onChange={onChangeSplit}
                    onClose={onCancelSplit}
                />
            ) : (
                <UnstyledButton className={classes.splitToggle} onClick={onBeginSplit}>
                    Split this charge
                </UnstyledButton>
            )}

            <div className={classes.verdict}>
                <p className={classes.verdictLabel}>Suggestion</p>
                <p className={amazonSuggestion || suggestion ? classes.verdictCategory : classes.verdictEmpty}>
                    {scoring ? (
                        <span className={classes.scoringLabel}>
                            <Loader size={16} color="gray" />
                            Scoring…
                        </span>
                    ) : (
                        (amazonSuggestion ?? suggestion ?? 'None')
                    )}
                </p>
                {proposal && !amazonSuggestion ? (
                    <p className={classes.verdictMeta}>
                        <span className={classes.confidence}>{formatConfidence(proposal.confidence)}</span>
                        {certain ? (
                            <Tooltip label={CERTAIN_EXPLANATION}>
                                <span className={classes.certain}>Certain</span>
                            </Tooltip>
                        ) : null}
                    </p>
                ) : null}
                {scoreError && !proposal && !scoring ? <p className={classes.llmBanner}>{scoreError}</p> : null}
                {llmAsking && !amazon?.asking ? (
                    <p className={classes.llmBanner}>
                        <Loader size={14} color="gray" />
                        Asking LLM…
                    </p>
                ) : null}
                {llmError && !llmAsking ? <p className={classes.llmBanner}>{llmError}</p> : null}
                {amazon?.asking && !amazon.overlay ? (
                    <p className={classes.llmBanner}>
                        <Loader size={14} color="gray" />
                        Matching Amazon payment…
                    </p>
                ) : null}
            </div>
            {proposal ? (
                <FlagChips
                    flags={proposal.flags}
                    hide={['isPeriodic', 'isPeriodicConflict']}
                    travelWindow={proposal.travelWindow}
                />
            ) : null}

            {decision ? (
                <p className={classes.decision} data-action={decision.action}>
                    {formatDecision(decision)}
                    <UnstyledButton className={classes.undoInline} onClick={onUndo}>
                        Undo
                    </UnstyledButton>
                </p>
            ) : null}

            <div className={classes.actions}>
                <Button className={classes.accept} size="md" disabled={!canAccept} onClick={onAccept}>
                    Accept
                    <kbd className={classes.kbd}>{CLASSIFY_KEY_LABELS.accept}</kbd>
                </Button>
                <Button className={classes.reject} size="md" variant="default" onClick={onReject}>
                    Reject
                    <kbd className={classes.kbd}>{CLASSIFY_KEY_LABELS.reject}</kbd>
                </Button>
            </div>

            {alternatives.length > 0 ? (
                <div className={classes.alts}>
                    <p className={classes.altsLabel}>Or</p>
                    <ol className={classes.options}>
                        {alternatives.map((option, index) => {
                            const label = formatCategoryLabel(option.category, option.categoryGroup) ?? option.category;
                            const selected =
                                decisionCategoryId(decision) === option.categoryId ||
                                (decisionCategoryName(decision) === option.category && !option.categoryId);
                            return (
                                <li key={`${option.rank}-${option.categoryId ?? option.category}`}>
                                    <UnstyledButton
                                        className={
                                            selected ? `${classes.option} ${classes.optionSelected}` : classes.option
                                        }
                                        tabIndex={-1}
                                        onClick={() => {
                                            onPickOption(option);
                                        }}
                                    >
                                        <kbd className={classes.optionKey}>{index + 1}</kbd>
                                        <span className={classes.optionLabel}>{label}</span>
                                    </UnstyledButton>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            ) : null}

            <Select
                className={classes.catalog}
                data={[...categoryGroups]}
                nothingFoundMessage="No matching category"
                placeholder="Search another category"
                searchable
                size="sm"
                value={null}
                onChange={(categoryId) => {
                    if (!categoryId) {
                        return;
                    }
                    const choice = choicesById.get(categoryId);
                    if (choice) {
                        onPickCategoryId(choice.id);
                    }
                }}
            />

            {amazon && (amazon.overlay || amazon.error) ? (
                <div className={classes.amazonDetails}>
                    <ClassifyAmazonContext
                        asking={false}
                        error={amazon.error}
                        overlay={amazon.overlay}
                        syncing={amazon.syncing}
                        onSync={amazon.onSync}
                    />
                </div>
            ) : null}

            {proposal ? (
                <details className={classes.details}>
                    <summary className={classes.summary}>Why this suggestion</summary>
                    <ProposalDetails proposal={proposal} />
                </details>
            ) : null}
        </section>
    );
}

function formatDecision(decision: SessionDecision): string {
    if (isSplitDecision(decision)) {
        return `Split into ${decision.lines.length} lines`;
    }
    switch (decision.action) {
        case 'approved':
            return `Accepted ${formatCategoryLabel(decision.categoryName, decision.categoryGroup) ?? ''}`.trim();
        case 'changed':
            return `Changed to ${formatCategoryLabel(decision.categoryName, decision.categoryGroup) ?? 'a new category'}`;
        case 'rejected':
            return 'Rejected';
    }
}

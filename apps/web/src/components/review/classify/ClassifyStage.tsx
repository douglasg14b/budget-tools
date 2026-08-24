import type { CategorizationQueueItemDto, CategoryOptionDto, PayeeSuggestionDto } from '@budget-tools/web-sdk';
import { Button, Loader, Select, Tooltip, UnstyledButton } from '@mantine/core';

import { FlagChips } from '../FlagChips';
import { formatConfidence } from '../formatConfidence';
import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import { ProposalDetails } from '../ProposalDetails';
import { alternativeOptions } from './alternativeOptions';
import { ClassifyPayee } from './ClassifyPayee';
import classes from './ClassifyStage.module.css';
import { CLASSIFY_KEY_LABELS } from './classifyKeys';
import type { CategoryChoice, CategorySelectGroup } from './flattenCategoryChoices';
import { formatCategoryLabel } from './formatCategoryLabel';
import { CERTAIN_EXPLANATION, isCertainProposal } from './isCertainProposal';
import { originalImportName } from './originalImportName';
import { PeriodicBadge } from './PeriodicBadge';
import type { SessionDecision } from './sessionDecisions';

type ClassifyStageProps = {
    categoryGroups: readonly CategorySelectGroup[];
    choicesById: ReadonlyMap<string, CategoryChoice>;
    decision: SessionDecision | undefined;
    item: CategorizationQueueItemDto;
    llmAsking?: boolean;
    llmError?: string | null;
    onAccept: () => void;
    onCommitPayee: (name: string) => void;
    onDismissRename: () => void;
    onPickCategoryId: (categoryId: string) => void;
    onPickOption: (option: CategoryOptionDto) => void;
    onReject: () => void;
    onUndo: () => void;
    payee: string;
    rename: PayeeSuggestionDto | null;
};

export function ClassifyStage({
    categoryGroups,
    choicesById,
    decision,
    item,
    llmAsking = false,
    llmError = null,
    onAccept,
    onCommitPayee,
    onDismissRename,
    onPickCategoryId,
    onPickOption,
    onReject,
    onUndo,
    payee,
    rename,
}: ClassifyStageProps) {
    const { transaction, proposal } = item;
    const originalName = originalImportName(transaction);
    const suggestion = formatCategoryLabel(proposal.suggestedCategory, proposal.suggestedCategoryGroup);
    const certain = isCertainProposal(proposal);
    const canAccept = Boolean(proposal.suggestedCategory);
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
                    {proposal.periodicMatch ? (
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

            <div className={classes.verdict}>
                <p className={classes.verdictLabel}>Suggestion</p>
                <p className={suggestion ? classes.verdictCategory : classes.verdictEmpty}>{suggestion ?? 'None'}</p>
                <p className={classes.verdictMeta}>
                    <span className={classes.confidence}>{formatConfidence(proposal.confidence)}</span>
                    {certain ? (
                        <Tooltip label={CERTAIN_EXPLANATION}>
                            <span className={classes.certain}>Certain</span>
                        </Tooltip>
                    ) : null}
                </p>
                {llmAsking ? (
                    <p className={classes.llmBanner}>
                        <Loader size={14} color="gray" />
                        Asking LLM…
                    </p>
                ) : null}
                {llmError && !llmAsking ? <p className={classes.llmBanner}>{llmError}</p> : null}
            </div>
            <FlagChips
                flags={proposal.flags}
                hide={['isPeriodic', 'isPeriodicConflict']}
                travelWindow={proposal.travelWindow}
            />

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
                                decision?.categoryId === option.categoryId ||
                                (decision?.categoryName === option.category && !option.categoryId);
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

            <details className={classes.details}>
                <summary className={classes.summary}>Why this suggestion</summary>
                <ProposalDetails proposal={proposal} />
            </details>
        </section>
    );
}

function formatDecision(decision: SessionDecision): string {
    switch (decision.action) {
        case 'approved':
            return `Accepted ${formatCategoryLabel(decision.categoryName, decision.categoryGroup) ?? ''}`.trim();
        case 'changed':
            return `Changed to ${formatCategoryLabel(decision.categoryName, decision.categoryGroup) ?? 'a new category'}`;
        case 'rejected':
            return 'Rejected';
    }
}

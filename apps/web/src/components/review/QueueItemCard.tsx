import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { Collapse, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';

import { FlagChips } from './FlagChips';
import { formatConfidence } from './formatConfidence';
import { formatProposalReasons } from './formatProposalReasons';
import { formatTransactionDate } from './formatTransactionDate';
import { formatYnabAmount } from './formatYnabAmount';
import { humanizeEnum } from './humanizeEnum';
import { ProposalDetails } from './ProposalDetails';
import { payeeRenameSuggestion } from './payeeRenameSuggestion';
import classes from './QueueItemCard.module.css';
import { TierBadge } from './TierBadge';

type QueueItemCardProps = {
    item: CategorizationQueueItemDto;
};

export function QueueItemCard({ item }: QueueItemCardProps) {
    const [expanded, setExpanded] = useState(false);
    const { transaction, proposal } = item;
    const payee = transaction.payeeName || transaction.importPayeeName || '—';
    const rename = payeeRenameSuggestion(proposal);
    const suggestion = proposal.suggestedCategory
        ? proposal.suggestedCategoryGroup
            ? `${proposal.suggestedCategoryGroup}: ${proposal.suggestedCategory}`
            : proposal.suggestedCategory
        : 'No suggestion';
    const reasonLine = formatProposalReasons(proposal.gapReason, proposal.routeReason);
    const memoLine = [transaction.accountName, transaction.memo].filter(Boolean).join(' · ');

    return (
        <article className={classes.card} data-tier={proposal.tier}>
            <time className={classes.date} dateTime={transaction.date}>
                {formatTransactionDate(transaction.date)}
            </time>
            <div className={classes.payeeBlock}>
                <p className={classes.payee}>{payee}</p>
                {rename ? <p className={classes.rename}>Suggested payee: {rename.name}</p> : null}
                {memoLine ? <p className={classes.meta}>{memoLine}</p> : null}
                {transaction.categoryName ? <p className={classes.meta}>Currently {transaction.categoryName}</p> : null}
            </div>
            <p className={classes.amount} data-inflow={transaction.amount >= 0 || undefined}>
                {formatYnabAmount(transaction.amount)}
            </p>
            <div className={classes.proposal}>
                <TierBadge tier={proposal.tier} />
                <span className={proposal.suggestedCategory ? classes.suggestion : classes.suggestionMuted}>
                    {suggestion}
                </span>
                <span className={classes.confidence}>
                    {formatConfidence(proposal.confidence)} · {humanizeEnum(proposal.method)}
                </span>
                <FlagChips flags={proposal.flags} travelWindow={proposal.travelWindow} />
            </div>
            {reasonLine ? <p className={classes.reason}>{reasonLine}</p> : null}
            <div className={classes.footer}>
                <UnstyledButton
                    className={classes.toggle}
                    aria-expanded={expanded}
                    onClick={() => {
                        setExpanded((current) => !current);
                    }}
                >
                    <IconChevronDown
                        size={18}
                        className={expanded ? `${classes.chevron} ${classes.chevronOpen}` : classes.chevron}
                    />
                    {expanded ? 'Hide details' : 'Show details'}
                </UnstyledButton>
                <Collapse expanded={expanded}>
                    <ProposalDetails proposal={proposal} />
                </Collapse>
            </div>
        </article>
    );
}

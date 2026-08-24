import type { CategorizationProposalDto, CategoryOptionDto, MethodSignalDto } from '@budget-tools/web-sdk';
import type { ReactNode } from 'react';

import { formatConfidence } from './formatConfidence';
import { humanizeEnum } from './humanizeEnum';
import classes from './ProposalDetails.module.css';

type ProposalDetailsProps = {
    proposal: CategorizationProposalDto;
};

export function ProposalDetails({ proposal }: ProposalDetailsProps) {
    return (
        <div className={classes.details}>
            {proposal.periodicMatch ? (
                <p className={classes.periodic}>
                    {humanizeEnum(proposal.periodicMatch.cadence)}
                    {' · '}
                    {proposal.periodicMatch.occurrenceCount} occurrences
                    {proposal.periodicMatch.category ? ` · ${proposal.periodicMatch.category}` : ''}
                </p>
            ) : null}
            {proposal.agreeingSignals.length > 0 ? (
                <DetailSection title="Agreeing methods">
                    {proposal.agreeingSignals.map((signal) => (
                        <SignalRow key={signalKey(signal, 'agreeing')} signal={signal} />
                    ))}
                </DetailSection>
            ) : null}
            {proposal.signals.length > 0 ? (
                <DetailSection title="All signals">
                    {proposal.signals.map((signal) => (
                        <SignalRow key={signalKey(signal, 'all')} signal={signal} />
                    ))}
                </DetailSection>
            ) : null}
            {proposal.options.length > 0 ? (
                <DetailSection title="Ranked options">
                    {proposal.options.map((option) => (
                        <OptionRow key={`${option.rank}-${option.categoryId ?? option.category}`} option={option} />
                    ))}
                </DetailSection>
            ) : null}
            <p className={classes.interval}>{formatConfidenceInterval(proposal)}</p>
            {proposal.payeeSuggestion ? (
                <p className={classes.payee}>
                    {proposal.payeeSuggestion.needsRename ? 'Suggested payee' : 'Payee'}
                    {': '}
                    {proposal.payeeSuggestion.name}
                    {' · '}
                    {humanizeEnum(proposal.payeeSuggestion.method)}
                    {' · '}
                    {formatConfidence(proposal.payeeSuggestion.confidence)}
                </p>
            ) : proposal.resolvedPayee ? (
                <p className={classes.payee}>Resolved payee: {proposal.resolvedPayee}</p>
            ) : null}
            {proposal.featureText ? <p className={classes.feature}>{proposal.featureText}</p> : null}
            {proposal.notes ? <p className={classes.note}>{proposal.notes}</p> : null}
        </div>
    );
}

type DetailSectionProps = {
    children: ReactNode;
    title: string;
};

function DetailSection({ children, title }: DetailSectionProps) {
    return (
        <div className={classes.section}>
            <p className={classes.title}>{title}</p>
            {children}
        </div>
    );
}

type SignalRowProps = {
    signal: MethodSignalDto;
};

function SignalRow({ signal }: SignalRowProps) {
    return (
        <p className={classes.row}>
            <span className={classes.method}>{humanizeEnum(signal.method)}</span>
            {' · '}
            <span className={classes.category}>{signal.category}</span>
            {' · '}
            <span className={classes.stat}>{formatConfidence(signal.confidence)}</span>
        </p>
    );
}

type OptionRowProps = {
    option: CategoryOptionDto;
};

function OptionRow({ option }: OptionRowProps) {
    const label = option.categoryGroup ? `${option.categoryGroup}: ${option.category}` : option.category;
    const supporting =
        option.supportingMethods.length > 0
            ? ` (${option.supportingMethods.map((signal) => humanizeEnum(signal.method)).join(', ')})`
            : '';
    return (
        <p className={classes.row}>
            <span className={classes.stat}>{option.rank}.</span> <span className={classes.category}>{label}</span>
            {' · '}
            <span className={classes.stat}>{formatConfidence(option.confidence)}</span>
            {supporting}
        </p>
    );
}

function formatConfidenceInterval(proposal: CategorizationProposalDto): string {
    const { top, second, spread } = proposal.confidenceInterval;
    const parts = [`Top ${formatConfidence(top)}`];
    if (second !== null) {
        parts.push(`Second ${formatConfidence(second)}`);
    }
    parts.push(`Spread ${formatConfidence(spread)}`);
    return parts.join(' · ');
}

function signalKey(signal: MethodSignalDto, scope: string): string {
    return `${scope}-${signal.method}-${signal.category}`;
}

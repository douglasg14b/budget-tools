import type { CategorizationProposalDto } from '../categorizationDtos';

export const PROPOSAL_CACHE_VERSION = 3;

export type CachedProposalEntry = {
    readonly fingerprint: string;
    readonly generatedAt: string;
    readonly proposal: CategorizationProposalDto;
};

export type ProposalCacheFile = {
    readonly version: number;
    readonly llm: boolean;
    readonly modelSignature: string;
    readonly travelWindowsSignature: string;
    readonly entries: Record<string, CachedProposalEntry>;
};

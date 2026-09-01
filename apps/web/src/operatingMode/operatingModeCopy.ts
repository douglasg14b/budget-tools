import type { OperatingModeDto } from '@budget-tools/web-sdk';

export type OperatingMode = OperatingModeDto['mode'];

export function operatingModeClassifyNote(mode: OperatingMode): string {
    switch (mode) {
        case 'practice':
            return 'Practice — nothing is written to YNAB.';
        case 'live':
            return 'Live — accepted classifications write to YNAB.';
    }
}

export function operatingModeReceiptsNote(mode: OperatingMode): string {
    switch (mode) {
        case 'practice':
            return 'Practice — receipts stay in this tab only.';
        case 'live':
            return 'Live — originals and binds are kept.';
    }
}

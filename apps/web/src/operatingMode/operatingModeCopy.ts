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

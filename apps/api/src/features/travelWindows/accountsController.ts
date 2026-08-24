import { Get, Route, Tags } from 'tsoa';

import type { AccountsDto } from './travelWindowsDtos';
import { listAccounts } from './travelWindowsStore';

@Route('accounts')
@Tags('accounts')
export class AccountsController {
    /**
     * Distinct YNAB accounts present on synced transactions, for the trip card picker.
     * @summary listAccounts
     */
    @Get()
    public async listAccounts(): Promise<AccountsDto> {
        return { accounts: await listAccounts() };
    }
}

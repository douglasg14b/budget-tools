import { database } from '@/data';
import type { MetricsRepository } from '@/repositories';
import { metricsRepository } from '@/repositories';

function groupResults(queryResults: { account_name: string; count: number | string | bigint }[]) {
    return queryResults.reduce<Record<string, (typeof queryResults)[number]>>((acc, row) => {
        acc[row.account_name] = row;
        return acc;
    }, {});
}

export class MetricsService {
    private repo: MetricsRepository;

    constructor(repo: MetricsRepository) {
        this.repo = repo;
    }

    public async generateMetrics() {
        const unapproved = groupResults(await this.getUnapprovedByAccount());
        const approved = groupResults(await this.getApprovedByAccount());
        const uncategorized = groupResults(await this.getUncategorizedByAccount());
        const categorized = groupResults(await this.getCategorizedByAccount());
        const date = new Date().toISOString();

        // We need to emit metrics for all accounts, even if they have no unapproved or uncategorized transactions
        const accountNames = await this.getDistinctAccountNames();

        for (const accountName of accountNames) {
            const unapprovedCount = accountName in unapproved ? Number(unapproved[accountName].count) : 0;
            const approvedCount = accountName in approved ? Number(approved[accountName].count) : 0;
            const uncategorizedCount = accountName in uncategorized ? Number(uncategorized[accountName].count) : 0;
            const categorizedCount = accountName in categorized ? Number(categorized[accountName].count) : 0;

            await this.repo.insertMetric({
                date,
                name: 'unapproved',
                value: unapprovedCount,
                meta: { account_id: null, account_name: accountName },
            });

            await this.repo.insertMetric({
                date,
                name: 'approved',
                value: approvedCount,
                meta: { account_id: null, account_name: accountName },
            });

            await this.repo.insertMetric({
                date,
                name: 'uncategorized',
                value: uncategorizedCount,
                meta: { account_id: null, account_name: accountName },
            });

            await this.repo.insertMetric({
                date,
                name: 'categorized',
                value: categorizedCount,
                meta: { account_id: null, account_name: accountName },
            });
        }
    }

    private async getDistinctAccountNames() {
        return (await database.selectFrom('transactions').groupBy('account_name').select('account_name').execute()).map(
            (row) => row.account_name,
        );
    }

    private async getUnapprovedByAccount() {
        return await database
            .selectFrom('transactions')
            .where('approved', '=', false)
            .groupBy('account_name')
            .select([database.fn.countAll().as('count'), 'account_name'])
            .execute();
    }

    private async getApprovedByAccount() {
        return await database
            .selectFrom('transactions')
            .where('approved', '=', true)
            .groupBy('account_name')
            .select([database.fn.countAll().as('count'), 'account_name'])
            .execute();
    }

    private async getUncategorizedByAccount() {
        return await database
            .selectFrom('transactions')
            .where('transfer_account_id', 'is', null)
            .where('category_id', 'is', null)
            .groupBy('account_name')
            .select([database.fn.countAll().as('count'), 'account_name'])
            .execute();
    }

    private async getCategorizedByAccount() {
        return await database
            .selectFrom('transactions')
            .where('transfer_account_id', 'is', null)
            .where('category_id', 'is not', null)
            .groupBy('account_name')
            .select([database.fn.countAll().as('count'), 'account_name'])
            .execute();
    }
}

export const metricsService = new MetricsService(metricsRepository);

import { database } from '@/data';
import type { MetricsRepository } from '@/repositories';
import { metricsRepository } from '@/repositories';

export class MetricsService {
    private repo: MetricsRepository;

    constructor(repo: MetricsRepository) {
        this.repo = repo;
    }

    public async generateMetrics() {
        const unapproved = await this.getUnapprovedByAccount();
        const uncategorized = await this.getUncategorizedByAccount();

        for (const { account_name, count } of unapproved) {
            await this.repo.insertMetric({
                date: new Date().toISOString(),
                name: 'unapproved',
                value: Number(count),
                meta: { account_id: null, account_name },
            });
        }

        for (const { account_name, count } of uncategorized) {
            await this.repo.insertMetric({
                date: new Date().toISOString(),
                name: 'uncategorized',
                value: Number(count),
                meta: { account_id: null, account_name },
            });
        }
    }

    private async getUnapprovedByAccount() {
        return await database
            .selectFrom('transactions')
            .where('approved', '=', false)
            .groupBy('account_name')
            .select([database.fn.countAll().as('count'), 'account_name'])
            .execute();
    }

    private async getUncategorizedByAccount() {
        return await database
            .selectFrom('transactions')
            .where('transfer_account_id', '=', null)
            .where('category_id', '=', null)
            .groupBy('account_name')
            .select([database.fn.countAll().as('count'), 'account_name'])
            .execute();
    }
}

export const metricsService = new MetricsService(metricsRepository);

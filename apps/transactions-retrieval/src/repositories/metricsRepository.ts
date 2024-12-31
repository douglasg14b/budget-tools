import type { NewMetric } from '../data';
import { database } from '../data';

export class MetricsRepository {
    public async insertMetric(newMetric: NewMetric): Promise<void> {
        await database.insertInto('metrics').values(newMetric).execute();
    }
}

export const metricsRepository = new MetricsRepository();

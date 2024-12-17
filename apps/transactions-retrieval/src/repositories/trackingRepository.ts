import type { DatabaseClient, StateTracking } from '../data';
import { database } from '../data';

export class TrackingRepository {
    private dbClient: DatabaseClient;

    constructor(dbClient: DatabaseClient) {
        this.dbClient = dbClient;
    }

    public async getTracking() {
        await this.ensureSeeded();

        return this.dbClient.selectFrom('tracking').selectAll().executeTakeFirstOrThrow();
    }

    public async getYnabLastServerKnowledge() {
        const tracking = await this.getTracking();

        return tracking.last_server_knowledge;
    }

    public async setLastPulledAt(lastPulledAt: Date) {
        const trackingData = await this.getTracking();
        trackingData.last_pulled_date = lastPulledAt;

        await this.update(trackingData);
    }

    public async setLastServerKnowledge(lastServerKnowledge: number) {
        const trackingData = await this.getTracking();
        trackingData.last_server_knowledge = lastServerKnowledge;

        await this.update(trackingData);
    }

    public async update(trackingData: StateTracking) {
        await this.dbClient.updateTable('tracking').set(trackingData).where('id', '=', trackingData.id).execute();
    }

    private async ensureSeeded() {
        const trackingData = await this.dbClient.selectFrom('tracking').selectAll().executeTakeFirst();
        if (!trackingData) {
            await this.dbClient
                .insertInto('tracking')
                .values({
                    last_pulled_date: null,
                    last_server_knowledge: null,
                    cache_budget: null,
                })
                .execute();
        }
    }
}

export const trackingRepository = new TrackingRepository(database);

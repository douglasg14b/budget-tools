import type { Selectable, Updateable } from 'kysely';

export type TravelBiasConfigTable = {
    id: number;
    enabled: boolean;
};

export type TravelBiasConfigRow = Selectable<TravelBiasConfigTable>;
export type TravelBiasConfigRowUpdate = Updateable<TravelBiasConfigTable>;

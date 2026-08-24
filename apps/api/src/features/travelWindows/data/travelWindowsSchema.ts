import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export type TravelWindowKind = 'vacation' | 'work';

export type TravelWindowsTable = {
    id: string;
    name: string;
    kind: TravelWindowKind;
    startDate: string;
    endDate: string;
    location: string | null;
    createdAt: ColumnType<Date, string | Date, string | Date>;
    updatedAt: ColumnType<Date, string | Date, string | Date>;
};

export type TravelWindowAccountsTable = {
    windowId: string;
    accountId: string;
    accountName: string;
};

export type TravelWindowRow = Selectable<TravelWindowsTable>;
export type NewTravelWindowRow = Insertable<TravelWindowsTable>;
export type TravelWindowRowUpdate = Updateable<TravelWindowsTable>;
export type TravelWindowAccountRow = Selectable<TravelWindowAccountsTable>;

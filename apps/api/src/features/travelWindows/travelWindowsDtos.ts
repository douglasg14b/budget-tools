export type TravelWindowKindDto = 'vacation' | 'work';

export type TravelWindowDto = {
    id: string;
    name: string;
    kind: TravelWindowKindDto;
    startDate: string;
    endDate: string;
    accountId: string | null;
    accountName: string | null;
};

export type TravelWindowsDto = {
    windows: TravelWindowDto[];
};

export type TravelWindowWriteDto = {
    name: string;
    kind: TravelWindowKindDto;
    startDate: string;
    endDate: string;
    accountId: string | null;
    accountName: string | null;
};

export type TravelBiasDto = {
    enabled: boolean;
};

export type AccountDto = {
    id: string;
    name: string;
};

export type AccountsDto = {
    accounts: AccountDto[];
};

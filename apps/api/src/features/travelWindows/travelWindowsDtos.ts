export type TravelWindowKindDto = 'vacation' | 'work';

export type TravelWindowAccountDto = {
    id: string;
    name: string;
};

export type TravelWindowDto = {
    id: string;
    name: string;
    kind: TravelWindowKindDto;
    startDate: string;
    endDate: string;
    location: string | null;
    accounts: TravelWindowAccountDto[];
};

export type TravelWindowsDto = {
    windows: TravelWindowDto[];
};

export type TravelWindowWriteDto = {
    name: string;
    kind: TravelWindowKindDto;
    startDate: string;
    endDate: string;
    location: string | null;
    accounts: TravelWindowAccountDto[];
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

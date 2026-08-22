export type CategoryDto = {
    id: string;
    name: string;
    hidden: boolean;
    note: string | null;
};

export type CategoryGroupDto = {
    id: string;
    name: string;
    hidden: boolean;
    categories: CategoryDto[];
};

export type CategoriesDto = {
    groups: CategoryGroupDto[];
};

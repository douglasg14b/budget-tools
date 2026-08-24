type OriginalImportNameInput = {
    readonly importPayeeName: string | null;
    readonly importPayeeNameOriginal: string | null;
};

export function originalImportName(input: OriginalImportNameInput): string | null {
    const value = input.importPayeeNameOriginal?.trim() || input.importPayeeName?.trim();
    return value || null;
}

/**
 * Turns a PascalCase enum value into a readable label (`ImportAmountLookup` → `Import Amount Lookup`).
 */
export function humanizeEnum(value: string): string {
    const withLlm = value.replaceAll('Llm', 'LLM');
    return withLlm.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

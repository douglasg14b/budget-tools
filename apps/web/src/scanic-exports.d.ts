export {};

declare module 'scanic' {
    export function initialize(): Promise<unknown | null>;
}

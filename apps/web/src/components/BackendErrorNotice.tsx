import { Alert } from '@mantine/core';
import type { ReactNode } from 'react';

type BackendErrorNoticeProps = {
    children?: (message: string) => ReactNode;
    error: unknown;
    fallbackMessage?: string;
};

const FALLBACK_ERROR_MESSAGE = 'Request failed.';

function normalizeMessage(value: string): string | null {
    const trimmedValue = value.trim();
    if (!trimmedValue || trimmedValue === '[object Object]') {
        return null;
    }
    return trimmedValue;
}

function extractMessageFromUnknown(value: unknown, visited: Set<object>, allowPrimitive = false): string | null {
    if (typeof value === 'string') {
        return normalizeMessage(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return allowPrimitive ? String(value) : null;
    }
    if (!value) {
        return null;
    }
    if (value instanceof Error) {
        const errorMessage = normalizeMessage(value.message);
        if (errorMessage) {
            return errorMessage;
        }
        return extractMessageFromUnknown(value.cause, visited, true);
    }
    if (Array.isArray(value)) {
        for (const element of value) {
            const nestedMessage = extractMessageFromUnknown(element, visited, true);
            if (nestedMessage) {
                return nestedMessage;
            }
        }
        return null;
    }
    if (typeof value !== 'object') {
        return null;
    }
    if (visited.has(value)) {
        return null;
    }
    visited.add(value);

    const objectValue = value as Record<string, unknown>;
    const prioritizedKeys = ['message', 'detail', 'error_description', 'title', 'reason', 'error', 'errors'] as const;
    for (const prioritizedKey of prioritizedKeys) {
        if (!(prioritizedKey in objectValue)) {
            continue;
        }
        const nestedMessage = extractMessageFromUnknown(objectValue[prioritizedKey], visited, true);
        if (nestedMessage) {
            return nestedMessage;
        }
    }

    for (const nestedValue of Object.values(objectValue)) {
        const nestedMessage = extractMessageFromUnknown(nestedValue, visited, false);
        if (nestedMessage) {
            return nestedMessage;
        }
    }

    return null;
}

export function getBackendErrorMessage(error: unknown, fallbackMessage = FALLBACK_ERROR_MESSAGE): string {
    const parsedMessage = extractMessageFromUnknown(error, new Set<object>(), true);
    return parsedMessage ?? fallbackMessage;
}

export function BackendErrorNotice({ children, error, fallbackMessage }: BackendErrorNoticeProps) {
    if (!error) {
        return null;
    }
    const message = getBackendErrorMessage(error, fallbackMessage);
    if (children) {
        return <>{children(message)}</>;
    }
    return <Alert color="red">{message}</Alert>;
}

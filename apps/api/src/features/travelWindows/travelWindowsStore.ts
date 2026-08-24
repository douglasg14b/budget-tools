import { randomUUID } from 'node:crypto';

import { getDatabase } from '../../data/database';
import { QueryValidationError } from '../categorization/filterQueue';
import { formatTransactionDate } from '../categorization/mapTransactionDetail';
import {
    deleteTravelWindowRow,
    getTravelBiasEnabled,
    insertTravelWindowRow,
    listTravelWindowRows,
    listTravelWindowSignatureRows,
    setTravelBiasEnabled,
    updateTravelWindowRow,
} from './data/travelWindowsRepo';
import { ConflictError, NotFoundError } from './HttpError';
import type {
    AccountDto,
    TravelBiasDto,
    TravelWindowDto,
    TravelWindowKindDto,
    TravelWindowWriteDto,
} from './travelWindowsDtos';
import { travelWindowsSignature } from './travelWindowsSignature';
import { findOverlappingWindow } from './windowsOverlap';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function listTravelWindows(): Promise<TravelWindowDto[]> {
    const rows = await listTravelWindowRows();
    return rows.map(toWindowDto);
}

export async function createTravelWindow(input: TravelWindowWriteDto): Promise<TravelWindowDto> {
    const body = validateWrite(input);
    await assertNoOverlap(body, undefined);

    const id = randomUUID();
    await insertTravelWindowRow(id, body);
    return { id, ...body };
}

export async function updateTravelWindow(id: string, input: TravelWindowWriteDto): Promise<TravelWindowDto> {
    const body = validateWrite(input);
    await assertNoOverlap(body, id);

    const updated = await updateTravelWindowRow(id, body);
    if (!updated) {
        throw new NotFoundError(`Travel window ${id} was not found`);
    }

    return { id, ...body };
}

export async function deleteTravelWindow(id: string): Promise<void> {
    const deleted = await deleteTravelWindowRow(id);
    if (!deleted) {
        throw new NotFoundError(`Travel window ${id} was not found`);
    }
}

export async function getTravelBias(): Promise<TravelBiasDto> {
    return { enabled: await getTravelBiasEnabled() };
}

export async function patchTravelBias(enabled: boolean): Promise<TravelBiasDto> {
    await setTravelBiasEnabled(enabled);
    return { enabled };
}

export async function listAccounts(): Promise<AccountDto[]> {
    const database = getDatabase();
    const rows = await database
        .selectFrom('transactions')
        .select(['account_id', 'account_name'])
        .where('deleted', '=', false)
        .distinct()
        .orderBy('account_name', 'asc')
        .execute();

    return rows
        .filter((row) => row.account_id.length > 0)
        .map((row) => ({ id: row.account_id, name: row.account_name }));
}

export async function loadTravelWindowsSignature(): Promise<string> {
    const enabled = await getTravelBiasEnabled();
    const windows = await listTravelWindowSignatureRows();

    return travelWindowsSignature({
        enabled,
        windows: windows.map((window) => ({
            id: window.id,
            kind: window.kind,
            startDate: formatTransactionDate(window.startDate),
            endDate: formatTransactionDate(window.endDate),
            accountId: window.accountId,
        })),
    });
}

async function assertNoOverlap(candidate: TravelWindowWriteDto, excludeId: string | undefined): Promise<void> {
    const existing = await listTravelWindows();
    const overlap = findOverlappingWindow(
        {
            id: excludeId,
            startDate: candidate.startDate,
            endDate: candidate.endDate,
            accountId: candidate.accountId,
        },
        existing.map((window) => ({
            id: window.id,
            startDate: window.startDate,
            endDate: window.endDate,
            accountId: window.accountId,
        })),
    );
    if (!overlap) {
        return;
    }

    const name = existing.find((window) => window.id === overlap.id)?.name ?? 'another trip';
    throw new ConflictError(`This trip overlaps '${name}' for the same dates and card.`);
}

function validateWrite(input: TravelWindowWriteDto): TravelWindowWriteDto {
    const name = input.name.trim();
    if (!name) {
        throw new QueryValidationError('Trip name is required');
    }
    if (input.kind !== 'vacation' && input.kind !== 'work') {
        throw new QueryValidationError("kind must be 'vacation' or 'work'");
    }
    if (!ISO_DATE.test(input.startDate) || !ISO_DATE.test(input.endDate)) {
        throw new QueryValidationError('startDate and endDate must be YYYY-MM-DD');
    }
    if (input.startDate > input.endDate) {
        throw new QueryValidationError('startDate must be on or before endDate');
    }

    const accountId = input.accountId?.trim() ? input.accountId.trim() : null;
    const accountName = input.accountName?.trim() ? input.accountName.trim() : null;
    return {
        name,
        kind: input.kind,
        startDate: input.startDate,
        endDate: input.endDate,
        accountId,
        accountName: accountId ? accountName : null,
    };
}

function toWindowDto(row: {
    id: string;
    name: string;
    kind: TravelWindowKindDto;
    startDate: Date | string;
    endDate: Date | string;
    accountId: string | null;
    accountName: string | null;
}): TravelWindowDto {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        startDate: formatTransactionDate(row.startDate),
        endDate: formatTransactionDate(row.endDate),
        accountId: row.accountId,
        accountName: row.accountName,
    };
}

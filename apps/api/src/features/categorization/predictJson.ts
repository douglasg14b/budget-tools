import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { getCategorizationScorerUrl } from '../../environment';
import type { PredictJsonEnvelope } from './categorizationDtos';
import { PredictJsonError, parsePredictJsonEnvelope, parsePredictJsonStdout } from './parsePredictJson';

export { PredictJsonError } from './parsePredictJson';

const MODEL_FILES = ['category-model.zip', 'group-model.zip', 'payee-model.zip'] as const;

export type RunPredictJsonInput = {
    readonly workingDir: string;
    readonly modelsDir: string;
    readonly connectionString: string;
    readonly sqliteDbPath: string;
    readonly timeoutMs: number;
    readonly llm: boolean;
    readonly transactionIds: readonly string[];
};

/**
 * Scores transactions via the warm HTTP scorer when configured, otherwise spawns predict-json.
 */
export async function runPredictJson(input: RunPredictJsonInput): Promise<PredictJsonEnvelope> {
    if (input.transactionIds.length === 0) {
        throw new PredictJsonError('predict-json requires transaction ids; refusing to score the full pending set');
    }

    assertCategorizationModelsExist(input.modelsDir);

    const scorerUrl = getCategorizationScorerUrl();
    if (scorerUrl) {
        return postToWarmScorer(scorerUrl, input);
    }

    return spawnPredictJson(input);
}

export function assertCategorizationModelsExist(modelsDir: string): void {
    for (const fileName of MODEL_FILES) {
        const modelPath = join(modelsDir, fileName);
        if (!existsSync(modelPath)) {
            throw new PredictJsonError(
                `Missing model file at ${modelPath}. Run \`dotnet run -- train\` in categorization-ai before requesting the queue.`,
            );
        }
    }
}

async function postToWarmScorer(baseUrl: string, input: RunPredictJsonInput): Promise<PredictJsonEnvelope> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactionIds: input.transactionIds,
                llm: input.llm,
            }),
            signal: controller.signal,
        });

        const bodyText = await response.text();
        if (!response.ok) {
            const detail = bodyText.trim();
            throw new PredictJsonError(
                `warm scorer POST /predict failed (${response.status})${detail ? `: ${detail}` : ''}`,
            );
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(bodyText);
        } catch (error) {
            throw new PredictJsonError('warm scorer response was not valid JSON', { cause: error });
        }

        return parsePredictJsonEnvelope(parsed);
    } catch (error) {
        if (error instanceof PredictJsonError) {
            throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
            throw new PredictJsonError(`warm scorer timed out after ${input.timeoutMs}ms`);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new PredictJsonError(`warm scorer request failed: ${message}`, { cause: error });
    } finally {
        clearTimeout(timer);
    }
}

async function spawnPredictJson(input: RunPredictJsonInput): Promise<PredictJsonEnvelope> {
    const projectPath = join(input.workingDir, 'YnabCategoryAi.csproj');
    if (!existsSync(projectPath)) {
        throw new PredictJsonError(`categorization-ai project not found at ${projectPath}`);
    }

    const args = [
        'run',
        '--project',
        projectPath,
        '-v',
        'q',
        '--no-restore',
        '--no-launch-profile',
        '--',
        'predict-json',
    ];
    if (input.llm) {
        args.push('--llm');
    }
    args.push('--ids', input.transactionIds.join(','));

    const stdout = await spawnDotnet(args, input);
    return parsePredictJsonStdout(stdout);
}

function spawnDotnet(args: string[], input: RunPredictJsonInput): Promise<string> {
    return new Promise((resolve, reject) => {
        let settled = false;

        const child = spawn('dotnet', args, {
            cwd: input.workingDir,
            env: {
                ...process.env,
                DB_CONNECTION_STRING: input.connectionString,
                SQLITE_DB_PATH: input.sqliteDbPath,
                ML__CategoryModelPath: join(input.modelsDir, 'category-model.zip'),
                ML__GroupModelPath: join(input.modelsDir, 'group-model.zip'),
                ML__PayeeModelPath: join(input.modelsDir, 'payee-model.zip'),
            },
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            child.kill();
            fail(new PredictJsonError(`predict-json timed out after ${input.timeoutMs}ms`));
        }, input.timeoutMs);

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });
        child.on('error', (error) => {
            fail(new PredictJsonError(`Failed to start predict-json: ${error.message}`, { cause: error }));
        });
        child.on('close', (code) => {
            if (code !== 0) {
                const detail = stderr.trim();
                fail(
                    new PredictJsonError(
                        `predict-json exited with code ${code ?? 'null'}${detail ? `: ${detail}` : ''}`,
                    ),
                );
                return;
            }
            succeed(stdout);
        });

        function fail(error: PredictJsonError): void {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            reject(error);
        }

        function succeed(value: string): void {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(value);
        }
    });
}

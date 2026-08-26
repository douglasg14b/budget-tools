import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workingDir = join(repoRoot, 'apps', 'categorization-ai');
const dllPath = join(workingDir, 'bin', 'Debug', 'net8.0', 'YnabCategoryAi.dll');
const modelsDir = resolveModelsDir();
const scorerUrl = (process.env.CATEGORIZATION_SCORER_URL?.trim() || 'http://localhost:4021').replace(/\/$/, '');

for (const fileName of ['category-model.zip', 'group-model.zip', 'payee-model.zip']) {
    const modelPath = join(modelsDir, fileName);
    if (!existsSync(modelPath)) {
        console.error(`Missing model file at ${modelPath}. Run \`dotnet run -- train\` in categorization-ai first.`);
        process.exit(1);
    }
}

if (await isScorerHealthy()) {
    console.log(`Warm scorer already running at ${scorerUrl}; reusing it.`);
    process.exit(0);
}

const env = {
    ...process.env,
    ML__CategoryModelPath: join(modelsDir, 'category-model.zip'),
    ML__GroupModelPath: join(modelsDir, 'group-model.zip'),
    ML__PayeeModelPath: join(modelsDir, 'payee-model.zip'),
    SQLITE_DB_PATH: resolveSqlitePath(),
};

const dotnetArgs = existsSync(dllPath) ? ['exec', dllPath, 'serve'] : ['run', '--', 'serve'];
const child = spawn('dotnet', dotnetArgs, {
    cwd: workingDir,
    stdio: 'inherit',
    env,
    windowsHide: true,
});

child.on('exit', (code) => {
    if (code !== 0 && dotnetArgs[0] === 'run') {
        console.error(
            'Failed to start warm scorer. If a previous instance is still running, stop it first:\n' +
                '  Get-Process YnabCategoryAi | Stop-Process',
        );
    }
    process.exit(code ?? 1);
});

async function isScorerHealthy() {
    try {
        const response = await fetch(`${scorerUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (!response.ok) {
            return false;
        }
        const body = await response.json();
        return body?.ready === true;
    } catch {
        return false;
    }
}

function resolveModelsDir() {
    const configured = process.env.CATEGORIZATION_MODELS_DIR?.trim() || 'models';
    return isAbsolute(configured) ? configured : resolve(repoRoot, configured);
}

function resolveSqlitePath() {
    const configured = process.env.SQLITE_DB_PATH?.trim() || 'apps/api/data/app.sqlite';
    return isAbsolute(configured) ? configured : resolve(repoRoot, configured);
}

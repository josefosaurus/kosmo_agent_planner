import * as cp from 'child_process';
import * as path from 'path';
import { writeFile } from '../utils/fileSystem';
import { requirementsPrompt, designPrompt, tasksPrompt } from '../utils/templates';

type ProgressFn = (message: string, increment: number) => void;

export async function generateSpec(
    goal: string,
    specDir: string,
    cwd: string,
    onProgress: ProgressFn,
): Promise<void> {
    onProgress('Generating requirements.md…', 5);
    const requirements = await runClaude(requirementsPrompt(goal), cwd);
    await writeFile(path.join(specDir, 'requirements.md'), requirements);

    onProgress('Generating design.md…', 30);
    const design = await runClaude(designPrompt(goal, requirements), cwd);
    await writeFile(path.join(specDir, 'design.md'), design);

    onProgress('Generating tasks.md…', 30);
    const tasks = await runClaude(tasksPrompt(goal, requirements, design), cwd);
    await writeFile(path.join(specDir, 'tasks.md'), tasks);

    onProgress('Done', 35);
}

function runClaude(prompt: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn('claude', ['-p', prompt], { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('error', (err) => {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                reject(new Error('claude CLI not found. Install Claude Code: https://claude.ai/code'));
            } else {
                reject(err);
            }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
            }
        });
    });
}

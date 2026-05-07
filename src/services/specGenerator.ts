import * as cp from 'child_process';
import * as path from 'path';
import { writeFile } from '../utils/fileSystem';
import { requirementsPrompt, designPrompt, tasksPrompt } from '../utils/templates';

export async function generateRequirements(goal: string, specDir: string, cwd: string): Promise<string> {
    const content = await runClaude(requirementsPrompt(goal), cwd);
    await writeFile(path.join(specDir, 'requirements.md'), content);
    return content;
}

export async function generateDesign(goal: string, requirements: string, specDir: string, cwd: string): Promise<string> {
    const content = await runClaude(designPrompt(goal, requirements), cwd);
    await writeFile(path.join(specDir, 'design.md'), content);
    return content;
}

export async function generateTasks(goal: string, requirements: string, design: string, specDir: string, cwd: string): Promise<string> {
    const content = await runClaude(tasksPrompt(goal, requirements, design), cwd);
    await writeFile(path.join(specDir, 'tasks.md'), content);
    return content;
}

// kept for Sync Files (regenerates all three)
export async function generateSpec(goal: string, specDir: string, cwd: string, onProgress: (msg: string, inc: number) => void): Promise<void> {
    onProgress('Generating requirements.md…', 5);
    const requirements = await generateRequirements(goal, specDir, cwd);
    onProgress('Generating design.md…', 30);
    const design = await generateDesign(goal, requirements, specDir, cwd);
    onProgress('Generating tasks.md…', 30);
    await generateTasks(goal, requirements, design, specDir, cwd);
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
            reject((err as NodeJS.ErrnoException).code === 'ENOENT'
                ? new Error('claude CLI not found. Install Claude Code: https://claude.ai/code')
                : err);
        });
        proc.on('close', (code) => {
            code === 0 ? resolve(stdout.trim()) : reject(new Error(`claude exited ${code}: ${stderr.trim()}`));
        });
    });
}

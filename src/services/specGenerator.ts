import * as path from 'path';
import { writeFile } from '../utils/fileSystem';
import { requirementsPrompt, designPrompt, tasksPrompt } from '../utils/templates';
import { runWithCli } from './llmCli';

export async function generateRequirements(goal: string, specDir: string, cwd: string): Promise<string> {
    const content = await runWithCli(requirementsPrompt(goal), cwd);
    await writeFile(path.join(specDir, 'requirements.md'), content);
    return content;
}

export async function generateDesign(goal: string, requirements: string, specDir: string, cwd: string): Promise<string> {
    const content = await runWithCli(designPrompt(goal, requirements), cwd);
    await writeFile(path.join(specDir, 'design.md'), content);
    return content;
}

export async function generateTasks(goal: string, requirements: string, design: string, specDir: string, cwd: string): Promise<string> {
    const content = await runWithCli(tasksPrompt(goal, requirements, design), cwd);
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

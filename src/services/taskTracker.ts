import * as fs from 'fs/promises';

export async function markInProgress(tasksFilePath: string, taskIndex: number): Promise<void> {
    await updateState(tasksFilePath, taskIndex, '~');
}

export async function markDone(tasksFilePath: string, taskIndex: number): Promise<void> {
    await updateState(tasksFilePath, taskIndex, 'x');
}

export async function markPending(tasksFilePath: string, taskIndex: number): Promise<void> {
    await updateState(tasksFilePath, taskIndex, ' ');
}

async function updateState(
    tasksFilePath: string,
    taskIndex: number,
    newState: ' ' | '~' | 'x',
): Promise<void> {
    const content = await fs.readFile(tasksFilePath, 'utf8');
    const pattern = new RegExp(`^(- \\[)[ ~x](\\] ${taskIndex}\\.)`, 'm');
    const updated = content.replace(pattern, `$1${newState}$2`);
    await fs.writeFile(tasksFilePath, updated, 'utf8');
}

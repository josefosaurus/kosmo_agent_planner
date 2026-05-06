import * as vscode from 'vscode';
import { TaskItem } from '../views/tasksDataProvider';
import { runTask } from '../services/taskRunner';
import { markInProgress } from '../services/taskTracker';

export async function startTask(item?: TaskItem): Promise<void> {
    if (!item) {
        vscode.window.showErrorMessage('Select a pending task from the Kosmo Tasks panel.');
        return;
    }
    if (item.state !== 'pending') {
        vscode.window.showWarningMessage(`Task "${item.label}" is already ${item.state}.`);
        return;
    }

    await markInProgress(item.tasksFilePath, item.taskIndex);
    await runTask(item);
}

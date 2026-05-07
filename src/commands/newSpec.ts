import * as vscode from 'vscode';
import * as path from 'path';
import { TasksDataProvider } from '../views/tasksDataProvider';
import { SpecToolbarPanel } from '../views/specToolbar';
import { ensureDir, writeFile, workspaceRoot, fileExists } from '../utils/fileSystem';
import { claudeMdTemplate } from '../utils/templates';

export async function newSpec(provider: TasksDataProvider): Promise<void> {
    const root = workspaceRoot();
    if (!root) {
        vscode.window.showErrorMessage('Open a workspace folder first.');
        return;
    }

    const goal = await vscode.window.showInputBox({
        prompt: 'Describe the feature or goal',
        placeHolder: 'e.g. Add user authentication with JWT tokens',
        ignoreFocusOut: true,
    });
    if (!goal) return;

    const defaultName = goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const rawName = await vscode.window.showInputBox({
        prompt: 'Spec name (used as directory name)',
        value: defaultName,
        ignoreFocusOut: true,
    });
    if (!rawName) return;

    const specName = rawName.trim();
    const specDir  = path.join(root, '.kosmo', 'specs', specName);
    await ensureDir(specDir);
    await writeFile(path.join(specDir, 'goal.txt'), goal);

    const claudeMdPath = path.join(root, 'CLAUDE.md');
    if (!(await fileExists(claudeMdPath))) {
        await writeFile(claudeMdPath, claudeMdTemplate());
        vscode.window.showInformationMessage('Created CLAUDE.md — fill it in with project context.');
    }

    SpecToolbarPanel.startNew(goal, specName, specDir, root);
    provider.refresh();
}

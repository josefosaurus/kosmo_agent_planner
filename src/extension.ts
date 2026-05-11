import * as vscode from 'vscode';
import { newSpec } from './commands/newSpec';
import { startTask } from './commands/startTask';
import { TasksDataProvider, TaskItem } from './views/tasksDataProvider';
import { KosmoCodeLensProvider } from './providers/codelensProvider';
import { killTask } from './services/taskRunner';
import { selectCli } from './services/llmCli';
import { discover } from './commands/discover';
import { SpecToolbarPanel, specInfoFromUri } from './views/specToolbar';
import { SpecCustomEditorProvider } from './views/specCustomEditor';

export function activate(context: vscode.ExtensionContext) {
    const tasksProvider = new TasksDataProvider();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('kosmoTasks', tasksProvider),

        vscode.commands.registerCommand('kosmo.newSpec', () => newSpec(tasksProvider)),

        vscode.commands.registerCommand('kosmo.startTask', (item?: TaskItem) => startTask(item)),

        vscode.commands.registerCommand('kosmo.killTask', async (item?: TaskItem) => {
            if (!item) return;
            await killTask(item.tasksFilePath, item.taskIndex);
        }),

        vscode.commands.registerCommand('kosmo.refreshTasks', () => tasksProvider.refresh()),

        vscode.commands.registerCommand('kosmo.selectCli', () => selectCli()),

        vscode.commands.registerCommand('kosmo.discover', () => discover(tasksProvider)),

        vscode.languages.registerCodeLensProvider(
            { pattern: '**/.kosmo/specs/**/tasks.md' },
            new KosmoCodeLensProvider()
        )
    );

    const watcher = vscode.workspace.createFileSystemWatcher('**/.kosmo/specs/**/tasks.md');
    watcher.onDidChange(() => { tasksProvider.refresh(); SpecToolbarPanel.refreshCurrent(); });
    watcher.onDidCreate(() => { tasksProvider.refresh(); SpecToolbarPanel.refreshCurrent(); });
    context.subscriptions.push(watcher);

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            SpecCustomEditorProvider.viewType,
            new SpecCustomEditorProvider(),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
}

export function deactivate() {}

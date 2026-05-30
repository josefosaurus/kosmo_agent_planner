import * as vscode from 'vscode';
import * as path from 'path';
import { parseTasks } from '../views/tasksDataProvider';
import { isRunning } from '../services/taskRunner';

export class KosmoCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const content = document.getText();
        const specDir = path.dirname(document.uri.fsPath);
        const tasks = parseTasks(content, document.uri.fsPath, specDir);
        const lines = content.split('\n');

        return tasks.flatMap(task => {
            const stateChar = task.state === 'done' ? 'x' : task.state === 'inprogress' ? '~' : ' ';
            const lineIndex = lines.findIndex(l =>
                new RegExp(`^- \\[${stateChar}\\] ${task.taskIndex}\\.`).test(l)
            );
            if (lineIndex === -1) return [];

            const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
            const lenses: vscode.CodeLens[] = [];
            const running = isRunning(task.tasksFilePath, task.taskIndex);

            if (running) {
                lenses.push(new vscode.CodeLens(range, {
                    title: '⏹ Kill task',
                    command: 'kosmo.killTask',
                    arguments: [task],
                }));
            } else {
                lenses.push(new vscode.CodeLens(range, {
                    title: task.state === 'done' ? '↺ Restart task' : '▶ Start task',
                    command: 'kosmo.startTask',
                    arguments: [task],
                }));
            }

            return lenses;
        });
    }
}

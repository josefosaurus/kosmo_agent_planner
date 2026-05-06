import * as vscode from 'vscode';
import * as path from 'path';
import { parseTasks } from '../views/tasksDataProvider';

export class KosmoCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const content = document.getText();
        const specDir = path.dirname(document.uri.fsPath);
        const tasks = parseTasks(content, document.uri.fsPath, specDir);
        const lines = content.split('\n');

        return tasks
            .filter(t => t.state === 'pending')
            .flatMap(task => {
                const lineIndex = lines.findIndex(l =>
                    new RegExp(`^- \\[ \\] ${task.taskIndex}\\.`).test(l)
                );
                if (lineIndex === -1) return [];
                const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
                return [new vscode.CodeLens(range, {
                    title: '▶ Start task',
                    command: 'kosmo.startTask',
                    arguments: [task],
                })];
            });
    }
}

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { workspaceRoot } from '../utils/fileSystem';

export type TaskState = 'pending' | 'inprogress' | 'done';

export class TaskItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tasksFilePath: string,
        public readonly taskIndex: number,
        public readonly state: TaskState,
        public readonly details: string[],
        public readonly requirements: string,
        public readonly specDir: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = state === 'pending' ? 'pendingTask'
            : state === 'inprogress' ? 'inprogressTask'
            : 'doneTask';
        this.iconPath = new vscode.ThemeIcon(
            state === 'done' ? 'pass-filled'
            : state === 'inprogress' ? 'loading~spin'
            : 'circle-outline'
        );
        this.tooltip = details.join('\n');
    }
}

export class SpecGroupItem extends vscode.TreeItem {
    constructor(
        public readonly specName: string,
        public readonly specDir: string,
    ) {
        super(specName, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'specGroup';
    }
}

export class TasksDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        const root = workspaceRoot();
        if (!root) return [];

        const specsDir = path.join(root, '.kosmo', 'specs');

        if (!element) {
            return this.getSpecGroups(specsDir);
        }
        if (element instanceof SpecGroupItem) {
            return this.getTasksForSpec(element.specDir);
        }
        return [];
    }

    private async getSpecGroups(specsDir: string): Promise<SpecGroupItem[]> {
        try {
            const entries = await fs.readdir(specsDir, { withFileTypes: true });
            return entries
                .filter(e => e.isDirectory())
                .map(e => new SpecGroupItem(e.name, path.join(specsDir, e.name)));
        } catch {
            return [];
        }
    }

    private async getTasksForSpec(specDir: string): Promise<TaskItem[]> {
        const tasksFile = path.join(specDir, 'tasks.md');
        try {
            const content = await fs.readFile(tasksFile, 'utf8');
            return parseTasks(content, tasksFile, specDir);
        } catch {
            return [];
        }
    }
}

export function parseTasks(content: string, tasksFilePath: string, specDir: string): TaskItem[] {
    const lines = content.split('\n');
    const tasks: TaskItem[] = [];

    let current: {
        index: number;
        title: string;
        state: TaskState;
        details: string[];
        requirements: string;
    } | null = null;

    const flush = () => {
        if (!current) return;
        tasks.push(new TaskItem(
            `${current.index}. ${current.title}`,
            tasksFilePath,
            current.index,
            current.state,
            current.details,
            current.requirements,
            specDir,
        ));
    };

    for (const line of lines) {
        const m = line.match(/^- \[([ x~])\] (\d+)\. (.+)/);
        if (m) {
            flush();
            const stateChar = m[1];
            current = {
                index: parseInt(m[2], 10),
                title: m[3],
                state: stateChar === 'x' ? 'done' : stateChar === '~' ? 'inprogress' : 'pending',
                details: [],
                requirements: '',
            };
        } else if (current && /^\s+- _Requirements:/.test(line)) {
            current.requirements = line.trim().replace(/^- /, '');
        } else if (current && /^\s+- /.test(line)) {
            current.details.push(line.trim().replace(/^- /, ''));
        }
    }
    flush();
    return tasks;
}

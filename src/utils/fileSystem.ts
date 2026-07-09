import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function loadDotEnv(cwd: string): Promise<Record<string, string>> {
    const vars: Record<string, string> = {};
    try {
        const raw = await fs.readFile(path.join(cwd, '.env'), 'utf8');
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const key = trimmed.slice(0, eq).trim();
            let value = trimmed.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (key) vars[key] = value;
        }
    } catch { /* no .env — fine */ }
    return vars;
}

export function workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

export async function writeFile(filePath: string, content: string): Promise<void> {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
}

export async function fileExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true).catch(() => false);
}

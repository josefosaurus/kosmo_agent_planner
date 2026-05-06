import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskItem } from '../views/tasksDataProvider';
import { markDone, markPending } from './taskTracker';
import { workspaceRoot } from '../utils/fileSystem';

const runningProcs = new Map<string, cp.ChildProcess>();

export function procKey(tasksFilePath: string, taskIndex: number): string {
    return `${tasksFilePath}:${taskIndex}`;
}

export function isRunning(tasksFilePath: string, taskIndex: number): boolean {
    return runningProcs.has(procKey(tasksFilePath, taskIndex));
}

export async function killTask(tasksFilePath: string, taskIndex: number): Promise<void> {
    const key = procKey(tasksFilePath, taskIndex);
    runningProcs.get(key)?.kill();
    runningProcs.delete(key);
    await markPending(tasksFilePath, taskIndex);
}

export async function runTask(item: TaskItem): Promise<void> {
    const cwd = workspaceRoot();
    if (!cwd) { vscode.window.showErrorMessage('No workspace folder open.'); return; }

    let requirements = '';
    let design = '';
    try {
        requirements = await fs.readFile(path.join(item.specDir, 'requirements.md'), 'utf8');
        design = await fs.readFile(path.join(item.specDir, 'design.md'), 'utf8');
    } catch { /* proceed without context */ }

    const prompt = buildPrompt(item.label, item.details, requirements, design);
    const key = procKey(item.tasksFilePath, item.taskIndex);

    const channel = vscode.window.createOutputChannel(`Kosmo: ${item.label}`);
    channel.show(true);
    channel.appendLine(`▶ ${item.label}`);
    channel.appendLine('');

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.show();

    const startTime = Date.now();
    let action = 'thinking…';
    let cost: number | null = null;

    const ticker = setInterval(() => {
        const s = Math.round((Date.now() - startTime) / 1000);
        statusBar.text = `$(loading~spin) ${s}s · ${action}`;
    }, 500);

    const cleanup = () => { clearInterval(ticker); statusBar.dispose(); };

    const proc = cp.spawn(
        'claude',
        ['-p', prompt, '--output-format', 'stream-json', '--verbose'],
        { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    runningProcs.set(key, proc);

    let buf = '';
    proc.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
            const parsed = parseLine(line);
            if (!parsed) continue;
            if (parsed.type === 'tool') {
                action = parsed.label;
                channel.appendLine(`  ${parsed.label}`);
            } else if (parsed.type === 'error') {
                channel.appendLine(`  ! ${parsed.message}`);
            } else if (parsed.type === 'cost') {
                cost = parsed.value;
            }
        }
    });

    // stderr = raw claude errors (rate limits, auth, etc.) — show them all
    proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) channel.appendLine(`  ! ${text}`);
    });

    proc.on('error', async (err) => {
        cleanup();
        runningProcs.delete(key);
        const msg = (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'claude not found — install Claude Code: https://claude.ai/code'
            : err.message;
        channel.appendLine('');
        channel.appendLine(`✗ ${msg}`);
        vscode.window.showErrorMessage(`Kosmo: ${msg}`);
        await markPending(item.tasksFilePath, item.taskIndex);
    });

    proc.on('close', async (code, signal) => {
        cleanup();
        runningProcs.delete(key);
        const s = Math.round((Date.now() - startTime) / 1000);
        const costStr = cost != null ? ` · $${cost.toFixed(4)}` : '';
        channel.appendLine('');
        if (signal) {
            channel.appendLine(`⊘ killed · ${s}s`);
        } else if (code === 0) {
            channel.appendLine(`✓ done · ${s}s${costStr}`);
            await markDone(item.tasksFilePath, item.taskIndex);
        } else {
            channel.appendLine(`✗ failed · exit ${code} · ${s}s${costStr}`);
            vscode.window.showErrorMessage(`Kosmo: "${item.label}" failed (exit ${code}) — see Output`);
            await markPending(item.tasksFilePath, item.taskIndex);
        }
    });
}

type ParsedEvent =
    | { type: 'tool'; label: string }
    | { type: 'error'; message: string }
    | { type: 'cost'; value: number };

function parseLine(line: string): ParsedEvent | null {
    if (!line.trim()) return null;
    let e: Record<string, unknown>;
    try { e = JSON.parse(line); } catch { return null; }

    if (e.type === 'assistant') {
        const blocks = ((e.message as { content?: unknown[] })?.content ?? []) as Array<{
            type: string; name?: string; input?: Record<string, unknown>;
        }>;
        const tool = blocks.find(b => b.type === 'tool_use');
        if (tool) return { type: 'tool', label: toolLabel(tool.name, tool.input ?? {}) };
    }

    if (e.type === 'result') {
        const r = e as { subtype?: string; cost_usd?: number; error?: string; result?: string };
        if (r.cost_usd != null) {
            return { type: 'cost', value: r.cost_usd };
        }
        if (r.subtype === 'error' && r.error) {
            return { type: 'error', message: r.error };
        }
    }

    return null;
}

function toolLabel(name: string | undefined, input: Record<string, unknown>): string {
    const file = path.basename(String(input.file_path ?? input.path ?? ''));
    switch (name) {
        case 'Write': return `write ${file}`;
        case 'Read':  return `read ${file}`;
        case 'Edit':  return `edit ${file}`;
        case 'Bash':  return `$ ${String(input.command ?? '').slice(0, 60)}`;
        case 'WebSearch': return `search "${String(input.query ?? '').slice(0, 40)}"`;
        case 'WebFetch':  return `fetch ${String(input.url ?? '').slice(0, 50)}`;
        default: return name?.toLowerCase() ?? 'tool';
    }
}

function buildPrompt(title: string, details: string[], requirements: string, design: string): string {
    const lines = [`# Task: ${title}`, ''];
    if (details.length > 0) lines.push('## Details', ...details.map(d => `- ${d}`), '');
    if (requirements) lines.push('## Requirements', requirements, '');
    if (design) lines.push('## Design', design, '');
    return lines.join('\n');
}

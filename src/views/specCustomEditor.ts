import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateSpec } from '../services/specGenerator';
import { workspaceRoot } from '../utils/fileSystem';
import { parseTasks } from './tasksDataProvider';
import { killTask, isRunning } from '../services/taskRunner';

const STEPS = [
    { key: 'requirements', label: 'Requirements' },
    { key: 'design',       label: 'Design'       },
    { key: 'tasks',        label: 'Task list'    },
] as const;

type StepKey = typeof STEPS[number]['key'];

function specInfoFromDoc(uri: vscode.Uri): { specName: string; specDir: string; step: StepKey } | undefined {
    const parts = uri.fsPath.split(path.sep);
    const specsIdx = parts.lastIndexOf('specs');
    if (specsIdx === -1 || parts.indexOf('.kosmo') !== specsIdx - 1) return undefined;
    const specName = parts[specsIdx + 1];
    const step = STEPS.find(s => parts[parts.length - 1] === `${s.key}.md`)?.key;
    if (!specName || !step) return undefined;
    return { specName, specDir: parts.slice(0, specsIdx + 2).join(path.sep), step };
}

export class SpecCustomEditorProvider implements vscode.CustomTextEditorProvider {
    static readonly viewType = 'kosmo.specEditor';

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
    ): void {
        webviewPanel.webview.options = { enableScripts: true };

        const info = specInfoFromDoc(document.uri);
        if (!info) return;

        const render = () => {
            const text = document.getText();
            const tasks = info.step === 'tasks' ? parseTasks(text, document.uri.fsPath, info.specDir) : [];
            webviewPanel.webview.html = buildHtml(info, text, tasks);
        };
        render();

        const docChange = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) render();
        });
        webviewPanel.onDidDispose(() => docChange.dispose());

        webviewPanel.webview.onDidReceiveMessage(async (msg: { command: string; step?: StepKey; content?: string; taskIndex?: number }) => {
            if (msg.command === 'contentChanged' && msg.content !== undefined) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                ), msg.content);
                await vscode.workspace.applyEdit(edit);
            } else if (msg.command === 'openStep' && msg.step) {
                const uri = vscode.Uri.file(path.join(info.specDir, `${msg.step}.md`));
                await vscode.window.showTextDocument(uri);
            } else if (msg.command === 'continue') {
                const idx  = STEPS.findIndex(s => s.key === info.step);
                const next = STEPS[idx + 1];
                if (next) await vscode.window.showTextDocument(vscode.Uri.file(path.join(info.specDir, `${next.key}.md`)));
            } else if (msg.command === 'startTask' && msg.taskIndex !== undefined) {
                const tasks = parseTasks(document.getText(), document.uri.fsPath, info.specDir);
                const task = tasks.find(t => t.taskIndex === msg.taskIndex);
                if (task) await vscode.commands.executeCommand('kosmo.startTask', task);
            } else if (msg.command === 'killTask' && msg.taskIndex !== undefined) {
                await killTask(document.uri.fsPath, msg.taskIndex);
            } else if (msg.command === 'openPreview') {
                await vscode.commands.executeCommand('markdown.showPreview', document.uri);
            } else if (msg.command === 'sync') {
                const goalPath = path.join(info.specDir, 'goal.txt');
                let goal: string;
                try { goal = (await fs.readFile(goalPath, 'utf8')).trim(); }
                catch { vscode.window.showErrorMessage('Kosmo: goal.txt not found — re-run Kosmo: New Spec.'); return; }
                const cwd = workspaceRoot();
                if (!cwd) return;
                try {
                    await vscode.window.withProgress(
                        { location: vscode.ProgressLocation.Notification, title: `Kosmo: Syncing "${info.specName}"`, cancellable: false },
                        async (p) => generateSpec(goal, info.specDir, cwd, (m, i) => p.report({ message: m, increment: i }))
                    );
                } catch (err) {
                    vscode.window.showErrorMessage(`Kosmo: Sync failed — ${(err as Error).message}`);
                }
            }
        });
    }
}

function buildHtml(
    info: { specName: string; specDir: string; step: StepKey },
    content: string,
    tasks: import('./tasksDataProvider').TaskItem[] = [],
): string {
    const currentIdx = STEPS.findIndex(s => s.key === info.step);
    const isLast     = currentIdx === STEPS.length - 1;

    const stepsHtml = STEPS.map((s, i) => {
        const cls = i === currentIdx ? 'active' : i < currentIdx ? 'done' : '';
        const sep = i < 2 ? `<span class="sep">›</span>` : '';
        return `<button class="step ${cls}" onclick="openStep('${s.key}')">
                    <span class="num">${i + 1}</span>
                    <span>${s.label}</span>
                </button>${sep}`;
    }).join('');

    const actionBtn = isLast
        ? `<button class="btn-primary" disabled>✓ Complete</button>`
        : `<button class="btn-primary" onclick="cont()">→ Continue</button>`;

    const taskBarHtml = tasks.length > 0 ? (() => {
        const items = tasks.filter(t => t.state !== 'done').map(t => {
            const running = isRunning(t.tasksFilePath, t.taskIndex);
            const btn = running
                ? `<button class="task-btn kill" onclick="killTask(${t.taskIndex})">⏹ ${t.taskIndex}. ${esc(String(t.label))}</button>`
                : `<button class="task-btn start" onclick="startTask(${t.taskIndex})">▶ ${t.taskIndex}. ${esc(String(t.label))}</button>`;
            return btn;
        }).join('');
        return items ? `<div class="task-bar">${items}</div>` : '';
    })() : '';

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escaped = esc(content);
    const eyeIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

    return /* html */`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; display: flex; flex-direction: column; }
  body {
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: var(--vscode-editor-font-size, 14px);
    line-height: 1.7;
  }
  .toolbar {
    flex-shrink: 0; height: 44px;
    display: flex; align-items: center; padding: 0 16px; gap: 12px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,.1));
    background: var(--vscode-editor-background);
  }
  .steps { display: flex; align-items: center; gap: 5px; flex: 1; }
  .sep { opacity: .3; margin: 0 1px; }
  .step {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 4px 12px 4px 7px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(255,255,255,.05);
    color: var(--vscode-foreground);
    cursor: pointer; font-size: 12px; font-family: inherit;
  }
  .step:hover:not(.active) { filter: brightness(1.3); }
  .step.active { background: #5b21b6; color: #fff; border-color: #7c3aed; }
  .step.done   { opacity: .5; }
  .num {
    background: rgba(255,255,255,.15); border-radius: 4px;
    width: 18px; height: 18px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700;
  }
  .actions { display: flex; gap: 8px; margin-left: auto; align-items: center; }
  .btn-secondary {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 13px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,.18); background: transparent;
    color: var(--vscode-foreground);
    cursor: pointer; font-size: 12px; font-family: inherit;
  }
  .btn-secondary:hover { background: rgba(255,255,255,.07); }
  .btn-primary {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 15px; border-radius: 6px;
    border: none; background: #6d28d9; color: #fff;
    cursor: pointer; font-size: 12px; font-weight: 500; font-family: inherit;
  }
  .btn-primary:hover:not(:disabled) { background: #7c3aed; }
  .btn-primary:disabled { opacity: .4; cursor: default; }
  .editor-wrap {
    flex: 1; display: flex; overflow: hidden;
    font-family: var(--vscode-editor-font-family, 'Menlo', 'Monaco', 'Courier New', monospace);
    font-size: 13px; line-height: 20px;
  }
  #ln {
    width: 52px; flex-shrink: 0;
    padding: 14px 10px 20px 0;
    text-align: right;
    color: rgba(128,128,128,.5);
    border-right: 1px solid rgba(255,255,255,.06);
    user-select: none; overflow: hidden;
    white-space: pre;
    font-family: inherit; font-size: 13px; line-height: 20px;
  }
  #ed {
    flex: 1; background: transparent;
    color: var(--vscode-editor-foreground);
    border: none; outline: none; resize: none;
    padding: 14px 40px 60px 16px;
    overflow-y: auto; overflow-x: auto;
    white-space: pre; overflow-wrap: normal;
    font-family: inherit; font-size: 13px; line-height: 20px;
    tab-size: 2; caret-color: #7c3aed;
  }
  .preview-btn {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 18px; border-radius: 20px;
    border: 1px solid rgba(255,255,255,.18);
    background: rgba(15,15,15,.88); backdrop-filter: blur(8px);
    color: rgba(255,255,255,.8); cursor: pointer;
    font-size: 12px; font-family: var(--vscode-font-family);
    white-space: nowrap; z-index: 10;
  }
  .preview-btn:hover { background: rgba(40,40,40,.95); color: #fff; }
  .main { position: relative; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .task-bar {
    flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 6px;
    padding: 6px 16px;
    border-bottom: 1px solid rgba(255,255,255,.06);
    background: rgba(255,255,255,.02);
  }
  .task-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 4px; border: none;
    font-size: 11px; font-family: inherit; cursor: pointer;
    max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .task-btn.start { background: rgba(109,40,217,.25); color: #c4b5fd; }
  .task-btn.start:hover { background: rgba(109,40,217,.45); }
  .task-btn.kill  { background: rgba(220,50,50,.2); color: #fca5a5; }
  .task-btn.kill:hover  { background: rgba(220,50,50,.4); }
</style>
</head><body>
  <div class="toolbar">
    <div class="steps">${stepsHtml}</div>
    <div class="actions">
      <button class="btn-secondary" onclick="sync()">↻ Sync</button>
      ${actionBtn}
    </div>
  </div>
  ${taskBarHtml}
  <div class="main">
    <div class="editor-wrap">
      <pre id="ln" aria-hidden="true"></pre>
      <textarea id="ed" spellcheck="false" autocorrect="off" autocapitalize="off">${escaped}</textarea>
    </div>
    <button class="preview-btn" onclick="openPreview()">${eyeIcon}&nbsp;Open Preview</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const ed = document.getElementById('ed');
    const ln = document.getElementById('ln');

    updateLineNumbers(ed.value);
    ed.addEventListener('scroll', () => { ln.scrollTop = ed.scrollTop; });

    let debTimer;
    ed.addEventListener('input', () => {
      updateLineNumbers(ed.value);
      clearTimeout(debTimer);
      debTimer = setTimeout(() => {
        vscode.postMessage({ command: 'contentChanged', content: ed.value });
      }, 400);
    });

    function updateLineNumbers(text) {
      const count = (text || '').split('\\n').length;
      ln.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\\n');
    }

    function openStep(s)    { vscode.postMessage({ command: 'openStep', step: s }); }
    function cont()         { vscode.postMessage({ command: 'continue' }); }
    function sync()         { vscode.postMessage({ command: 'sync' }); }
    function openPreview()  { vscode.postMessage({ command: 'openPreview' }); }
    function startTask(idx) { vscode.postMessage({ command: 'startTask', taskIndex: idx }); }
    function killTask(idx)  { vscode.postMessage({ command: 'killTask',  taskIndex: idx }); }
  </script>
</body></html>`;
}


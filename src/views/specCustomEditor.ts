import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateSpec } from '../services/specGenerator';
import { workspaceRoot } from '../utils/fileSystem';

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
            webviewPanel.webview.html = buildHtml(info, document.getText());
        };
        render();

        const docChange = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) render();
        });
        webviewPanel.onDidDispose(() => docChange.dispose());

        webviewPanel.webview.onDidReceiveMessage(async (msg: { command: string; step?: StepKey }) => {
            if (msg.command === 'openStep' && msg.step) {
                const uri = vscode.Uri.file(path.join(info.specDir, `${msg.step}.md`));
                await vscode.window.showTextDocument(uri);
            } else if (msg.command === 'continue') {
                const idx  = STEPS.findIndex(s => s.key === info.step);
                const next = STEPS[idx + 1];
                if (next) await vscode.window.showTextDocument(vscode.Uri.file(path.join(info.specDir, `${next.key}.md`)));
            } else if (msg.command === 'editSource') {
                await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
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

    const body = content.trim()
        ? renderMarkdown(content)
        : `<p class="empty">Generating…</p>`;

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
  .btn-ghost {
    background: none; border: none; color: var(--vscode-foreground);
    opacity: .45; cursor: pointer; font-size: 12px; font-family: inherit;
    padding: 4px 8px; border-radius: 4px;
  }
  .btn-ghost:hover { opacity: .8; background: rgba(255,255,255,.06); }
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

  /* content */
  .content {
    flex: 1; overflow-y: auto;
    padding: 28px 40px 40px;
    max-width: 860px; width: 100%; margin: 0 auto;
  }
  h1 { font-size: 1.45em; font-weight: 700; margin-bottom: 14px; }
  h2 { font-size: 1.05em; font-weight: 600; margin: 20px 0 6px;
       border-bottom: 1px solid rgba(255,255,255,.08); padding-bottom: 4px; }
  h3 { font-size: .95em; font-weight: 600; margin: 12px 0 4px; }
  p  { margin: 3px 0; opacity: .85; }
  li { margin: 2px 0 2px 20px; opacity: .85; }
  strong { font-weight: 600; }
  em     { font-style: italic; }
  code { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 3px; font-size: .9em; }
  pre  { background: rgba(255,255,255,.05); padding: 12px 16px; border-radius: 6px; margin: 8px 0; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  .gap { height: 6px; }
  .empty { opacity: .4; font-style: italic; margin-top: 40px; text-align: center; }
  .task { display: flex; align-items: baseline; gap: 9px; padding: 4px 0; }
  .ti { font-size: 13px; width: 15px; flex-shrink: 0; }
  .tn { opacity: .35; font-size: .82em; flex-shrink: 0; }
  .tt { flex: 1; }
  .task.done .tt { opacity: .4; text-decoration: line-through; }
  .task.done .ti { color: #4ec994; }
  .task.inprogress .ti, .task.inprogress .tt { color: #f0c040; }
  .task.pending .ti { opacity: .3; }
  .detail { padding: 1px 0 1px 24px; font-size: .87em; opacity: .5; }
  .req    { padding: 1px 0 4px 24px; font-size: .8em; opacity: .38; font-style: italic; }
</style>
</head><body>
  <div class="toolbar">
    <div class="steps">${stepsHtml}</div>
    <div class="actions">
      <button class="btn-ghost" onclick="editSource()" title="Open as text">✎</button>
      <button class="btn-secondary" onclick="sync()">↻ Sync</button>
      ${actionBtn}
    </div>
  </div>
  <div class="content">${body}</div>
  <script>
    const vscode = acquireVsCodeApi();
    function openStep(s)  { vscode.postMessage({ command: 'openStep', step: s }); }
    function cont()       { vscode.postMessage({ command: 'continue' }); }
    function sync()       { vscode.postMessage({ command: 'sync' }); }
    function editSource() { vscode.postMessage({ command: 'editSource' }); }
  </script>
</body></html>`;
}

function renderMarkdown(raw: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s: string) => esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    const out: string[] = [];
    let inCode = false;
    for (const line of raw.split('\n')) {
        if (line.startsWith('```')) { inCode ? out.push('</code></pre>') : out.push('<pre><code>'); inCode = !inCode; continue; }
        if (inCode) { out.push(esc(line)); continue; }
        if (/^### /.test(line)) { out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
        if (/^## /.test(line))  { out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
        if (/^# /.test(line))   { out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
        const task = line.match(/^- \[([ x~])\] (\d+)\. (.+)/);
        if (task) {
            const st = task[1] === 'x' ? 'done' : task[1] === '~' ? 'inprogress' : 'pending';
            const ic = task[1] === 'x' ? '✓' : task[1] === '~' ? '◐' : '○';
            out.push(`<div class="task ${st}"><span class="ti">${ic}</span><span class="tn">${task[2]}.</span><span class="tt">${inline(task[3])}</span></div>`);
            continue;
        }
        if (/^\s+- _Requirements:/.test(line)) { out.push(`<div class="req">${inline(line.trim().slice(2))}</div>`); continue; }
        if (/^\s+- /.test(line))               { out.push(`<div class="detail">· ${inline(line.trim().slice(2))}</div>`); continue; }
        if (/^- /.test(line))                  { out.push(`<li>${inline(line.slice(2))}</li>`); continue; }
        if (!line.trim())                       { out.push('<div class="gap"></div>'); continue; }
        out.push(`<p>${inline(line)}</p>`);
    }
    return out.join('\n');
}

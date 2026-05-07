import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateRequirements, generateDesign, generateTasks, generateSpec } from '../services/specGenerator';
import { workspaceRoot } from '../utils/fileSystem';

const STEPS = [
    { key: 'requirements', label: 'Requirements' },
    { key: 'design',       label: 'Design'       },
    { key: 'tasks',        label: 'Task list'    },
] as const;

type StepKey = typeof STEPS[number]['key'];

type PanelState =
    | { phase: 'generating'; step: StepKey }
    | { phase: 'review';     step: StepKey; content: string }
    | { phase: 'complete';   content: string }
    | { phase: 'view';       step: StepKey; content: string };

export interface SpecInfo {
    specName: string;
    specDir:  string;
    step:     StepKey;
}

export function specInfoFromUri(uri: vscode.Uri): SpecInfo | undefined {
    const parts = uri.fsPath.split(path.sep);
    const specsIdx = parts.lastIndexOf('specs');
    if (specsIdx === -1) return undefined;
    if (parts.indexOf('.kosmo') !== specsIdx - 1) return undefined;
    const specName = parts[specsIdx + 1];
    const fileName  = parts[parts.length - 1];
    const step = STEPS.find(s => fileName === `${s.key}.md`)?.key;
    if (!specName || !step) return undefined;
    return { specName, specDir: parts.slice(0, specsIdx + 2).join(path.sep), step };
}

export class SpecToolbarPanel {
    private static instance: SpecToolbarPanel | undefined;
    private readonly panel: vscode.WebviewPanel;

    private specName = '';
    private specDir  = '';
    private cwd      = '';
    private goal     = '';
    private requirements = '';
    private design       = '';
    private state: PanelState = { phase: 'view', step: 'requirements', content: '' };

    private constructor(specName: string, specDir: string) {
        this.specName = specName;
        this.specDir  = specDir;
        this.panel = vscode.window.createWebviewPanel(
            'kosmoSpecToolbar',
            `Kosmo · ${specName}`,
            { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.onDidDispose(() => { SpecToolbarPanel.instance = undefined; });
        this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg));
    }

    // ── entry points ─────────────────────────────────────────────────────────

    static startNew(goal: string, specName: string, specDir: string, cwd: string): void {
        const p = new SpecToolbarPanel(specName, specDir);
        p.goal = goal;
        p.cwd  = cwd;
        SpecToolbarPanel.instance = p;
        void p.runStep('requirements');
    }

    static refreshCurrent(): void {
        const p = SpecToolbarPanel.instance;
        if (!p) return;
        const s = p.state;
        if (s.phase === 'generating') return;
        const step: StepKey = s.phase === 'complete' ? 'tasks' : s.step;
        void p.loadView(step);
    }

    static showExisting(info: SpecInfo): void {
        const p = SpecToolbarPanel.instance;
        if (!p) return; // only update if panel already open; don't auto-create on file focus
        if (p.state.phase === 'generating') return;
        p.specName = info.specName;
        p.specDir  = info.specDir;
        p.panel.title = `Kosmo · ${info.specName}`;
        // update content silently — no reveal, don't steal tab focus
        void p.loadView(info.step);
    }

    // ── step execution ────────────────────────────────────────────────────────

    private async runStep(step: StepKey): Promise<void> {
        this.state = { phase: 'generating', step };
        this.render();

        try {
            let content = '';
            if (step === 'requirements') {
                content = await generateRequirements(this.goal, this.specDir, this.cwd);
                this.requirements = content;
            } else if (step === 'design') {
                content = await generateDesign(this.goal, this.requirements, this.specDir, this.cwd);
                this.design = content;
            } else {
                content = await generateTasks(this.goal, this.requirements, this.design, this.specDir, this.cwd);
            }
            this.state = step === 'tasks'
                ? { phase: 'complete', content }
                : { phase: 'review', step, content };
        } catch (err) {
            vscode.window.showErrorMessage(`Kosmo: Generation failed — ${(err as Error).message}`);
            const prev = STEPS.findIndex(s => s.key === step);
            this.state = prev > 0
                ? { phase: 'review', step: STEPS[prev - 1].key, content: this.requirements }
                : { phase: 'view', step: 'requirements', content: '' };
        }
        this.render();
    }

    private async loadView(step: StepKey): Promise<void> {
        let content = '';
        try { content = await fs.readFile(path.join(this.specDir, `${step}.md`), 'utf8'); } catch { /* ok */ }
        this.state = { phase: 'view', step, content };
        this.render();
    }

    // ── messages from webview ─────────────────────────────────────────────────

    private async onMessage(msg: { command: string; step?: StepKey }): Promise<void> {
        if (msg.command === 'approve') {
            const current = this.state;
            if (current.phase !== 'review') return;
            const next = STEPS[STEPS.findIndex(s => s.key === current.step) + 1];
            if (next) void this.runStep(next.key);
        } else if (msg.command === 'openStep' && msg.step) {
            void this.loadView(msg.step);
        } else if (msg.command === 'sync') {
            await this.sync();
        }
    }

    private async sync(): Promise<void> {
        const goalPath = path.join(this.specDir, 'goal.txt');
        let goal: string;
        try { goal = (await fs.readFile(goalPath, 'utf8')).trim(); }
        catch { vscode.window.showErrorMessage('Kosmo: goal.txt not found — re-run Kosmo: New Spec.'); return; }
        const cwd = this.cwd || workspaceRoot();
        if (!cwd) return;
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Kosmo: Syncing "${this.specName}"`, cancellable: false },
                async (progress) => generateSpec(goal, this.specDir, cwd, (m, i) => progress.report({ message: m, increment: i }))
            );
            const step = this.state.phase === 'view' || this.state.phase === 'review' || this.state.phase === 'complete'
                ? (this.state.phase === 'complete' ? 'tasks' : (this.state as { step: StepKey }).step)
                : 'tasks' as StepKey;
            void this.loadView(step as StepKey);
        } catch (err) {
            vscode.window.showErrorMessage(`Kosmo: Sync failed — ${(err as Error).message}`);
        }
    }

    // ── rendering ─────────────────────────────────────────────────────────────

    private render(): void {
        this.panel.webview.html = this.buildHtml();
    }

    private buildHtml(): string {
        const s = this.state;
        const currentStep: StepKey = s.phase === 'complete' ? 'tasks'
            : s.phase === 'generating' || s.phase === 'review' || s.phase === 'view' ? s.step
            : 'requirements';
        const currentIdx = STEPS.findIndex(x => x.key === currentStep);

        // Step badges — locked if ahead of current in new-spec flow
        const isNewFlow = s.phase === 'generating' || s.phase === 'review';
        const stepsHtml = STEPS.map((x, i) => {
            const active  = i === currentIdx;
            const done    = i < currentIdx;
            const locked  = isNewFlow && i > currentIdx;
            const cls     = active ? 'active' : done ? 'done' : locked ? 'locked' : '';
            const onclick = locked ? '' : `onclick="openStep('${x.key}')"`;
            return `<button class="step ${cls}" ${onclick} ${locked ? 'disabled' : ''}>
                        <span class="num">${i + 1}</span>
                        <span>${x.label}</span>
                    </button>${i < 2 ? `<span class="sep">›</span>` : ''}`;
        }).join('');

        // Right-side action button
        let actionBtn = '';
        if (s.phase === 'generating') {
            actionBtn = `<button class="btn-primary" disabled><span class="spin">◌</span> Generating…</button>`;
        } else if (s.phase === 'review') {
            const nextLabel = s.step === 'requirements' ? 'Generate Design' : 'Generate Tasks';
            actionBtn = `<button class="btn-primary" onclick="approve()">Approve → ${nextLabel}</button>`;
        } else if (s.phase === 'complete') {
            actionBtn = `<button class="btn-primary" disabled>✓ Complete</button>`;
        } else {
            actionBtn = ``;
        }

        // Content area
        let bodyHtml = '';
        if (s.phase === 'generating') {
            const label = STEPS.find(x => x.key === s.step)?.label ?? '';
            bodyHtml = `<div class="loading"><div class="spinner"></div><p>Generating ${label}…</p></div>`;
        } else {
            const content = s.phase === 'complete' ? s.content : s.content;
            bodyHtml = content ? this.renderMarkdown(content) : `<p class="empty">No content yet.</p>`;
        }

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
  .content {
    flex: 1; overflow-y: auto;
    padding: 28px 40px 20px;
    max-width: 860px; width: 100%; margin: 0 auto;
  }
  h1 { font-size: 1.45em; font-weight: 700; margin-bottom: 14px; }
  h2 { font-size: 1.05em; font-weight: 600; margin: 20px 0 6px;
       border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px; }
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

  /* tasks */
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

  /* loading */
  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; opacity: .6; }
  .spinner {
    width: 28px; height: 28px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,.15);
    border-top-color: #7c3aed;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading p { font-size: 13px; }

  /* toolbar */
  .toolbar {
    flex-shrink: 0; height: 46px;
    display: flex; align-items: center; padding: 0 16px; gap: 12px;
    border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,.1));
    background: var(--vscode-editor-background);
  }
  .spec-name {
    display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap;
    padding-right: 14px; border-right: 1px solid rgba(255,255,255,.1);
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
  .step:hover:not(.active):not(:disabled) { filter: brightness(1.3); }
  .step.active  { background: #5b21b6; color: #fff; border-color: #7c3aed; }
  .step.done    { opacity: .55; }
  .step.locked, .step:disabled { opacity: .3; cursor: default; }
  .num {
    background: rgba(255,255,255,.15); border-radius: 4px;
    width: 18px; height: 18px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700;
  }
  .actions { display: flex; gap: 8px; margin-left: auto; }
  .btn-secondary {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 13px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,.18); background: transparent;
    color: var(--vscode-foreground); cursor: pointer; font-size: 12px; font-family: inherit;
  }
  .btn-secondary:hover { background: rgba(255,255,255,.07); }
  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 15px; border-radius: 6px;
    border: none; background: #6d28d9; color: #fff;
    cursor: pointer; font-size: 12px; font-weight: 500; font-family: inherit;
  }
  .btn-primary:hover:not(:disabled) { background: #7c3aed; }
  .btn-primary:disabled { opacity: .4; cursor: default; }
  .spin { display: inline-block; animation: spin .8s linear infinite; }
</style>
</head><body>
  <div class="content">${bodyHtml}</div>
  <div class="toolbar">
    <div class="spec-name">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".7">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      ${this.specName}
    </div>
    <div class="steps">${stepsHtml}</div>
    <div class="actions">
      <button class="btn-secondary" onclick="sync()">↻ Sync Files</button>
      ${actionBtn}
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function approve()    { vscode.postMessage({ command: 'approve' }); }
    function openStep(s)  { vscode.postMessage({ command: 'openStep', step: s }); }
    function sync()       { vscode.postMessage({ command: 'sync' }); }
  </script>
</body></html>`;
    }

    private renderMarkdown(raw: string): string {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const inline = (s: string) => esc(s)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/_(.+?)_/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');

        const out: string[] = [];
        let inCode = false;
        for (const line of raw.split('\n')) {
            if (line.startsWith('```')) {
                inCode ? out.push('</code></pre>') : out.push('<pre><code>');
                inCode = !inCode; continue;
            }
            if (inCode) { out.push(esc(line)); continue; }
            if (/^### /.test(line)) { out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
            if (/^## /.test(line))  { out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
            if (/^# /.test(line))   { out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
            const task = line.match(/^- \[([ x~])\] (\d+)\. (.+)/);
            if (task) {
                const state = task[1] === 'x' ? 'done' : task[1] === '~' ? 'inprogress' : 'pending';
                const icon  = task[1] === 'x' ? '✓'   : task[1] === '~' ? '◐'          : '○';
                out.push(`<div class="task ${state}"><span class="ti">${icon}</span><span class="tn">${task[2]}.</span><span class="tt">${inline(task[3])}</span></div>`);
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
}

#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'media', 'screenshots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

async function shot(html, name, w, h) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(outDir, name) });
  await page.close();
  console.log(`✓ ${name}`);
}

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px; background: #1e1e1e; color: #cccccc; overflow: hidden;
  }
  .mono { font-family: 'Cascadia Code', Consolas, 'Courier New', monospace; font-size: 13px; }
`;

// ─── newspec.png ─────────────────────────────────────────────────────────────

const NEWSPEC = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.editor-bg {
  position: absolute; inset: 0;
  background: #1e1e1e;
  padding: 20px 30px;
  filter: blur(1.5px) brightness(0.45);
  pointer-events: none;
}
.code-line { line-height: 1.7; }
.c-comment { color: #6a9955; }
.c-keyword { color: #569cd6; }
.c-string  { color: #ce9178; }
.c-fn      { color: #dcdcaa; }
.c-var     { color: #9cdcfe; }
.c-plain   { color: #cccccc; }
.overlay {
  position: absolute; inset: 0;
  display: flex; align-items: flex-start;
  justify-content: center; padding-top: 68px;
}
.modal {
  width: 580px;
  background: #2d2d2d;
  border: 1px solid #454545;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  overflow: hidden;
}
.modal-title {
  padding: 10px 14px 6px;
  color: #858585; font-size: 11px; letter-spacing: 0.5px;
  border-bottom: 1px solid #3c3c3c;
}
.input-row {
  display: flex; align-items: center;
  padding: 9px 14px; gap: 8px;
  background: #3c3c3c;
  border-bottom: 1px solid #007fd4;
}
.star { color: #569cd6; font-size: 14px; }
.input-text { color: #ffffff; font-size: 13px; flex: 1; }
.cursor { display: inline-block; width: 1px; height: 14px; background: #aeafad; vertical-align: text-bottom; animation: none; }
.examples { padding: 10px 14px; }
.examples-label { font-size: 11px; color: #858585; letter-spacing: 0.6px; margin-bottom: 7px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip {
  background: #3c3c3c; border: 1px solid #555;
  border-radius: 3px; padding: 3px 9px;
  font-size: 12px; color: #cccccc; cursor: pointer;
}
.footer {
  border-top: 1px solid #3c3c3c;
  padding: 7px 14px;
  display: flex; gap: 16px; align-items: center;
  font-size: 12px; color: #858585;
}
.key {
  display: inline-block; background: #3c3c3c; border: 1px solid #555;
  border-radius: 3px; padding: 1px 6px; font-size: 11px;
  color: #cccccc; margin-right: 4px;
}
.statusbar {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 22px; background: #007acc;
  display: flex; align-items: center; padding: 0 10px;
  font-size: 12px; color: #ffffff; gap: 12px;
}
</style></head><body>
<div class="editor-bg mono">
  <div class="code-line"><span class="c-comment">// src/index.ts</span></div>
  <div class="code-line"><span class="c-keyword">import</span> <span class="c-var">express</span> <span class="c-keyword">from</span> <span class="c-string">'express'</span><span class="c-plain">;</span></div>
  <div class="code-line"></div>
  <div class="code-line"><span class="c-keyword">const</span> <span class="c-var">app</span> <span class="c-plain">= </span><span class="c-fn">express</span><span class="c-plain">();</span></div>
  <div class="code-line"><span class="c-var">app</span><span class="c-plain">.</span><span class="c-fn">use</span><span class="c-plain">(</span><span class="c-fn">express</span><span class="c-plain">.</span><span class="c-fn">json</span><span class="c-plain">());</span></div>
  <div class="code-line"></div>
  <div class="code-line"><span class="c-var">app</span><span class="c-plain">.</span><span class="c-fn">listen</span><span class="c-plain">(</span><span class="c-string">3000</span><span class="c-plain">, () => {</span></div>
  <div class="code-line"><span class="c-plain">  </span><span class="c-var">console</span><span class="c-plain">.</span><span class="c-fn">log</span><span class="c-plain">(</span><span class="c-string">'listening'</span><span class="c-plain">);</span></div>
  <div class="code-line"><span class="c-plain">});</span></div>
</div>

<div class="overlay">
  <div class="modal">
    <div class="modal-title">KOSMO: DESCRIBE WHAT YOU WANT TO BUILD</div>
    <div class="input-row">
      <span class="star">✦</span>
      <span class="input-text">Add rate limiting to the REST API using Redis sliding window</span>
      <span class="cursor"></span>
    </div>
    <div class="examples">
      <div class="examples-label">EXAMPLES</div>
      <div class="chips">
        <span class="chip">User authentication with JWT</span>
        <span class="chip">CSV data export endpoint</span>
        <span class="chip">WebSocket notifications</span>
        <span class="chip">File upload with S3</span>
      </div>
    </div>
    <div class="footer">
      <span><span class="key">Enter</span> Generate spec</span>
      <span><span class="key">Esc</span> Cancel</span>
    </div>
  </div>
</div>

<div class="statusbar">
  <span>⎇ main</span>
  <span>⊘ 0 △ 0</span>
  <span style="margin-left:auto">TypeScript &nbsp; UTF-8</span>
</div>
</body></html>`;

// ─── sidebar.png ──────────────────────────────────────────────────────────────

const SIDEBAR = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
html, body { height: 100%; }
.window { display: flex; flex-direction: column; height: 100%; }
.top { display: flex; flex: 1; overflow: hidden; }
.activity-bar {
  width: 46px; background: #333333;
  display: flex; flex-direction: column;
  align-items: center; padding-top: 6px; gap: 4px;
  border-right: 1px solid #252526;
}
.act-icon {
  width: 36px; height: 36px; display: flex;
  align-items: center; justify-content: center;
  font-size: 18px; color: #858585; border-radius: 5px;
  cursor: pointer;
}
.act-icon.active { color: #ffffff; border-left: 2px solid #ffffff; border-radius: 0; }
.sidebar {
  width: 260px; background: #252526;
  display: flex; flex-direction: column;
  border-right: 1px solid #1e1e1e;
  overflow: hidden;
}
.sidebar-section-title {
  padding: 8px 12px 4px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.8px;
  color: #bbbbbb; text-transform: uppercase;
}
.panel-header {
  display: flex; align-items: center;
  padding: 4px 8px 2px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
  color: #bbbbbb; text-transform: uppercase;
  gap: 4px;
}
.panel-header-icons { margin-left: auto; display: flex; gap: 6px; color: #858585; font-size: 14px; }
.tree { flex: 1; overflow-y: auto; }
.tree-group { margin-bottom: 2px; }
.tree-group-title {
  display: flex; align-items: center; gap: 5px;
  padding: 2px 8px 2px 12px;
  font-size: 13px; color: #cccccc; cursor: pointer;
  border-radius: 2px;
}
.tree-group-title:hover { background: #2a2d2e; }
.folder-icon { color: #c09553; font-size: 13px; }
.tree-item {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 8px 2px 30px;
  font-size: 13px; color: #cccccc; cursor: pointer;
  border-radius: 2px;
  white-space: nowrap; overflow: hidden;
}
.tree-item:hover { background: #2a2d2e; }
.tree-item.active { background: #094771; color: #ffffff; }
.tree-item.done { color: #858585; text-decoration: line-through; }
.status-dot { font-size: 12px; flex-shrink: 0; }
.editor { flex: 1; display: flex; flex-direction: column; background: #1e1e1e; }
.tabs {
  display: flex; background: #2d2d2d; border-bottom: 1px solid #252526;
  height: 35px; align-items: flex-end;
}
.tab {
  padding: 7px 14px; font-size: 13px; cursor: pointer;
  border-right: 1px solid #252526;
  color: #858585; background: #2d2d2d;
}
.tab.active {
  background: #1e1e1e; color: #cccccc;
  border-top: 1px solid #007acc;
}
.code { flex: 1; padding: 14px 0; overflow: hidden; }
.line {
  display: flex; height: 19px; align-items: center;
  padding: 0 20px 0 0; font-size: 13px;
}
.ln { width: 36px; text-align: right; color: #5a5a5a; font-size: 12px; margin-right: 14px; flex-shrink: 0; }
.c-h1    { color: #569cd6; font-weight: bold; }
.c-h2    { color: #4ec9b0; font-weight: bold; }
.c-plain { color: #cccccc; }
.c-done  { color: #858585; text-decoration: line-through; }
.c-prog  { color: #dcdcaa; }
.c-pend  { color: #cccccc; }
.c-detail{ color: #858585; }
.c-req   { color: #c586c0; font-style: italic; }
.c-lens  { color: #3794ff; font-size: 12px; cursor: pointer; }
.statusbar {
  height: 22px; background: #007acc;
  display: flex; align-items: center; padding: 0 10px;
  font-size: 12px; color: #ffffff; gap: 12px;
}
</style></head><body>
<div class="window">
  <div class="top">
    <div class="activity-bar">
      <div class="act-icon active">&#xe6b5;</div>
      <div class="act-icon">&#xe60f;</div>
      <div class="act-icon">&#xe72c;</div>
      <div class="act-icon">&#xe683;</div>
      <div class="act-icon">&#xeb54;</div>
    </div>

    <div class="sidebar">
      <div class="sidebar-section-title">Explorer</div>
      <div class="panel-header">
        Kosmo Tasks
        <div class="panel-header-icons">
          <span title="New Spec">+</span>
          <span title="Refresh">↻</span>
        </div>
      </div>
      <div class="tree">
        <div class="tree-group">
          <div class="tree-group-title">
            <span class="folder-icon">▼</span>
            <span class="folder-icon">📁</span>
            user-auth
          </div>
          <div class="tree-item done">
            <span class="status-dot">✅</span>
            <span>1. Scaffold project structure</span>
          </div>
          <div class="tree-item done">
            <span class="status-dot">✅</span>
            <span>2. JWT token generation</span>
          </div>
          <div class="tree-item active">
            <span class="status-dot">⌛</span>
            <span>3. Refresh token rotation</span>
          </div>
          <div class="tree-item">
            <span class="status-dot">○</span>
            <span>4. Rate limiting middleware</span>
          </div>
          <div class="tree-item">
            <span class="status-dot">○</span>
            <span>5. Integration tests</span>
          </div>
        </div>
        <div class="tree-group">
          <div class="tree-group-title">
            <span class="folder-icon">▶</span>
            <span class="folder-icon">📁</span>
            data-export
          </div>
          <div class="tree-item">
            <span class="status-dot">○</span>
            <span>1. CSV serializer</span>
          </div>
          <div class="tree-item">
            <span class="status-dot">○</span>
            <span>2. Streaming download handler</span>
          </div>
        </div>
      </div>
    </div>

    <div class="editor">
      <div class="tabs">
        <div class="tab active">tasks.md</div>
        <div class="tab">requirements.md</div>
        <div class="tab">design.md</div>
      </div>
      <div class="code mono">
        <div class="line"><span class="ln">1</span><span class="c-h1"># User Authentication</span></div>
        <div class="line"><span class="ln">2</span></div>
        <div class="line"><span class="ln">3</span><span class="c-h2">## Overview</span></div>
        <div class="line"><span class="ln">4</span><span class="c-plain">Implement JWT-based auth with refresh token rotation.</span></div>
        <div class="line"><span class="ln">5</span></div>
        <div class="line"><span class="ln">6</span><span class="c-h2">## Tasks</span></div>
        <div class="line"><span class="ln">7</span></div>
        <div class="line"><span class="ln">8</span><span class="c-done">- [x] 1. Scaffold project structure</span></div>
        <div class="line"><span class="ln">9</span><span class="c-detail">&nbsp;&nbsp;- Create src/auth directory with index.ts entry</span></div>
        <div class="line"><span class="ln">10</span><span class="c-req">&nbsp;&nbsp;- _Requirements: 1.1, 1.2_</span></div>
        <div class="line"><span class="ln">11</span></div>
        <div class="line"><span class="ln">12</span><span class="c-done">- [x] 2. JWT token generation</span></div>
        <div class="line"><span class="ln">13</span><span class="c-detail">&nbsp;&nbsp;- Implement sign/verify with RS256</span></div>
        <div class="line"><span class="ln">14</span><span class="c-req">&nbsp;&nbsp;- _Requirements: 2.1, 2.2_</span></div>
        <div class="line"><span class="ln">15</span></div>
        <div class="line"><span class="ln">16</span><span class="c-prog">- [~] 3. Refresh token rotation</span></div>
        <div class="line"><span class="ln">17</span><span class="c-detail">&nbsp;&nbsp;- Store refresh tokens in Redis with TTL</span></div>
        <div class="line"><span class="ln">18</span><span class="c-detail">&nbsp;&nbsp;- Invalidate old token on rotation</span></div>
        <div class="line"><span class="ln">19</span><span class="c-req">&nbsp;&nbsp;- _Requirements: 2.3_</span></div>
        <div class="line"><span class="ln">20</span></div>
        <div class="line"><span class="ln">21</span><span class="c-lens">&nbsp;&nbsp;▶ Start task</span></div>
        <div class="line"><span class="ln">22</span><span class="c-pend">- [ ] 4. Rate limiting middleware</span></div>
        <div class="line"><span class="ln">23</span><span class="c-detail">&nbsp;&nbsp;- Sliding window counter per IP</span></div>
        <div class="line"><span class="ln">24</span><span class="c-req">&nbsp;&nbsp;- _Requirements: 3.1_</span></div>
        <div class="line"><span class="ln">25</span></div>
        <div class="line"><span class="ln">26</span><span class="c-lens">&nbsp;&nbsp;▶ Start task</span></div>
      </div>
    </div>
  </div>

  <div class="statusbar">
    <span>⎇ main</span>
    <span>⊘ 0 △ 0</span>
    <span style="margin-left:auto">Markdown &nbsp; UTF-8</span>
  </div>
</div>
</body></html>`;

// ─── selectcli.png ────────────────────────────────────────────────────────────

const SELECTCLI = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
.editor-bg {
  position: absolute; inset: 0;
  background: #1e1e1e;
  padding: 14px 24px;
  filter: blur(1.5px) brightness(0.45);
  pointer-events: none;
}
.code-line { line-height: 1.7; }
.c-comment { color: #6a9955; }
.c-keyword { color: #569cd6; }
.c-string  { color: #ce9178; }
.c-fn      { color: #dcdcaa; }
.c-var     { color: #9cdcfe; }
.c-plain   { color: #cccccc; }
.overlay {
  position: absolute; inset: 0;
  display: flex; align-items: flex-start;
  justify-content: center; padding-top: 60px;
}
.quickpick {
  width: 560px;
  background: #252526;
  border: 1px solid #454545;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  overflow: hidden;
}
.qp-search {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px;
  background: #3c3c3c;
  border-bottom: 1px solid #007fd4;
}
.qp-icon { color: #858585; font-size: 14px; }
.qp-label { color: #cccccc; font-size: 13px; }
.qp-list { }
.qp-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 14px; cursor: pointer;
  border-left: 2px solid transparent;
}
.qp-item:hover { background: #2a2d2e; }
.qp-item.selected {
  background: #04395e;
  border-left-color: #007fd4;
}
.qp-item-label { font-size: 13px; color: #cccccc; }
.qp-item-desc  { font-size: 12px; color: #858585; margin-left: auto; }
.qp-hint {
  border-top: 1px solid #3c3c3c;
  padding: 6px 14px; font-size: 11px; color: #858585;
}
.statusbar {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 22px; background: #007acc;
  display: flex; align-items: center; padding: 0 10px;
  font-size: 12px; color: #ffffff; gap: 12px;
}
</style></head><body>
<div class="editor-bg mono">
  <div class="code-line"><span class="c-comment">// src/services/specGenerator.ts</span></div>
  <div class="code-line"><span class="c-keyword">import</span> <span class="c-plain">{ </span><span class="c-var">runWithCli</span><span class="c-plain"> } </span><span class="c-keyword">from</span> <span class="c-string">'./llmCli'</span><span class="c-plain">;</span></div>
  <div class="code-line"></div>
  <div class="code-line"><span class="c-keyword">export async function</span> <span class="c-fn">generateRequirements</span><span class="c-plain">(</span></div>
  <div class="code-line"><span class="c-plain">  </span><span class="c-var">goal</span><span class="c-plain">: </span><span class="c-keyword">string</span><span class="c-plain">, </span><span class="c-var">specDir</span><span class="c-plain">: </span><span class="c-keyword">string</span><span class="c-plain">, </span><span class="c-var">cwd</span><span class="c-plain">: </span><span class="c-keyword">string</span></div>
  <div class="code-line"><span class="c-plain">): </span><span class="c-keyword">Promise</span><span class="c-plain">&lt;</span><span class="c-keyword">string</span><span class="c-plain">&gt; {</span></div>
  <div class="code-line"><span class="c-plain">  </span><span class="c-keyword">const</span> <span class="c-var">content</span><span class="c-plain"> = </span><span class="c-keyword">await</span> <span class="c-fn">runWithCli</span><span class="c-plain">(</span><span class="c-fn">requirementsPrompt</span><span class="c-plain">(</span><span class="c-var">goal</span><span class="c-plain">), </span><span class="c-var">cwd</span><span class="c-plain">);</span></div>
</div>

<div class="overlay">
  <div class="quickpick">
    <div class="qp-search">
      <span class="qp-icon">🔍</span>
      <span class="qp-label">Select AI CLI for spec generation</span>
    </div>
    <div class="qp-list">
      <div class="qp-item selected">
        <span class="qp-item-label">Claude Code (claude)</span>
        <span class="qp-item-desc">claude</span>
      </div>
      <div class="qp-item">
        <span class="qp-item-label">Gemini CLI (gemini)</span>
        <span class="qp-item-desc">gemini</span>
      </div>
      <div class="qp-item">
        <span class="qp-item-label">OpenAI Codex (codex)</span>
        <span class="qp-item-desc">codex</span>
      </div>
      <div class="qp-item">
        <span class="qp-item-label">OpenCode (opencode)</span>
        <span class="qp-item-desc">opencode</span>
      </div>
      <div class="qp-item">
        <span class="qp-item-label">DeepSeek CLI (deepseek)</span>
        <span class="qp-item-desc">deepseek</span>
      </div>
      <div class="qp-item">
        <span class="qp-item-label">llm (Simon Willison)</span>
        <span class="qp-item-desc">llm</span>
      </div>
    </div>
    <div class="qp-hint">Only CLIs found in PATH are shown · Change anytime via "Kosmo: Select AI CLI"</div>
  </div>
</div>

<div class="statusbar">
  <span>⎇ feat/multi-llm</span>
  <span>⊘ 0 △ 0</span>
  <span style="margin-left:auto">TypeScript &nbsp; UTF-8</span>
</div>
</body></html>`;

// ─── run ──────────────────────────────────────────────────────────────────────

await shot(NEWSPEC,    'newspec.png',    858, 482);
await shot(SIDEBAR,   'sidebar.png',    912, 576);
await shot(SELECTCLI, 'selectcli.png',  800, 450);

await browser.close();
console.log('done →', outDir);

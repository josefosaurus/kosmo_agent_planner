# Kosmo Sidekick — AGENTS.md

VSCode extension. Spec-driven dev: describe goal → generate requirements/design/tasks → run each task via `claude` subprocess.

## Commands

```
npm run compile        # tsc -p ./
npm run watch          # tsc -watch -p ./
npm test               # compile + node --test out/test/suite.test.js
npm run lint           # eslint src --ext .ts
npm run package        # vsce package --no-dependencies
npm run screenshots    # node scripts/take-screenshots.mjs (Playwright)

# single test (after compile):
node --test out/test/suite.test.js --test-name-pattern "pruneRequirements"
```

**F5** in VSCode launches Extension Dev Host (preLaunchTask: `npm run watch`).

## Build/test quirks

- `npm test` compiles first (required — no precompile step). Test runner is `node:test`, not jest/mocha.
- Single test: `node --test out/test/suite.test.js --test-name-pattern "pruneRequirements"` (name is substring match on `test('…')` string).
- Only 1 test file: `src/test/suite.test.ts` (exports `parseTasks` from `views/tasksDataProvider.ts`, tests `contextPruner` and `taskTier`).
- `out/`, `*.vsix`, `.vscode-test/` in .gitignore.
- `src/`, `**/*.map`, `package-lock.json`, `kosmo_specs.md` in .vscodeignore (not shipped).

## Architecture

- **Entry**: `src/extension.ts` activates `onStartupFinished`. Registers treeDataProvider (`kosmoTasks`), commands, CodeLens provider, custom editor provider, file watcher.
- **Spec file layout** (written to user's workspace, not this repo):
  ```
  .kosmo/specs/[spec-name]/{goal.txt,requirements.md,design.md,tasks.md}
  ```
- **Spec generation flow** — `SpecToolbarPanel` (singleton webview) runs 3 sequential CLIs: requirements → design → tasks. Each generated at `opus` tier via `runWithCli()`.
- **Task execution** — always uses `claude` subprocess directly (`spawn('claude', ['-p', prompt, '--output-format', 'stream-json', '--verbose'])`). Other CLIs lack Read/Write/Edit/Bash tooling.
- **Custom editor** — `SpecCustomEditorProvider` replaces default editor for `**/.kosmo/specs/**/{requirements,design,tasks}.md` (priority `default`). Includes line-numbered textarea with 400ms debounced `WorkspaceEdit`.
- **File watcher** — `**/.kosmo/specs/**/tasks.md` changes auto-refresh sidebar + toolbar panel.
- **No external runtime deps** — only `@types/vscode`, `@types/node`, dev tooling.

## Multi-LLM CLI layer (`src/services/llmCli.ts`)

- `KNOWN_CLIS` adapters: `claude`, `gemini`, `codex`, `opencode`, `deepseek`, `llm`, `sgpt`, `subq`, `miami`.
- `opencode` uses `['run', p]` (not `-p`).
- `gemini` and `opencode` have `wrapPrompt` to force text output (they're agents that prefer file tools).
- `gemini` has `trustGate` (exit 55 → retry with `--skip-trust` after user approval).
- Selected CLI stored in `kosmo.specCli` (global config). Auto-detected from PATH on first use.
- Model flag mapping per CLI: `resolveModelFlag(bin, tier)` → `--model` or equivalent.
- Spec generation always `opus` tier. Task tier resolved per-task via `resolveTaskTier()` (default `sonnet`).

## Key implementation details

- **Task state regex** (`taskTracker.ts`): `^(- \[)[ ~x](\] N\.)` — N must match the integer prefix in `N. Task title`. Editing task index in tasks.md will break tracking.
- **Running process tracking** (`taskRunner.ts`): `Map<string, ChildProcess>` keyed by `tasksFilePath:taskIndex`.
- **NDJSON streaming** (`taskRunner.ts`): parses `--output-format stream-json` lines. `type: 'assistant'` → extract `tool_use` block. `type: 'result'` → extract `cost_usd`.
- **Requirements pruning** (`contextPruner.ts`): `_Requirements: 1.1, 1.2_` → `pruneRequirements(content, refs)` extracts only referenced `### N.N` subsections from requirements.md. Falls back to full content if no refs match.
- **Task tier annotation** (`taskTier.ts`): `[model:haiku|sonnet|opus]` in title or any detail line (case-insensitive). Default `sonnet`.
- **CLAUDE.md guard** (`taskRunner.ts`): warns in output channel if user's CLAUDE.md exceeds ~2000 tokens (rough estimate: `content.length / 4`).
- **`TaskItem.contextValue`**: `pendingTask` | `inprogressTask` | `doneTask` — controls inline buttons in sidebar menu.
- **Delete spec** (`kosmo.deleteSpec`): `fs.rm(specDir, { recursive: true })` after modal confirmation.
- **Discover command** (`commands/discover.ts`): runs `subq` or `miami` CLI with freetext query, offers copy or new spec.

## Tasks.md format (parsed by `parseTasks`)

```
- [ ] 1. Task title
  - detail line
  - [model:haiku]
  - _Requirements: 1.1, 1.2_
```

States: `[ ]` pending · `[~]` in progress · `[x]` done. Detail/requirements lines require 2-space indent prefix (`  - `).

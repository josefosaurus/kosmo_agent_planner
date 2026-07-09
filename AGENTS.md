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
- Only 1 test file: `src/test/suite.test.ts`. Covers `pruneRequirements`, `parseRequirementsRefs`, `resolveTaskTier`. `parseTasks` exported but not yet tested.
- `out/`, `*.vsix`, `.vscode-test/` in .gitignore.
- `src/`, `**/*.map`, `package-lock.json`, `kosmo_specs.md` in .vscodeignore (not shipped).

## Architecture

- **Entry**: `src/extension.ts` activates `onStartupFinished`. Registers treeDataProvider (`kosmoTasks`), commands, CodeLens provider, custom editor provider, file watcher.
- **Spec file layout** (written to user's workspace, not this repo):
  ```
  .kosmo/specs/[spec-name]/{goal.txt,requirements.md,design.md,tasks.md}
  ```
  `goal.txt` stores the original goal string; used by "Sync Files" to re-run all 3 generation steps.
- **Spec generation flow** — `SpecToolbarPanel` (singleton webview) runs 3 sequential CLIs: requirements → design → tasks. Each generated at `opus` tier via `runWithCli()`.
- **Task execution** — always uses `claude` subprocess directly (`spawn('claude', ['-p', prompt, '--output-format', 'stream-json', '--verbose'])`). Other CLIs lack Read/Write/Edit/Bash tooling.
- **No external runtime deps** — only `@types/vscode`, `@types/node`, dev tooling.

## Source layout (`src/`)

- `commands/` — `newSpec.ts`, `startTask.ts`, `discover.ts`
- `services/` — `llmCli.ts`, `specGenerator.ts`, `taskRunner.ts`, `taskTracker.ts`
- `views/` — `tasksDataProvider.ts` (sidebar tree), `specToolbar.ts` (new-spec panel), `specCustomEditor.ts` (saved-spec viewer)
- `providers/` — `codelensProvider.ts` (▶ Start task buttons on tasks.md)
- `utils/` — `fileSystem.ts` (mkdir/write helpers), `templates.ts` (all Claude prompt strings + CLAUDE.md template)

## Two webview systems

**`SpecToolbarPanel`** (`src/views/specToolbar.ts`) — singleton panel for **spec creation**. States: `generating → review → [approve] → generating next step → complete → error`. `specInfoFromUri()` maps open spec file URI to `{ specName, specDir, step }`.

**`SpecCustomEditorProvider`** (`src/views/specCustomEditor.ts`) — registered as `kosmo.specEditor` for `requirements.md`, `design.md`, `tasks.md` (priority `default`). Renders line-numbered textarea with 400ms debounced `WorkspaceEdit`. For `tasks.md`, renders task action bar: pending → ▶ start; running → ⏹ kill.

Both render markdown to raw HTML/CSS — no external markdown library.

## Multi-LLM CLI layer (`src/services/llmCli.ts`)

- `KNOWN_CLIS` adapters: `claude`, `gemini`, `codex`, `opencode`, `deepseek`, `llm`, `sgpt`, `subq`, `miami`.
- `opencode` uses `['run', p]` args (not `-p`).
- `gemini` and `opencode` have `wrapPrompt` to force text output (they prefer file tools).
- `gemini` has `trustGate` (exit 55 → retry with `--skip-trust` after user approval).
- Selected CLI stored in `kosmo.specCli` (global config). Auto-detected from PATH on first use.
- `resolveModelFlag(bin, tier)` → per-CLI model flags:
  - `claude`: `--model claude-haiku-*` / `claude-sonnet-*` / `claude-opus-*`
  - `opencode`: `-m anthropic/claude-*`
  - `codex`: maps to `gpt-4o-mini` / `gpt-4o` / `o3`
  - `deepseek`: haiku+sonnet → `deepseek-chat`, opus → `deepseek-reasoner`
  - `gemini`: returns empty (uses CLI default)
- Spec generation always `opus` tier. Task tier resolved per-task via `resolveTaskTier()` (default `sonnet`).

## Key implementation details

- **Task state regex** (`taskTracker.ts`): `^(- \[)[ ~x](\] N\.)` — N must match the integer prefix in `N. Task title`. Editing task index in tasks.md breaks tracking.
- **`parseTasks` regex** (`tasksDataProvider.ts`): `^- \[([ x~])\] (\d+)\. (.+)`. Detail lines (`  - text`) and requirements lines (`  - _Requirements: …_`) require 2-space indent prefix.
- **Running process tracking** (`taskRunner.ts`): `Map<string, ChildProcess>` keyed by `tasksFilePath:taskIndex`.
- **NDJSON streaming** (`taskRunner.ts`): parses `--output-format stream-json` lines. `type: 'assistant'` → extract `tool_use` block. `type: 'result'` → extract `cost_usd`.
- **Requirements pruning** (`contextPruner.ts`): `_Requirements: 1.1, 1.2_` → `pruneRequirements(content, refs)` extracts only referenced `### N.N` subsections. Falls back to full content if no refs match.
- **Task tier annotation** (`taskTier.ts`): `[model:haiku|sonnet|opus]` in title or any detail line (case-insensitive). Default `sonnet`.
- **Prompt templates** (`utils/templates.ts`): `requirementsPrompt()`, `designPrompt()`, `tasksPrompt()` — tune here to improve generation quality or output format.
- **CLAUDE.md guard** (`taskRunner.ts`): warns in output channel if user's CLAUDE.md exceeds ~2000 tokens (rough estimate: `content.length / 4`).
- **CLAUDE.md injection** (`utils/templates.ts`): `claudeMdTemplate()` writes template CLAUDE.md to user's project root; injected into every task prompt as "## Project Context".
- **`TaskItem.contextValue`**: `pendingTask` | `inprogressTask` | `doneTask` — controls inline buttons in sidebar menu.
- **Delete spec** (`kosmo.deleteSpec`): `fs.rm(specDir, { recursive: true })` after modal confirmation. Registered on `specGroup` context value.
- **Discover command** (`commands/discover.ts`): runs `subq` or `miami` CLI with freetext query, streams to output channel, offers copy or new spec.
- **File watcher** — `**/.kosmo/specs/**/tasks.md` changes auto-refresh sidebar + toolbar panel.

## Tasks.md format (parsed by `parseTasks`)

```
- [ ] 1. Task title
  - detail line
  - [model:haiku]
  - _Requirements: 1.1, 1.2_
```

States: `[ ]` pending · `[~]` in progress · `[x]` done. Detail/requirements lines require 2-space indent prefix (`  - `).

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VSCode extension "Kosmo Sidekick" — spec-driven development assistant that replicates Kiro's workflow using Claude Code CLI as agent backend. Source spec: `kosmo_specs.md`.

## Commands

```bash
npm install          # install deps
npm run compile      # TypeScript build
npm run watch        # watch mode for dev
npm run lint         # lint
npm run package      # create .vsix
npm test             # compile + run node:test suite
npm run screenshots  # capture marketplace screenshots via Playwright

# run a single test by name pattern (after compile):
node --test out/test/suite.test.js --test-name-pattern "pruneRequirements"
```

Press **F5** in VSCode to launch Extension Development Host.

## Architecture

**Entry point**: `src/extension.ts` — registers commands, views, providers, and a `FileSystemWatcher` on `**/.kosmo/specs/**/tasks.md` that auto-refreshes the sidebar.

**Core flow**:
1. "Kosmo: New Spec" → user inputs goal → `SpecToolbarPanel` (webview) drives a 3-step generation+review flow: requirements → design → tasks, each generated via `specGenerator` → `runWithCli()`
2. `TasksDataProvider` parses `tasks.md` and populates sidebar tree grouped by spec folder
3. User clicks "▶ Start task" (CodeLens on tasks.md, sidebar inline button, or custom editor task bar)
4. `taskRunner` spawns `claude -p <prompt> --output-format stream-json --verbose` and streams tool-use events to an Output Channel
5. On exit code 0, `taskTracker.markDone` rewrites the task checkbox in tasks.md via regex; kill or failure reverts to `[ ]`

**User project file layout** (written to the user's workspace, not this repo):
```
.kosmo/specs/[spec-name]/
  goal.txt          ← original goal string, used by "Sync Files"
  requirements.md
  design.md
  tasks.md
```

**Source layout** (`src/`):
- `commands/` — `newSpec.ts` (prompt user, create spec dir, launch toolbar), `startTask.ts` (mark in-progress, delegate to taskRunner)
- `services/` — `specGenerator.ts`, `taskRunner.ts`, `taskTracker.ts`
- `views/` — `tasksDataProvider.ts` (sidebar tree), `specToolbar.ts` (new-spec panel), `specCustomEditor.ts` (saved-spec viewer)
- `providers/` — `codelensProvider.ts` (▶ Start task buttons on tasks.md)
- `utils/` — `fileSystem.ts` (mkdir/write helpers), `templates.ts` (all Claude prompt strings + CLAUDE.md template)

**Two webview panels**:
- `SpecToolbarPanel` (`views/specToolbar.ts`): singleton panel launched by "New Spec"; owns the step-by-step generate → review → approve flow
- `SpecCustomEditorProvider` (`views/specCustomEditor.ts`): registered as a custom editor for `.kosmo/specs/**/*.md`; renders saved spec files with the same markdown renderer, step nav, and sync button
- Both render markdown to raw HTML/CSS — no external markdown library

## Two webview systems

**`SpecToolbarPanel`** (`src/views/specToolbar.ts`) — singleton panel used during **spec creation**. States: `generating → review → [approve] → generating next step → complete → error`. "Sync Files" re-runs all three generation steps from `goal.txt`. `specInfoFromUri()` maps an open spec file URI to `{ specName, specDir, step }` — used to update the panel when the user opens a spec file.

**`SpecCustomEditorProvider`** (`src/views/specCustomEditor.ts`) — registered as `kosmo.specEditor` custom editor for `requirements.md`, `design.md`, and `tasks.md`. Opens automatically when the user opens any spec file (replaces the default text editor). Renders a textarea with line numbers, a step-navigation toolbar (Requirements › Design › Task list), and sync/continue buttons. For `tasks.md`, also renders a task action bar: pending tasks show a ▶ start button; running tasks show a ⏹ kill button. Edits are debounced 400 ms then applied via `WorkspaceEdit`. The "Open Preview" floating button opens the standard markdown preview.

## Multi-LLM CLI layer (`src/services/llmCli.ts`)

**Spec generation** uses any detected CLI via `runWithCli(prompt, cwd, tier?)`. The selected CLI is saved in `kosmo.specCli` (VSCode config). Auto-detected from PATH on first run; user can override via "Kosmo: Select AI CLI".

**Task execution** always uses `claude` subprocess directly — other CLIs lack Claude Code's built-in tooling (Read/Write/Edit/Bash).

**`KNOWN_CLIS`** — adapters for: `claude`, `gemini`, `codex`, `opencode`, `deepseek`, `llm`, `sgpt`, `subq`, `miami`. Each adapter defines `args(prompt)` and optionally `wrapPrompt` (forces text output instead of file-tool calls — used by `gemini` and `opencode`) and `trustGate` (retry with extra args after specific exit code, e.g. Gemini exits 55 without trust). `opencode` uses `['run', p]` args (not `-p`).

**Model tiers** (`ModelTier = 'haiku' | 'sonnet' | 'opus'`): `resolveModelFlag(cliBin, tier)` maps tiers to CLI-specific flags. `claude` uses `--model claude-*`; `opencode` uses `-m anthropic/claude-*`; `codex` maps to `gpt-4o-mini/gpt-4o/o3`; `deepseek` maps haiku+sonnet to `deepseek-chat`, opus to `deepseek-reasoner`; Gemini returns empty (uses CLI default). Spec generation calls at `opus` tier; task execution tier is resolved per-task.

## Task model tier (`src/utils/taskTier.ts`)

`resolveTaskTier(title, details)` scans title + detail lines for `[model:haiku|sonnet|opus]` annotation. Defaults to `sonnet`. Tag is case-insensitive and can appear in any detail line.

## Requirements pruning (`src/utils/contextPruner.ts`)

Each task may have `  - _Requirements: 1.1, 1.2_`. `parseRequirementsRefs(line)` parses that annotation into `['1.1', '1.2']`. `pruneRequirements(content, refs)` extracts only the referenced `### N.N` subsections from `requirements.md`, reducing prompt size. Falls back to full content if no refs match.

## Key implementation details

**Task state regex** (`taskTracker.ts`): `^(- \[)[ ~x](\] N\.)` where N is the integer task index. The index must match the number prefix in `N. Task title` exactly.

**Running process tracking** (`taskRunner.ts`): module-level `Map<string, ChildProcess>` keyed by `tasksFilePath:taskIndex`. `isRunning()` checks this map; sidebar and custom editor both use it to decide which button to render.

**NDJSON streaming** (`taskRunner.ts`): parses `--output-format stream-json` lines. `type === 'assistant'` → extract `tool_use` block → `toolLabel(name, input)`. `type === 'result'` → extract `cost_usd` and error subtype.

**`parseTasks`** (`tasksDataProvider.ts`): exported for testing. Parses lines matching `^- \[([ x~])\] (\d+)\. (.+)`. Detail lines (`  - text`) and requirements lines (`  - _Requirements: …_`) are attached to the preceding task.

**`TaskItem.contextValue`**: `pendingTask` | `inprogressTask` | `doneTask` — drives which inline buttons show in `package.json` menus.

**Prompt templates** (`utils/templates.ts`): `requirementsPrompt()`, `designPrompt()`, and `tasksPrompt()` generate the three Claude prompts used in spec generation. This is the right place to tune generation quality or output format.

**Test suite** (`src/test/suite.test.ts`): uses `node:test`. Covers `pruneRequirements`, `parseRequirementsRefs`, and `resolveTaskTier`. `parseTasks` is exported for testing but not yet covered.

**CLAUDE.md guard** (`taskRunner.ts`): `guardClaudeMdSize` warns in Output Channel if the user's CLAUDE.md exceeds ~2000 tokens before injecting it into the task prompt.

**Discover command** (`src/commands/discover.ts`): runs `subq` or `miami` CLI with a freetext query, streams output to a channel, then offers copy-to-clipboard or "New Spec with this context".

**Delete spec** (`kosmo.deleteSpec`): prompts for confirmation then `fs.rm(specDir, { recursive: true })`. Registered on `specGroup` context value in the sidebar.

## Spec file formats

`tasks.md` task format:
```
- [ ] 1. Task title
  - detail line
  - [model:haiku]          ← optional tier override
  - _Requirements: 1.1, 1.2_
```

Task states: `[ ]` pending · `[~]` in progress · `[x]` done

## Key design decisions

- **Task execution always `claude` subprocess** — full Claude Code tooling (Read/Write/Edit/Bash) has no equivalent in other CLIs.
- **Spec generation is CLI-agnostic** — `llmCli.ts` adapters make any `-p`-style CLI work for text generation.
- **No external deps** — only `vscode` engine and Node.js built-ins.
- **CLAUDE.md injection** — extension writes a template `CLAUDE.md` to the user's project root via `claudeMdTemplate()` in `utils/templates.ts`; injected into every task prompt as "## Project Context".

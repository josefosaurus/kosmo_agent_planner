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
```

Press **F5** in VSCode to launch Extension Development Host.

## Architecture

**Entry point**: `src/extension.ts` — registers commands, views, providers, and a `FileSystemWatcher` on `**/.kosmo/specs/**/tasks.md` that auto-refreshes the sidebar.

**Core flow**:
1. "Kosmo: New Spec" → user inputs goal → `specGenerator` calls `claude -p` three times sequentially (requirements → design → tasks), writing `.kosmo/specs/[spec-name]/` files
2. `TasksDataProvider` parses `tasks.md` and populates sidebar tree grouped by spec folder
3. User clicks "▶ Start task" (CodeLens on tasks.md or sidebar inline button)
4. `taskRunner` spawns `claude -p <prompt> --output-format stream-json --verbose` and streams tool-use events to an Output Channel
5. On exit code 0, `taskTracker.markDone` rewrites the task checkbox in tasks.md via regex; kill or failure reverts to `[ ]`

**User project file layout** (written to the user's workspace, not this repo):
```
.kosmo/specs/[spec-name]/
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

## Key implementation details

**Task state regex** (`taskTracker.ts`): `^(- \[)[ ~x](\] N\.)` where N is the integer task index. The index must match the number prefix in `N. Task title` exactly.

**Running process tracking** (`taskRunner.ts`): module-level `Map<string, ChildProcess>` keyed by `tasksFilePath:taskIndex`. `isRunning()` checks this map; sidebar shows kill button for `inprogressTask` context value.

**Two spawn modes**:
- Spec generation (`specGenerator.ts`): `claude -p <prompt>` — captures full stdout as the file content
- Task execution (`taskRunner.ts`): `claude -p <prompt> --output-format stream-json --verbose` — parses NDJSON lines to extract tool-use labels and cost from `result.cost_usd`

**`parseTasks`** (`tasksDataProvider.ts`): exported for testing. Parses lines matching `^- \[([ x~])\] (\d+)\. (.+)`. Detail lines (`  - text`) and requirements lines (`  - _Requirements: …_`) are attached to the preceding task.

**`TaskItem.contextValue`**: `pendingTask` | `inprogressTask` | `doneTask` — drives which inline buttons show in `package.json` menus.

**Prompt templates** (`utils/templates.ts`): `requirementsPrompt()`, `designPrompt()`, and `tasksPrompt()` generate the three Claude prompts used in spec generation. This is the right place to tune generation quality or output format.

**No test suite**: There are no unit or integration tests — `parseTasks` is exported for testing but nothing uses it yet.

## Spec file formats

`tasks.md` task format:
```
- [ ] 1. Task title
  - detail line
  - _Requirements: 1.1, 1.2_
```

Task states: `[ ]` pending · `[~]` in progress · `[x]` done

## Key design decisions

- **Claude Code CLI subprocess, not API** — each task spawns `claude` as a child process for isolated execution and full Claude Code tooling.
- **No external deps** — only `vscode` engine and Node.js built-ins.
- **CLAUDE.md template** — extension writes a template `CLAUDE.md` to the user's project root via `claudeMdTemplate()` in `utils/templates.ts`; user fills it in, and it is injected into every agent subprocess.

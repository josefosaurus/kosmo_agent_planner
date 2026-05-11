# Performance Upgrades for Kosmo Sidekick

## Overview

Implement five performance upgrades: utilities first (contextPruner, ModelTier), then core service changes (llmCli, taskRunner, specGenerator), then the discover command, then wiring and tests.

## Tasks

- [x] 1. Add `ModelTier` type, `resolveModelFlag`, subq/miami CLIs to `llmCli.ts`
  - Add `export type ModelTier = 'haiku' | 'sonnet' | 'opus'` and `MODEL_FLAGS` record mapping each to its full Claude model ID string
  - Add `export function resolveModelFlag(cliBin, tier): string[]` — returns `['--model', MODEL_FLAGS[tier]]` when `cliBin === 'claude'`, else `[]`
  - Add `subq` and `miami` entries to `KNOWN_CLIS` with `args: p => [p]`
  - Export `isInPath` (currently unexported) so `discover.ts` can reuse it
  - Add optional `tier?: ModelTier` to `runWithCli`; when CLI is `claude` and tier provided, append `resolveModelFlag` result to spawn args; default to `'sonnet'` when omitted
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1_

- [x] 2. Update `specGenerator.ts` to use opus tier
  - Import `ModelTier` from `llmCli.ts`
  - Pass `'opus'` as third argument to all three `runWithCli` calls (`generateRequirements`, `generateDesign`, `generateTasks`)
  - _Requirements: 1.5_

- [x] 3. Create `src/utils/contextPruner.ts`
  - Implement `parseRequirementsRefs(requirementsLine: string): string[]` — strips `_Requirements:` prefix, splits on comma, trims each ref
  - Implement `pruneRequirements(content: string, refs: string[]): string` using line-by-line state machine
  - State machine: on `### N.M` heading check if ref is in set; collect lines until next `##`-or-above heading
  - Return full content as fallback when refs empty, no sections matched, or pruned result empty
  - Export both functions; no default export
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Reorder `buildPrompt` and add `readClaudeMd` / `guardClaudeMdSize` to `taskRunner.ts`
  - Add `async function readClaudeMd(cwd: string): Promise<string>` — reads `path.join(cwd, 'CLAUDE.md')`, returns `''` on any error
  - Add `function guardClaudeMdSize(content: string, channel: vscode.OutputChannel): void` — computes `Math.ceil(content.length / 4)` and appends warning to channel when result > 2000
  - Rewrite `buildPrompt(title, details, requirements, design, claudeMd?)` so sections appear in order: claudeMd → requirements → design → details bullets → `# Task: ${title}` last
  - Skip empty blocks rather than emitting empty section headers
  - Export `buildPrompt` and `resolveTaskTier` for testability
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 5. Add `resolveTaskTier` and wire everything in `runTask`
  - Add `export function resolveTaskTier(title: string, details: string[]): ModelTier` — scans title and details for `/\[model:(haiku|sonnet|opus)\]/i` regex; returns `'sonnet'` if none found
  - In `runTask` before spawning: call `readClaudeMd`, `guardClaudeMdSize`, `parseRequirementsRefs(item.requirements ?? '')`, `pruneRequirements`, `resolveTaskTier`
  - Pass `claudeMd` as fifth arg to `buildPrompt`
  - Append `...resolveModelFlag('claude', tier)` to spawn args
  - Change Output Channel header line to `▶ ${item.label} [${tier}]`
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 2.1, 3.1, 3.2, 5.1, 5.2, 5.4, 5.5_

- [x] 6. Create `src/commands/discover.ts`
  - Check PATH for `subq` then `miami` via `isInPath`; show `showErrorMessage` with install hint if neither found
  - Prompt user with `showInputBox` for discovery query string; return if cancelled
  - Spawn found binary with query as single arg, capture stdout; stream stderr to same channel
  - Show `showQuickPick` on success: "Copy output to clipboard" and "New Spec with this context"
  - For "New Spec with this context": prepend discovery output to goal string, call `newSpec` flow with it pre-filled as `showInputBox` initial value
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 7. Wire `kosmo.discover` into `extension.ts` and `package.json`
  - Import `discover` from `./commands/discover` in `extension.ts`
  - Register `vscode.commands.registerCommand('kosmo.discover', () => discover(tasksProvider))` alongside existing registrations
  - Add command to `package.json` `contributes.commands`: `{ "command": "kosmo.discover", "title": "Kosmo: Discover", "icon": "$(search)" }`
  - Add `view/title` menu entry for `kosmoTasks` view at `navigation@3`
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 8. Write unit tests for `contextPruner` and `resolveTaskTier`
  - Test `pruneRequirements`: refs `['1.1']` on content with `### 1.1`, `### 1.2`, `### 2.1` returns only `### 1.1` block
  - Test: empty refs array returns full content unchanged
  - Test: refs matching no section return full content (fallback)
  - Test `parseRequirementsRefs('_Requirements: 1.1, 2.3_')` returns `['1.1', '2.3']`
  - Test `resolveTaskTier('Fix bug [model:haiku]', [])` returns `'haiku'`
  - Test `resolveTaskTier('Build feature', ['some detail'])` returns `'sonnet'`
  - _Requirements: 1.1, 1.3, 3.1, 3.2, 3.4, 3.5_

- [x] 9. Integration smoke test
  - `npm run compile` — zero TypeScript errors
  - F5 → Extension Development Host → create a spec with a simple goal
  - Add `[model:haiku]` to a task title in tasks.md, start the task — verify Output Channel header shows `[haiku]`
  - Pad CLAUDE.md past 8000 chars, start any task — verify warning line appears in channel
  - Verify `subq` entry appears in CLI picker if installed; silently absent if not
  - _Requirements: 1.1, 1.2, 1.6, 4.1, 5.2, 5.3, 5.4_

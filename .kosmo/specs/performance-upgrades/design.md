# Performance Upgrades for Kosmo Sidekick

## Overview

Five targeted changes to `llmCli.ts`, `taskRunner.ts`, `specGenerator.ts`, plus two new files (`contextPruner.ts`, `commands/discover.ts`). All within the no-external-deps constraint — only Node.js built-ins and the `vscode` API.

## Architecture

```
extension.ts
  └─ registers kosmo.discover (new)

llmCli.ts
  ├─ KNOWN_CLIS  ← adds subq + miami entries
  ├─ ModelTier type (exported)
  ├─ resolveModelFlag(cliBin, tier) → string[]  (new)
  ├─ isInPath(bin) → Promise<boolean>  (now exported)
  └─ runWithCli(prompt, cwd, tier?) → Promise<string>  (tier param added)

specGenerator.ts
  └─ passes tier='opus' to runWithCli for all three steps

taskRunner.ts
  ├─ buildPrompt(…) reordered: claudeMd → requirements → design → details → title last
  ├─ resolveTaskTier(title, details) → ModelTier  (new)
  ├─ readClaudeMd(cwd) → Promise<string>  (new)
  ├─ guardClaudeMdSize(content, channel)  (new)
  └─ runTask wires contextPruner + model tier + CLAUDE.md guard

src/utils/contextPruner.ts  (new)
  ├─ parseRequirementsRefs(line) → string[]
  └─ pruneRequirements(content, refs) → string

src/commands/discover.ts  (new)
  └─ discover(provider) — subq/miami query, output channel, copy/new-spec offer
```

## Components and Interfaces

### `src/utils/contextPruner.ts`

```typescript
/**
 * Strips _Requirements: prefix, splits on commas, returns trimmed ref IDs.
 * Returns [] when line is empty or absent.
 */
export function parseRequirementsRefs(requirementsLine: string): string[];

/**
 * Extracts only the ### N.M subsections whose IDs are in refs.
 * Collects lines until the next heading at ## level or above.
 * Falls back to full content when refs empty, no match, or result empty.
 */
export function pruneRequirements(content: string, refs: string[]): string;
```

State machine for `pruneRequirements`:
- Split on `\n`, walk lines.
- On `### N.M` heading: check if ref in set → enter collect mode or skip mode.
- On `##` or `#` heading: exit collect mode.
- Accumulate collected lines; return joined, or fall back to full content.

### `llmCli.ts` additions

```typescript
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

const MODEL_FLAGS: Record<ModelTier, string> = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-7',
};

// Returns ['--model', MODEL_FLAGS[tier]] when cliBin === 'claude', else [].
export function resolveModelFlag(cliBin: string, tier: ModelTier): string[];

// Exported so discover.ts can reuse without duplicating PATH logic.
export function isInPath(bin: string): Promise<boolean>;

// New KNOWN_CLIS entries:
{ bin: 'subq',  label: 'SubQ / Miami (subq)',  args: p => [p] },
{ bin: 'miami', label: 'Miami (miami)',         args: p => [p] },

// Updated signature:
export function runWithCli(
    prompt: string,
    cwd: string,
    tier?: ModelTier,   // defaults to 'sonnet' when CLI is claude and tier omitted
): Promise<string>;
```

### `taskRunner.ts` additions

```typescript
// Scans title + details for [model:haiku|sonnet|opus] tag. Defaults 'sonnet'.
export function resolveTaskTier(title: string, details: string[]): ModelTier;

// Reads workspace CLAUDE.md. Returns '' on any error (ENOENT etc.).
async function readClaudeMd(cwd: string): Promise<string>;

// Warns in channel when Math.ceil(content.length / 4) > 2000. Never throws.
function guardClaudeMdSize(content: string, channel: vscode.OutputChannel): void;

// Reordered: claudeMd block → requirements block → design block → details → title last.
export function buildPrompt(
    title: string,
    details: string[],
    requirements: string,
    design: string,
    claudeMd?: string,
): string;
```

Updated `runTask` flow (before spawning):
```typescript
const claudeMd = await readClaudeMd(cwd);
guardClaudeMdSize(claudeMd, channel);
const refs = parseRequirementsRefs(item.requirements ?? '');
const prunedRequirements = pruneRequirements(requirements, refs);
const tier = resolveTaskTier(item.label, item.details);
const prompt = buildPrompt(item.label, item.details, prunedRequirements, design, claudeMd);
const proc = cp.spawn(
    'claude',
    ['-p', prompt, '--output-format', 'stream-json', '--verbose',
     ...resolveModelFlag('claude', tier)],
    { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
);
// Channel header: `▶ ${item.label} [${tier}]`
```

### `src/commands/discover.ts`

```typescript
export async function discover(provider: TasksDataProvider): Promise<void>;
// Steps:
// 1. isInPath('subq') then isInPath('miami') — error if neither found
// 2. showInputBox for discovery query — return if cancelled
// 3. spawn binary with query, stream stdout to "Kosmo: Discovery" Output Channel
// 4. showQuickPick: "Copy output to clipboard" | "New Spec with this context"
// 5. "New Spec": prepend discovery output to goal, open newSpec with pre-filled value
```

### `extension.ts` change

```typescript
import { discover } from './commands/discover';
// Inside activate():
vscode.commands.registerCommand('kosmo.discover', () => discover(tasksProvider)),
```

### `package.json` additions

```json
{
  "command": "kosmo.discover",
  "title": "Kosmo: Discover",
  "icon": "$(search)"
}
```
Plus `view/title` menu entry for `kosmoTasks` at `navigation@3`.

## Data Models

```typescript
export type ModelTier = 'haiku' | 'sonnet' | 'opus';
// No new persistent state.
// TaskItem.requirements (existing field) carries the raw _Requirements:_ string.
```

## Error Handling

| Scenario | Handling |
|---|---|
| `subq`/`miami` not in PATH | `showErrorMessage` with install hint; command returns early |
| `pruneRequirements` finds no matches | Falls back to full requirements.md; no error surfaced |
| `readClaudeMd` ENOENT or permission error | Returns `''`; task proceeds without prefix |
| Unknown `ModelTier` value | TypeScript exhaustive check — compile-time error |
| Claude exits non-zero with model flag | Existing error path unchanged |
| Discovery CLI exits non-zero | Channel shows `✗ exit N` + `showErrorMessage` |

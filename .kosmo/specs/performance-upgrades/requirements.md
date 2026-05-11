# Performance Upgrades for Kosmo Sidekick

## Introduction

Kosmo Sidekick currently spawns all AI CLI invocations with a single hardcoded model, constructs task prompts with volatile context first (breaking prompt caching), and passes full requirements.md and design.md to every task regardless of what each task actually references. These upgrades introduce model-tier routing, prompt cache optimization, targeted context injection, SubQ/Miami discovery CLI support, and a CLAUDE.md token budget guard.

## Glossary

- **Model tier**: Capability class (haiku/sonnet/opus) mapped to a specific Claude model flag.
- **Prompt cache**: Claude's server-side KV cache — hit only when stable content precedes volatile content.
- **Cache prefix**: Leading stable portion of a prompt.
- **Context pruning**: Extracting only requirement sections referenced by a task.
- **Requirements reference**: `_Requirements: X.X, X.X_` annotation on a task detail line.
- **SubQ / Miami**: CLI binary with subquadratic attention, cheap for repo-wide discovery.
- **Token budget**: Upper bound on CLAUDE.md size (~4 chars/token); 2000 tokens recommended max.
- **EARS notation**: WHEN … THE System SHALL …

## Requirements

### 1. Model Routing by Task Complexity

User Story: As a developer, I want each AI invocation to use the most cost-appropriate model tier, so that simple tasks cost less while architecture-level work retains full capability.

Acceptance Criteria:
- WHEN a task title or details contain `[model:haiku]`, THE System SHALL append `--model claude-haiku-4-5-20251001` to the claude spawn args.
- WHEN a task contains `[model:opus]`, THE System SHALL append `--model claude-opus-4-7`.
- WHEN no model tag is present, THE System SHALL default to `--model claude-sonnet-4-6`.
- WHEN the selected CLI is not `claude`, THE System SHALL omit model flags entirely.
- WHEN spec generation runs (requirements/design/tasks), THE System SHALL use opus tier.
- WHEN a task starts, THE System SHALL surface the resolved tier in the Output Channel header line as `▶ Title [tier]`.

### 2. Prompt Cache Optimization

User Story: As a developer running many tasks, I want stable context placed before volatile content in every prompt, so that Claude's prompt cache is hit on repeated invocations.

Acceptance Criteria:
- WHEN `buildPrompt` constructs a task prompt, THE System SHALL order: (1) CLAUDE.md, (2) requirements, (3) design, (4) detail bullets, (5) task title last.
- WHEN CLAUDE.md exists in workspace root, THE System SHALL read it and prepend as stable prefix.
- WHEN CLAUDE.md does not exist, THE System SHALL omit the block without error.
- WHEN any stable block is empty, THE System SHALL skip that block's section header.

### 3. Targeted Context Injection

User Story: As a developer, I want only the requirement sections referenced by a task included in its prompt, so that prompt size is reduced ~60-70%.

Acceptance Criteria:
- WHEN a task's `_Requirements:` line references IDs like `1.1, 2.3`, THE System SHALL extract only those `### N.M` subsections from requirements.md.
- WHEN a task has no `_Requirements:` line, THE System SHALL pass the full requirements.md.
- WHEN a referenced ID does not exist in requirements.md, THE System SHALL silently omit it.
- WHEN `pruneRequirements(content, refs)` is called, THE System SHALL return matched sections up to the next heading of equal or greater level.
- WHEN pruned result is empty, THE System SHALL fall back to full requirements.md.

### 4. SubQ / Miami Discovery CLI

User Story: As a developer starting a new spec, I want to run a repo-wide discovery pass using SubQ before spec generation, so requirements and design are grounded in actual codebase.

Acceptance Criteria:
- WHEN `KNOWN_CLIS` is evaluated, THE System SHALL include `subq` and `miami` entries.
- WHEN `kosmo.discover` is invoked, THE System SHALL prompt for a query, run subq/miami, and display output in `Kosmo: Discovery` Output Channel.
- WHEN neither binary is in PATH, THE System SHALL show an error with an install hint.
- WHEN discovery completes, THE System SHALL offer: "Copy to clipboard" or "New Spec with this context".
- WHEN user selects "New Spec with this context", THE System SHALL prepend discovery output to the goal passed to `generateRequirements`.

### 5. CLAUDE.md Token Budget Guard

User Story: As a developer, I want to be warned when CLAUDE.md grows too large so I can keep it lean.

Acceptance Criteria:
- WHEN a task starts and CLAUDE.md exists, THE System SHALL estimate token count as `Math.ceil(charCount / 4)`.
- WHEN estimated tokens exceed 2000, THE System SHALL append `⚠ CLAUDE.md is ~N tokens — recommended max is 2000.` to the Output Channel.
- WHEN tokens ≤ 2000, THE System SHALL show no warning.
- WHEN warning fires, THE System SHALL NOT block task execution.
- WHEN CLAUDE.md does not exist, THE System SHALL skip the guard.

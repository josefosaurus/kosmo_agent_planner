# AI-Assisted Coding Knowledge Base & Efficiency Strategy

This document serves as a strategic manual for optimizing AI-assisted development workflows. It focuses on maximizing logic quality while minimizing token consumption and cost.

## 1. Tool Ecosystem Comparison (2026)

| Tool | Core Philosophy | Best For | Token Profile |
| :--- | :--- | :--- | :--- |
| **Claude Code** | Terminal-Native Agent | Surgical logic & precision | High (Quadratic Attention) |
| **Kosmo Sidekick** | Spec-Driven Extension | Task isolation & planning | Low (Targeted Context) |
| **Miami (SubQ)** | Large-Context CLI | Repo-wide discovery | Very Low (Subquadratic) |
| **Orca IDE** | Agent Orchestrator | Parallel feature builds | Variable (Branch-based) |
| **Antigravity** | Google-Native IDE | UI testing & Web-heavy dev | Medium (Gemini-optimized) |

---

## 2. Token Efficiency & Cost Optimization

### A. Model Routing Implementation
To reduce spend, assign tasks based on complexity:
* **Haiku Tier:** Mechanical tasks, unit tests for simple functions, boilerplate, and JSON/TS conversions.
* **Sonnet Tier:** 80% of daily logic, multi-file NestJS/React features, and standard debugging.
* **Opus Tier:** Initial architecture design, complex async logic, and high-level spec generation.

### B. Strategic Prompt Caching
* **Stable Prefixes:** Keep core project rules, tech stack details, and coding standards at the top of the context.
* **Dynamic Data:** Place volatile data (timestamps, current git branch, temporary logs) at the very bottom of the prompt to avoid breaking the cache.

### C. Context Pruning & Hygiene
* **The `/compact` Command:** Proactively summarize session history every 10-15 turns to flush "noise" and build logs.
* **Targeted Context:** Avoid passing entire directories. Use Kosmo Sidekick to identify specific file paths for the agent.

---

## 3. Workflow Integration Strategy

### Step 1: Discovery (The Miami Bridge)
Use **SubQ (Miami)** for repository-wide searches and identifying relevant code patterns. Its subquadratic attention makes this phase nearly free compared to traditional models.

### Step 2: Planning (The Kosmo Phase)
Use **Kosmo Sidekick** to generate:
1.  `requirements.md`: High-level goals.
2.  `design.md`: Technical architectural decisions.
3.  `tasks.md`: A granular checklist of changes.

### Step 3: Implementation (The Claude Precision)
Feed the specific files and the `tasks.md` into **Claude Code**. By starting with a pre-validated plan, the agent avoids "wandering" through the repo, saving up to 40% in discovery tokens.

---

## 4. Operational Guidelines for the CLI

1.  **Strict Isolation:** Run each task in a fresh session or a separate worktree (as in Orca) to prevent context pollution.
2.  **Explicit File Loading:** Instead of "Fix the bug in the backend," use `claude read src/auth/auth.service.ts src/auth/auth.controller.ts` followed by the instruction.
3.  **Lean `CLAUDE.md`:** Keep this file under 2k tokens. Focus strictly on build/test commands and high-level architectural constraints.
4.  **Verification Loop:** Use the agent to write the test *before* the fix to ensure the implementation is verified automatically, reducing back-and-forth token waste.

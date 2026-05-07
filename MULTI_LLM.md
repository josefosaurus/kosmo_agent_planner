# Multi-LLM Support — Planning Notes

## Current architecture

Both subprocess calls use the `claude` CLI:

- `specGenerator.ts` — `claude -p <prompt>` (spec generation, 3 sequential calls)
- `taskRunner.ts` — `claude -p <prompt> --output-format stream-json --verbose` (task execution, streams tool events)

## Two paths

### Path A — CLI abstraction
Support other CLIs that accept a `-p` style prompt (e.g. `llm` by Simon Willison, `sgpt`).

**Pros:** zero code change to core logic, no new dependencies, user manages their own tokens/keys outside the extension.

**Cons:** very limited model support, no token optimization possible, no streaming for task execution.

---

### Path B — Direct API calls
Replace `claude -p` subprocess in spec generation with direct API calls via provider SDKs (Anthropic, OpenAI, Ollama, etc.).

**Pros:** full control over prompts, token limits, and caching. Enables prompt caching (see below).

**Cons:** breaks "no external deps" rule, requires API key management in VSCode settings, more code.

---

## Recommendation

**Path B for spec generation only. Keep `claude` subprocess for task execution.**

Reason: task execution value comes from Claude Code's built-in tooling (Read, Write, Edit, Bash, WebSearch). No other model has an equivalent CLI agent. Spec generation is just text in / text out — any model works.

---

## Token optimization opportunities

### 1. Prompt caching (highest ROI)
`taskRunner.ts` sends `requirements.md` + `design.md` full text with **every single task**.  
For a 20-task spec = same 2 files × 20 subprocess calls.

With Anthropic prompt caching, mark those files as `cache_control: ephemeral` — ~30-50% cost reduction on the task execution phase.

### 2. Spec generation caching
When generating `design.md`, `requirements.md` is sent again as context.  
When generating `tasks.md`, both previous files are sent.  
Cache them as prefix blocks — saves on the 2nd and 3rd generation calls.

### 3. `max_tokens` cap
Add a configurable output cap to prevent runaway spec generation on simple goals.

---

## Implementation plan (Path B)

1. Add VSCode settings:
   - `kosmo.provider` — `"claude-cli"` (default) | `"anthropic"` | `"openai"` | `"ollama"`
   - `kosmo.apiKey` — stored in VSCode secret storage (not settings.json)
   - `kosmo.model` — e.g. `"claude-sonnet-4-5"`, `"gpt-4o"`

2. Create `src/services/llmClient.ts` — thin wrapper that routes to the right provider.

3. Replace `runClaude()` in `specGenerator.ts` with `llmClient.complete(prompt)`.

4. Keep `taskRunner.ts` always using `claude` subprocess — provider setting ignored there.

5. Add prompt caching to `taskRunner.ts` `buildPrompt()` when provider is Anthropic.

---

## Files to touch

| File | Change |
|---|---|
| `src/services/specGenerator.ts` | replace `cp.spawn('claude')` with `llmClient.complete()` |
| `src/services/taskRunner.ts` | add cache headers to requirements + design context blocks |
| `src/services/llmClient.ts` | new — provider routing |
| `package.json` | add `kosmo.provider`, `kosmo.apiKey`, `kosmo.model` config contribution |

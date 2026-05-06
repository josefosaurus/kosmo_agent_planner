Create a VSCode extension called "Kosmo Sidekick" from scratch.

## Goal
Replicate Kiro's spec-driven development flow using Claude Code CLI as the agent backend.

## Core flow
User provides a goal → extension generates requirements.md → design.md → tasks.md
Each task runs in an isolated Claude Code CLI subprocess.

## Spec file formats

### requirements.md
- Title, Introduction, Glossary, Requirements sections
- Each requirement has: User Story + Acceptance Criteria in EARS notation
- (WHEN/THE System SHALL format)

### design.md
- Title, Overview, Architecture, Components and Interfaces sections
- Technical decisions, code snippets where needed

### tasks.md
- Title, Overview, Tasks sections
- Each task format:
  - [ ] 1. Task title
    - detail line
    - _Requirements: 1.1, 1.2_
- Task states: [ ] pending, [~] in progress, [x] done

## Extension features
1. Command palette: "Kosmo: New Spec" → asks for goal → generates the 3 md files
2. CodeLens buttons on tasks.md: "▶ Start task" on each [ ] task
3. Sidebar panel showing tasks list with status indicators
4. Each task triggers: claude CLI subprocess with isolated context
   - Context includes: CLAUDE.md + requirements.md + design.md + the specific task
5. Task status updates automatically in tasks.md when agent starts/finishes

## File structure in user's project
.kosmo/
  specs/
    [spec-name]/
      requirements.md
      design.md
      tasks.md

## Tech stack
- TypeScript
- VSCode Extension API
- Claude Code CLI as subprocess (not API directly)
- No external dependencies beyond vscode and node built-ins

## CLAUDE.md
Generate a CLAUDE.md template that the user fills with project context.
This file is injected into every agent subprocess as context.

Start by scaffolding the full extension structure, package.json, tsconfig, 
and a working "Kosmo: New Spec" command that generates the 3 md files.
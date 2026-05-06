export function claudeMdTemplate(): string {
    return `# Project Context

> This file is injected into every Kosmo agent subprocess. Fill it in with project-specific context.

## Project Overview

<!-- Describe what this project does and its main goals -->

## Tech Stack

<!-- Languages, frameworks, key libraries -->

## Architecture Notes

<!-- Key architectural decisions, patterns, conventions to follow -->

## Coding Conventions

<!-- Naming, file structure, patterns -->

## Important Constraints

<!-- Performance, security, compatibility requirements -->
`;
}

export function requirementsPrompt(goal: string): string {
    return `Generate a requirements.md document for the following goal:

Goal: ${goal}

Format the document exactly as follows:
- Title (H1): Feature name
- ## Introduction: Brief overview (2-3 sentences)
- ## Glossary: Key terms and definitions
- ## Requirements: Numbered requirements (1., 2., 3., etc.) each with:
  - ### N. Requirement Name
  - User Story: "As a [role], I want [feature], so that [benefit]"
  - Acceptance Criteria: Bulleted list in EARS notation (WHEN/THE System SHALL format)

Output ONLY the markdown document, no preamble or explanation.`;
}

export function designPrompt(goal: string, requirements: string): string {
    return `Generate a design.md document for the following goal and requirements.

Goal: ${goal}

Requirements:
${requirements}

Format the document exactly as follows:
- Title (H1): Feature name
- ## Overview: High-level technical approach (2-3 sentences)
- ## Architecture: System components and their interactions
- ## Components and Interfaces: Detailed component descriptions with interface definitions and code snippets
- ## Data Models: Key data structures
- ## Error Handling: Error cases and how they're handled

Output ONLY the markdown document, no preamble or explanation.`;
}

export function tasksPrompt(goal: string, requirements: string, design: string): string {
    return `Generate a tasks.md document for implementing the following goal.

Goal: ${goal}

Requirements:
${requirements}

Design:
${design}

Format the document exactly as follows:
- Title (H1): Feature name
- ## Overview: Brief implementation summary (1-2 sentences)
- ## Tasks: Numbered checklist

Each task MUST follow this exact format:
- [ ] N. Task title
  - Implementation detail 1
  - Implementation detail 2
  - _Requirements: X.X, X.X_

Rules:
- Order tasks: scaffolding → core logic → tests → integration
- Each task should be completable in one focused coding session
- Include 3-6 implementation detail bullet points per task
- Always include a _Requirements:_ line referencing relevant requirement numbers
- Task states: [ ] pending, [~] in progress, [x] done — all start as [ ]

Output ONLY the markdown document, no preamble or explanation.`;
}

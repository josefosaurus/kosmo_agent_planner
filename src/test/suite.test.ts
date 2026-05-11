import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneRequirements, parseRequirementsRefs } from '../utils/contextPruner';
import { resolveTaskTier } from '../utils/taskTier';

const REQUIREMENTS = `# Feature

## Introduction
Intro text.

## Requirements

### 1.1 First Requirement
User Story: As a user...

Acceptance Criteria:
- WHEN X THE System SHALL Y

### 1.2 Second Requirement
User Story: As a developer...

Acceptance Criteria:
- WHEN A THE System SHALL B

### 2.1 Third Requirement
User Story: As an admin...

Acceptance Criteria:
- WHEN C THE System SHALL D
`;

// --- pruneRequirements ---

test('pruneRequirements: single ref extracts only that section', () => {
    const result = pruneRequirements(REQUIREMENTS, ['1.1']);
    assert.ok(result.includes('### 1.1 First Requirement'), 'includes 1.1');
    assert.ok(!result.includes('### 1.2'), 'excludes 1.2');
    assert.ok(!result.includes('### 2.1'), 'excludes 2.1');
});

test('pruneRequirements: multiple refs extract all matching sections', () => {
    const result = pruneRequirements(REQUIREMENTS, ['1.1', '2.1']);
    assert.ok(result.includes('### 1.1 First Requirement'), 'includes 1.1');
    assert.ok(result.includes('### 2.1 Third Requirement'), 'includes 2.1');
    assert.ok(!result.includes('### 1.2'), 'excludes 1.2');
});

test('pruneRequirements: empty refs returns full content', () => {
    const result = pruneRequirements(REQUIREMENTS, []);
    assert.equal(result, REQUIREMENTS);
});

test('pruneRequirements: refs matching no section fall back to full content', () => {
    const result = pruneRequirements(REQUIREMENTS, ['9.9']);
    assert.equal(result, REQUIREMENTS);
});

// --- parseRequirementsRefs ---

test('parseRequirementsRefs: parses standard annotation', () => {
    const result = parseRequirementsRefs('_Requirements: 1.1, 2.3_');
    assert.deepEqual(result, ['1.1', '2.3']);
});

test('parseRequirementsRefs: trims whitespace around refs', () => {
    const result = parseRequirementsRefs('_Requirements:  1.1 ,  2.3 _');
    assert.deepEqual(result, ['1.1', '2.3']);
});

test('parseRequirementsRefs: returns empty array for empty string', () => {
    assert.deepEqual(parseRequirementsRefs(''), []);
});

test('parseRequirementsRefs: returns empty array when no annotation present', () => {
    assert.deepEqual(parseRequirementsRefs('some detail line'), []);
});

// --- resolveTaskTier ---

test('resolveTaskTier: detects haiku tag in title', () => {
    assert.equal(resolveTaskTier('Fix bug [model:haiku]', []), 'haiku');
});

test('resolveTaskTier: detects opus tag in detail line', () => {
    assert.equal(resolveTaskTier('Build feature', ['implement [model:opus] logic']), 'opus');
});

test('resolveTaskTier: case-insensitive match', () => {
    assert.equal(resolveTaskTier('Task [model:HAIKU]', []), 'haiku');
});

test('resolveTaskTier: defaults to sonnet when no tag', () => {
    assert.equal(resolveTaskTier('Build feature', ['some detail']), 'sonnet');
});

test('resolveTaskTier: defaults to sonnet with empty inputs', () => {
    assert.equal(resolveTaskTier('', []), 'sonnet');
});

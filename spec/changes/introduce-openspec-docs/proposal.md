# Proposal: Introduce OpenSpec Documentation

## Change ID

introduce-openspec-docs

## Why

The CardForge SDD project currently has no written specification. Behavior is only discoverable by reading source code, which makes onboarding, maintenance, and future changes risky. Introducing OpenSpec documentation captures existing capabilities as living requirements and establishes a baseline for subsequent changes.

## What Changes

1. Create the OpenSpec directory structure under `spec/`.
2. Define five capability specifications covering the existing system:
   - Authentication
   - Game Data Management
   - Player Management
   - Match Management
   - Battle
3. Create an initial change proposal (`introduce-openspec-docs`) to record the documentation effort.
4. Do not modify application code or data files.

## Impact

- **Specifications**: New capability specs in `spec/specs/*/spec.md`.
- **Changes**: New active change directory in `spec/changes/introduce-openspec-docs/`.
- **Code**: No code changes.
- **Data**: No data changes.
- **Users**: No user-facing impact.

## Acceptance Criteria

- [ ] `spec/specs/` contains five capability directories, each with a `spec.md`.
- [ ] Each spec has at least one requirement with scenarios.
- [ ] `spec/changes/introduce-openspec-docs/` contains `proposal.md`, `tasks.json`, and `specs/` with spec deltas.
- [ ] Running the validation patterns from OpenSpec succeeds.

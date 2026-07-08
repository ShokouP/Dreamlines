# Battle Capability

## Overview

The battle capability provides a client-side page where players can run card game matches against another player or a simple opponent. It consumes the game data tables and match API, and it is responsible for producing match records that can be replayed from the management backend.

## Responsibilities

- Provide a web UI for running card game matches.
- Load game data (cards, characters, buffs, effects, keywords, game modes) from the backend.
- Track turn-based play, actions, buff triggers, and end-of-turn states.
- Submit completed match records to the backend.

## Requirements

### Requirement: Battle Page Access
WHEN an authenticated client navigates to `/battle.html`,
THEN the system SHALL serve the battle page and its assets.

#### Scenario: Open battle page
GIVEN an authenticated user
WHEN the browser navigates to `/battle.html`
THEN the battle interface loads without 401 errors for static assets.

### Requirement: Load Game Data
WHEN the battle page initializes,
THEN it SHALL fetch public game data tables from `/api/{table}` and cache them locally.

#### Scenario: Data loaded successfully
GIVEN the backend is running
WHEN the battle page loads
THEN requests to `/api/cards`, `/api/characters`, `/api/buffs`, `/api/effects`, `/api/keywords`, and `/api/game-modes` succeed.

### Requirement: Run Match
WHEN a player starts a match from the battle page,
THEN the system SHALL simulate or drive turns until a winner is determined.

#### Scenario: Complete a match
GIVEN two players with selected characters
WHEN the battle runs to completion
THEN the page reports a winner.

### Requirement: Record Match
WHEN a match ends,
THEN the battle page SHALL POST the match record to `/api/matches`.

#### Scenario: Save match replay
GIVEN a completed match
WHEN the match ends
THEN a POST to `/api/matches` is sent
AND the response contains a generated match id.

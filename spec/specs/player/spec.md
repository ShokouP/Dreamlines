# Player Management Capability

## Overview

Player management handles user accounts beyond the default administrator. Players have credentials, statistics, and collection unlocks. Admins can list and create players; players can view and update their own profile.

## Responsibilities

- Store player accounts as individual JSON files in `data/players/`.
- Allow admins to list and create players.
- Allow players to view and update their own profile.
- Maintain player statistics and unlocked collection state.

## Requirements

### Requirement: List Players
WHEN an authenticated admin GETs `/api/players`,
THEN the system SHALL return all player objects with `passwordHash` removed.

#### Scenario: Admin lists players
GIVEN an authenticated admin
WHEN the client GETs `/api/players`
THEN the response contains all players without password hashes.

#### Scenario: Non-admin cannot list players
GIVEN an authenticated player
WHEN the client GETs `/api/players`
THEN the response status is 403.

### Requirement: Get Player
WHEN an authenticated client GETs `/api/players/{player_id}`,
IF the caller is an admin OR the caller's id matches `player_id`,
THEN the system SHALL return the player object without `passwordHash`.

#### Scenario: Player views own profile
GIVEN an authenticated player with id `alice`
WHEN the client GETs `/api/players/alice`
THEN the response contains the player object.

#### Scenario: Player views another profile
GIVEN an authenticated player with id `alice`
WHEN the client GETs `/api/players/bob`
THEN the response status is 403.

### Requirement: Create Player
WHEN an authenticated admin POSTs to `/api/players`,
THEN the system SHALL create a new player file with a hashed password and default statistics.

#### Scenario: Create new player
GIVEN an authenticated admin
WHEN the client POSTs `{ "id": "alice", "username": "alice", "password": "secret" }` to `/api/players`
THEN a file `data/players/alice.json` is created
AND the response does not contain `passwordHash`.

#### Scenario: Duplicate player id
GIVEN a player with id `alice` already exists
WHEN the client POSTs `{ "id": "alice" }` to `/api/players`
THEN the response status is 409.

### Requirement: Update Player
WHEN an authenticated client PUTs to `/api/players/{player_id}`,
IF the caller is an admin OR the caller's id matches `player_id`,
THEN the system SHALL update allowed fields and persist the player file.

#### Scenario: Update display name
GIVEN an authenticated player with id `alice`
WHEN the client PUTs `{ "displayName": "Alice the Mage" }` to `/api/players/alice`
THEN the player file is updated
AND the response contains the new display name.

#### Scenario: Protected fields cannot be modified
GIVEN an authenticated player with id `alice`
WHEN the client PUTs `{ "id": "mallory", "passwordHash": "..." }` to `/api/players/alice`
THEN `id` and `passwordHash` are ignored.

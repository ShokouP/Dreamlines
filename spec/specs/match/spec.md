# Match Management Capability

## Overview

Match management stores completed and in-progress card game matches. Each match is persisted as a JSON file containing metadata, players, turns, actions, buff triggers, and end-of-turn states. Admins can list and delete all matches; players can only access their own.

## Responsibilities

- Persist match records as JSON files in `data/matches/`.
- Allow listing matches with optional player filter.
- Allow retrieval of a full match record for replay.
- Allow admins to delete match records.
- Allow authenticated users to create match records.

## Requirements

### Requirement: List Matches
WHEN an authenticated client GETs `/api/matches`,
THEN the system SHALL return match summaries.
IF the caller is a player,
THEN only matches where the caller participates SHALL be returned.
IF the `playerId` query parameter is provided and the caller is an admin,
THEN only matches for that player SHALL be returned.

#### Scenario: Player lists own matches
GIVEN an authenticated player with id `alice`
WHEN the client GETs `/api/matches`
THEN the response contains only matches where alice is a player.

#### Scenario: Admin filters by player
GIVEN an authenticated admin
WHEN the client GETs `/api/matches?playerId=alice`
THEN the response contains only matches where alice is a player.

### Requirement: Get Match
WHEN an authenticated client GETs `/api/matches/{match_id}`,
IF the caller is an admin OR the caller participates in the match,
THEN the system SHALL return the full match record.

#### Scenario: View own match replay
GIVEN an authenticated player who participated in match `m1`
WHEN the client GETs `/api/matches/m1`
THEN the response contains the full match record.

#### Scenario: View another player's match
GIVEN an authenticated player who did not participate in match `m1`
WHEN the client GETs `/api/matches/m1`
THEN the response status is 403.

### Requirement: Create Match
WHEN an authenticated client POSTs to `/api/matches`,
THEN the system SHALL persist the match body as a JSON file and return it with generated `id` and timestamps if omitted.

#### Scenario: Create match record
GIVEN an authenticated admin
WHEN the client POSTs a match body without `id` to `/api/matches`
THEN the response contains an `id` starting with `match_`
AND a file matching that id is created in `data/matches/`.

### Requirement: Delete Match
WHEN an authenticated admin DELETEs `/api/matches/{match_id}`,
THEN the system SHALL remove the match file.

#### Scenario: Admin deletes match
GIVEN an authenticated admin and an existing match `m1`
WHEN the client DELETEs `/api/matches/m1`
THEN the file `data/matches/m1.json` is removed.

#### Scenario: Player cannot delete match
GIVEN an authenticated player
WHEN the client DELETEs `/api/matches/m1`
THEN the response status is 403.

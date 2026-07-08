# Game Data Management Capability

## Overview

Game data management is the core capability of the CardForge SDD backend. It exposes six editable JSON tables that drive the card game: cards, effects, buffs, characters, game modes, and keywords. Tables are validated with Pydantic schemas, support full-replacement updates, and can be exported as a ZIP archive.

## Responsibilities

- Store and serve six game data tables as JSON files.
- Validate table rows against Pydantic schemas on write.
- Backup files before every write.
- Enforce referential integrity across cards, effects, buffs, and characters.
- Export all tables as a downloadable ZIP archive.

## Data Tables

| Table | File | Schema | Public Read |
|---|---|---|---|
| cards | `data/cards.json` | `CardRow` | Yes |
| effects | `data/effects.json` | `EffectRow` | Yes |
| buffs | `data/buffs.json` | `BuffRow` | Yes |
| characters | `data/characters.json` | `CharacterRow` | Yes |
| game-modes | `data/game_modes.json` | `GameModeRow` | Yes |
| keywords | `data/keywords.json` | `KeywordRow` | Yes |

## Requirements

### Requirement: Read Game Data Table
WHEN any client GETs `/api/{table}` for a known table,
THEN the system SHALL return the full JSON array of rows.

#### Scenario: Read cards table
GIVEN `data/cards.json` exists
WHEN the client GETs `/api/cards`
THEN the response contains the cards array.

#### Scenario: Unknown table
WHEN the client GETs `/api/unknown`
THEN the response status is 404.

### Requirement: Update Game Data Table
WHEN an authenticated client PUTs a JSON array to `/api/{table}` for a known table,
THEN the system SHALL validate every row against the table's Pydantic schema, persist the array to the JSON file, and return the row count.

#### Scenario: Update cards table
GIVEN an authenticated admin
WHEN the client PUTs a valid cards array to `/api/cards`
THEN `data/cards.json` is overwritten
AND the response contains `{ "status": "ok", "count": <n> }`.

#### Scenario: Invalid row rejected
GIVEN an authenticated admin
WHEN the client PUTs a cards array containing a row missing required field `id`
THEN the response status is 422
AND `data/cards.json` is not modified.

### Requirement: Automatic Backup
WHEN a game data table is about to be overwritten,
THEN the system SHALL copy the existing file to `data/.backups/{filename}.{timestamp}.bak` before writing.

#### Scenario: Backup created
GIVEN `data/cards.json` exists
WHEN the client PUTs a new cards array
THEN a new backup file appears in `data/.backups/`.

### Requirement: Referential Integrity Validation
WHEN an authenticated client requests `/api/validate/refs`,
THEN the system SHALL report any broken references from cards to effects/buffs and from characters to cards/buffs.

#### Scenario: Valid references
GIVEN all card effects reference existing effects and all character decks reference existing cards
WHEN the client GETs `/api/validate/refs`
THEN the response is `{ "valid": true, "errors": [] }`.

#### Scenario: Broken reference
GIVEN a card references an effect id that does not exist
WHEN the client GETs `/api/validate/refs`
THEN the response is `{ "valid": false, "errors": ["Card '...' references unknown effect '...'"] }`.

### Requirement: Export Game Data
WHEN an authenticated client requests `/api/export`,
THEN the system SHALL return a ZIP archive containing all six table JSON files.

#### Scenario: Export download
GIVEN an authenticated admin
WHEN the client GETs `/api/export`
THEN the response has `Content-Disposition: attachment; filename=cardforge-data.zip`
AND the ZIP contains the six table files.

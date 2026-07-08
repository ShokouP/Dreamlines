# Spec Delta: introduce-openspec-docs

## ADDED Requirements

### Capability: Authentication

#### Requirement: Default Admin Bootstrap
WHEN the application starts,
IF no user with id `admin` exists,
THEN the system SHALL create an administrator account with username `admin`, password `admin`, and role `admin`.

##### Scenario: First startup
GIVEN the players directory is empty
WHEN the application starts
THEN a file `data/players/admin.json` is created
AND the user has role `admin`.

#### Requirement: User Login
WHEN a client submits a username and password,
IF the credentials match a stored player,
THEN the system SHALL return a session token and a sanitized user object.

##### Scenario: Successful login
GIVEN a player exists with username `admin` and password `admin`
WHEN the client POSTS `{ "username": "admin", "password": "admin" }` to `/api/auth/login`
THEN the response contains a `token` and user fields without `passwordHash`.

##### Scenario: Failed login
GIVEN a player exists with username `admin` and password `admin`
WHEN the client POSTS `{ "username": "admin", "password": "wrong" }` to `/api/auth/login`
THEN the response status is 401
AND the response body contains "Invalid credentials".

#### Requirement: Token Validation
WHEN a request includes a valid session token via `Authorization: Bearer <token>` header or `cf_token` cookie,
THEN the system SHALL identify the authenticated user.

##### Scenario: Valid token
GIVEN a logged-in user with active session token
WHEN the client GETs `/api/auth/me` with the token
THEN the response contains the user object without `passwordHash`.

##### Scenario: Missing or invalid token
GIVEN no token is provided
WHEN the client calls a protected endpoint
THEN the response status is 401
AND the response body contains "Not authenticated".

#### Requirement: Role-Based Authorization
WHEN an authenticated user accesses a protected resource,
IF the user's role is not permitted for that resource,
THEN the system SHALL respond with 403 Forbidden.

##### Scenario: Player accesses admin resource
GIVEN a player with role `player`
WHEN the client GETs `/api/players` as a non-admin
THEN the response status is 403.

#### Requirement: Logout
WHEN an authenticated client POSTs to `/api/auth/logout`,
THEN the system SHALL invalidate the provided session token.

##### Scenario: Logout
GIVEN a user with active session token
WHEN the client POSTs to `/api/auth/logout` with the token
THEN subsequent requests with the same token receive 401.

### Capability: Game Data Management

#### Requirement: Read Game Data Table
WHEN any client GETs `/api/{table}` for a known table,
THEN the system SHALL return the full JSON array of rows.

##### Scenario: Read cards table
GIVEN `data/cards.json` exists
WHEN the client GETs `/api/cards`
THEN the response contains the cards array.

##### Scenario: Unknown table
WHEN the client GETs `/api/unknown`
THEN the response status is 404.

#### Requirement: Update Game Data Table
WHEN an authenticated client PUTs a JSON array to `/api/{table}` for a known table,
THEN the system SHALL validate every row against the table's Pydantic schema, persist the array to the JSON file, and return the row count.

##### Scenario: Update cards table
GIVEN an authenticated admin
WHEN the client PUTs a valid cards array to `/api/cards`
THEN `data/cards.json` is overwritten
AND the response contains `{ "status": "ok", "count": <n> }`.

##### Scenario: Invalid row rejected
GIVEN an authenticated admin
WHEN the client PUTs a cards array containing a row missing required field `id`
THEN the response status is 422
AND `data/cards.json` is not modified.

#### Requirement: Automatic Backup
WHEN a game data table is about to be overwritten,
THEN the system SHALL copy the existing file to `data/.backups/{filename}.{timestamp}.bak` before writing.

##### Scenario: Backup created
GIVEN `data/cards.json` exists
WHEN the client PUTs a new cards array
THEN a new backup file appears in `data/.backups/`.

#### Requirement: Referential Integrity Validation
WHEN an authenticated client requests `/api/validate/refs`,
THEN the system SHALL report any broken references from cards to effects/buffs and from characters to cards/buffs.

##### Scenario: Valid references
GIVEN all card effects reference existing effects and all character decks reference existing cards
WHEN the client GETs `/api/validate/refs`
THEN the response is `{ "valid": true, "errors": [] }`.

##### Scenario: Broken reference
GIVEN a card references an effect id that does not exist
WHEN the client GETs `/api/validate/refs`
THEN the response is `{ "valid": false, "errors": ["Card '...' references unknown effect '...'"] }`.

#### Requirement: Export Game Data
WHEN an authenticated client requests `/api/export`,
THEN the system SHALL return a ZIP archive containing all six table JSON files.

##### Scenario: Export download
GIVEN an authenticated admin
WHEN the client GETs `/api/export`
THEN the response has `Content-Disposition: attachment; filename=cardforge-data.zip`
AND the ZIP contains the six table files.

### Capability: Player Management

#### Requirement: List Players
WHEN an authenticated admin GETs `/api/players`,
THEN the system SHALL return all player objects with `passwordHash` removed.

##### Scenario: Admin lists players
GIVEN an authenticated admin
WHEN the client GETs `/api/players`
THEN the response contains all players without password hashes.

##### Scenario: Non-admin cannot list players
GIVEN an authenticated player
WHEN the client GETs `/api/players`
THEN the response status is 403.

#### Requirement: Get Player
WHEN an authenticated client GETs `/api/players/{player_id}`,
IF the caller is an admin OR the caller's id matches `player_id`,
THEN the system SHALL return the player object without `passwordHash`.

##### Scenario: Player views own profile
GIVEN an authenticated player with id `alice`
WHEN the client GETs `/api/players/alice`
THEN the response contains the player object.

##### Scenario: Player views another profile
GIVEN an authenticated player with id `alice`
WHEN the client GETs `/api/players/bob`
THEN the response status is 403.

#### Requirement: Create Player
WHEN an authenticated admin POSTs to `/api/players`,
THEN the system SHALL create a new player file with a hashed password and default statistics.

##### Scenario: Create new player
GIVEN an authenticated admin
WHEN the client POSTs `{ "id": "alice", "username": "alice", "password": "secret" }` to `/api/players`
THEN a file `data/players/alice.json` is created
AND the response does not contain `passwordHash`.

##### Scenario: Duplicate player id
GIVEN a player with id `alice` already exists
WHEN the client POSTs `{ "id": "alice" }` to `/api/players`
THEN the response status is 409.

#### Requirement: Update Player
WHEN an authenticated client PUTs to `/api/players/{player_id}`,
IF the caller is an admin OR the caller's id matches `player_id`,
THEN the system SHALL update allowed fields and persist the player file.

##### Scenario: Update display name
GIVEN an authenticated player with id `alice`
WHEN the client PUTs `{ "displayName": "Alice the Mage" }` to `/api/players/alice`
THEN the player file is updated
AND the response contains the new display name.

##### Scenario: Protected fields cannot be modified
GIVEN an authenticated player with id `alice`
WHEN the client PUTs `{ "id": "mallory", "passwordHash": "..." }` to `/api/players/alice`
THEN `id` and `passwordHash` are ignored.

### Capability: Match Management

#### Requirement: List Matches
WHEN an authenticated client GETs `/api/matches`,
THEN the system SHALL return match summaries.
IF the caller is a player,
THEN only matches where the caller participates SHALL be returned.
IF the `playerId` query parameter is provided and the caller is an admin,
THEN only matches for that player SHALL be returned.

##### Scenario: Player lists own matches
GIVEN an authenticated player with id `alice`
WHEN the client GETs `/api/matches`
THEN the response contains only matches where alice is a player.

##### Scenario: Admin filters by player
GIVEN an authenticated admin
WHEN the client GETs `/api/matches?playerId=alice`
THEN the response contains only matches where alice is a player.

#### Requirement: Get Match
WHEN an authenticated client GETs `/api/matches/{match_id}`,
IF the caller is an admin OR the caller participates in the match,
THEN the system SHALL return the full match record.

##### Scenario: View own match replay
GIVEN an authenticated player who participated in match `m1`
WHEN the client GETs `/api/matches/m1`
THEN the response contains the full match record.

##### Scenario: View another player's match
GIVEN an authenticated player who did not participate in match `m1`
WHEN the client GETs `/api/matches/m1`
THEN the response status is 403.

#### Requirement: Create Match
WHEN an authenticated client POSTs to `/api/matches`,
THEN the system SHALL persist the match body as a JSON file and return it with generated `id` and timestamps if omitted.

##### Scenario: Create match record
GIVEN an authenticated admin
WHEN the client POSTs a match body without `id` to `/api/matches`
THEN the response contains an `id` starting with `match_`
AND a file matching that id is created in `data/matches/`.

#### Requirement: Delete Match
WHEN an authenticated admin DELETEs `/api/matches/{match_id}`,
THEN the system SHALL remove the match file.

##### Scenario: Admin deletes match
GIVEN an authenticated admin and an existing match `m1`
WHEN the client DELETEs `/api/matches/m1`
THEN the file `data/matches/m1.json` is removed.

##### Scenario: Player cannot delete match
GIVEN an authenticated player
WHEN the client DELETEs `/api/matches/m1`
THEN the response status is 403.

### Capability: Battle

#### Requirement: Battle Page Access
WHEN an authenticated client navigates to `/battle.html`,
THEN the system SHALL serve the battle page and its assets.

##### Scenario: Open battle page
GIVEN an authenticated user
WHEN the browser navigates to `/battle.html`
THEN the battle interface loads without 401 errors for static assets.

#### Requirement: Load Game Data
WHEN the battle page initializes,
THEN it SHALL fetch public game data tables from `/api/{table}` and cache them locally.

##### Scenario: Data loaded successfully
GIVEN the backend is running
WHEN the battle page loads
THEN requests to `/api/cards`, `/api/characters`, `/api/buffs`, `/api/effects`, `/api/keywords`, and `/api/game-modes` succeed.

#### Requirement: Run Match
WHEN a player starts a match from the battle page,
THEN the system SHALL simulate or drive turns until a winner is determined.

##### Scenario: Complete a match
GIVEN two players with selected characters
WHEN the battle runs to completion
THEN the page reports a winner.

#### Requirement: Record Match
WHEN a match ends,
THEN the battle page SHALL POST the match record to `/api/matches`.

##### Scenario: Save match replay
GIVEN a completed match
WHEN the match ends
THEN a POST to `/api/matches` is sent
AND the response contains a generated match id.

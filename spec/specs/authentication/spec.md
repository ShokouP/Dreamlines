# Authentication Capability

## Overview

The authentication system provides session-based access control for the CardForge SDD management backend. It supports default admin bootstrap, username/password login, token-based session management, and role-based authorization.

## Responsibilities

- Authenticate users via username and password.
- Issue and validate session tokens.
- Enforce role-based access control (`admin` vs `player`).
- Bootstrap a default administrator account on startup.

## Requirements

### Requirement: Default Admin Bootstrap
WHEN the application starts,
IF no user with id `admin` exists,
THEN the system SHALL create an administrator account with username `admin`, password `admin`, and role `admin`.

#### Scenario: First startup
GIVEN the players directory is empty
WHEN the application starts
THEN a file `data/players/admin.json` is created
AND the user has role `admin`.

### Requirement: User Login
WHEN a client submits a username and password,
IF the credentials match a stored player,
THEN the system SHALL return a session token and a sanitized user object.

#### Scenario: Successful login
GIVEN a player exists with username `admin` and password `admin`
WHEN the client POSTS `{ "username": "admin", "password": "admin" }` to `/api/auth/login`
THEN the response contains a `token` and user fields without `passwordHash`.

#### Scenario: Failed login
GIVEN a player exists with username `admin` and password `admin`
WHEN the client POSTS `{ "username": "admin", "password": "wrong" }` to `/api/auth/login`
THEN the response status is 401
AND the response body contains "Invalid credentials".

### Requirement: Token Validation
WHEN a request includes a valid session token via `Authorization: Bearer <token>` header or `cf_token` cookie,
THEN the system SHALL identify the authenticated user.

#### Scenario: Valid token
GIVEN a logged-in user with active session token
WHEN the client GETs `/api/auth/me` with the token
THEN the response contains the user object without `passwordHash`.

#### Scenario: Missing or invalid token
GIVEN no token is provided
WHEN the client calls a protected endpoint
THEN the response status is 401
AND the response body contains "Not authenticated".

### Requirement: Role-Based Authorization
WHEN an authenticated user accesses a protected resource,
IF the user's role is not permitted for that resource,
THEN the system SHALL respond with 403 Forbidden.

#### Scenario: Player accesses admin resource
GIVEN a player with role `player`
WHEN the client GETs `/api/players` as a non-admin
THEN the response status is 403.

### Requirement: Logout
WHEN an authenticated client POSTs to `/api/auth/logout`,
THEN the system SHALL invalidate the provided session token.

#### Scenario: Logout
GIVEN a user with active session token
WHEN the client POSTS to `/api/auth/logout` with the token
THEN subsequent requests with the same token receive 401.

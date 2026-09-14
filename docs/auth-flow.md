# Authentication

Budget Tools is a two-person app with no signup. Accounts are provisioned offline from the command
line; everything else is a username, a password, and a long-lived cookie.

## Provisioning

```
pnpm --filter @budget-tools/api provision-user <username>   # create or change a password
pnpm --filter @budget-tools/api provision-user --list       # who exists
```

The script prompts twice with echo suppressed and stores an **argon2id** hash (`users.password_hash`,
PHC format, salt and parameters embedded). Passwords are never written to disk, to the repo, or to
the shell history. Re-running for an existing username changes that password **and deletes that
user's sessions**, so a password change signs them out everywhere.

Passwords are hashed, not encoded. Base64 would be reversible and is not used anywhere in this flow.

## The loop

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant W as Web app
    participant A as API + auth middleware
    participant D as Postgres

    Note over U,D: Provisioning (one-time, offline)
    U->>D: provision-user → argon2id hash → users row

    Note over U,D: Login
    U->>W: username + password
    W->>A: POST /api/auth/login
    A->>D: look up user, argon2.verify against stored hash
    D-->>A: match
    A->>D: insert session (SHA-256 of token, expires_at = now + 90d)
    A-->>W: Set-Cookie: budget_tools_session=<token>
    Note right of A: HttpOnly; Secure; SameSite=Lax; 90d
    W-->>U: app shell

    Note over U,D: Every authenticated request
    U->>W: use the app
    W->>A: request (browser attaches cookie)
    A->>D: SHA-256 the token, look up session, check expiry
    D-->>A: session + user
    alt last used over a day ago
        A->>D: slide expires_at to now + 90d
        A-->>W: refreshed Set-Cookie
    end
    A-->>W: response

    Note over U,D: Logout
    U->>W: Logout
    W->>A: POST /api/auth/logout
    A->>D: delete session row
    A-->>W: clear cookie, drop cached queries
```

**Sliding window.** Sessions last 90 days and are extended on any request more than a day past
their last use. Use the app at all within any 90-day stretch and you stay signed in indefinitely;
the once-a-day floor keeps ordinary traffic from writing to the database on every call.

## Endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | public | Exchange credentials for a session cookie |
| `POST /api/auth/logout` | public | Clear the session; safe when already signed out |
| `GET /api/auth/me` | **protected** | The signed-in user; its 401 is how the web app detects signed-out |
| `GET /api/health` | public | Health checks and the nav badge |
| *everything else* | **protected** | Receipts, accounts, categorization, travel, YNAB sync… |

Access is **default-deny**: `authMiddleware` runs ahead of `RegisterRoutes`, so a controller added
later is protected with no extra wiring. The public list lives in
`apps/api/src/features/auth/publicRoutes.ts`.

## Design notes

- **Opaque server-side sessions, not JWTs.** Logout and password changes revoke instantly, which a
  stateless token cannot do without a denylist that reintroduces the same server state.
- **Only a hash of the token is stored.** A database leak yields no usable sessions. SHA-256 rather
  than argon2 for this one: the token is 32 bytes of CSPRNG output with no structure to guess, and
  the hash runs on every request.
- **`HttpOnly`** keeps the token away from JavaScript, so an XSS bug cannot exfiltrate it.
  **`SameSite=Lax`** is what blocks CSRF against the mutating endpoints. **`Secure`** is set
  everywhere except development.
- **Wrong password and unknown username return the identical 401 message**, and an unknown username
  still pays the cost of an argon2 verification against a dummy hash, so response timing does not
  disclose which usernames exist.
- **Sign-out clears the TanStack query cache**, so one person's financial data cannot linger in the
  tab for the next.
- Expired session rows are swept on API start.

## Verifying

```
pnpm --filter @budget-tools/api test -- --run src/features/auth   # unit + PGlite repo tests
pnpm --filter @budget-tools/api verify-auth                        # live HTTP loop, real Postgres
```

`verify-auth` boots the app on an ephemeral port, provisions a throwaway user, and asserts the whole
cycle including cookie flags, tampered-cookie rejection, and post-logout reuse.

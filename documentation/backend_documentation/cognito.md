# Cognito Authentication

## Infrastructure Stack

**Files:** `infra/lib/cognito-stack.ts` *(new)*, `infra/bin/fatchad.ts`

Created a new CDK stack `FatchadCognitoStack` that deploys:

- **User Pool** `fatchad-users` — email/password login, self-registration, password reset via email
- **Group** `admin` — full access to `/admin/*` routes
- **Group** `user` — regular players
- **App Client** `fatchad-web` — for the React frontend (no secret, SRP auth, 1h access token, 30d refresh token)

**Outputs:** `UserPoolId`, `UserPoolClientId`, `UserPoolRegion` — needed by frontend and backend.

```bash
cdk deploy FatchadCognitoStack
```

---

## Backend JWT Verification

**Files:** `backend/requirements.txt`, `backend/shared/auth.py`, `infra/lib/api-stack.ts`

**Problem:** Admin auth was a single hardcoded bearer token. No real user identity existed.

**What changed:**

Added `python-jose[cryptography]` — the standard Python library for verifying JWTs signed with RS256 (which Cognito uses).

Rewrote `auth.py` with two modes:

### Production
*Active when `COGNITO_USER_POOL_ID` env var is set*

- `verify_token()` fetches Cognito's public keys (JWKS) once per Lambda container, cached in RAM
- Every token is verified: signature, expiry, issuer
- `require_admin` → checks JWT + `cognito:groups` contains `"admin"`
- `get_current_user_id` → returns the `sub` claim (Cognito's unique user ID)

### Local Dev
*Active when `COGNITO_USER_POOL_ID` is NOT set*

- Falls back to the old `ADMIN_TOKEN` bearer check — `.\start.ps1` keeps working without a deployed Cognito stack

Both Lambdas now receive `COGNITO_USER_POOL_ID` and `COGNITO_APP_CLIENT_ID` as environment variables (passed from the Cognito stack outputs via CDK).

---

## Guest sessions

Players can start a run immediately without signing up, then keep their
progress if they later register. A guest is **not** a special anonymous mode —
it's a real (throwaway) Cognito account tagged with the `guest` group, so the
rest of the system treats it like any other user. Endpoint shapes live in
[API.md](API.md#guest-sessions--account-claim); this section is the lifecycle.

**Files:** `backend/gameplay_lambda/routes/guest.py` (mint),
`backend/gameplay_lambda/routes/account.py` (claim),
`backend/cleanup_lambda/handler.py` (sweep), `infra/lib/cognito-stack.ts`
(`guest` group + scheduled cleanup).

### 1. Mint — `POST /guest` (unauthenticated)

1. Generate a random `guest-<uuid>@guest.fatchad.local` email and a random
   password (`secrets.token_urlsafe(18) + "aA1"` — the suffix guarantees the
   pool's lowercase+digit policy is met).
2. `admin_create_user` with `MessageAction="SUPPRESS"` (no invite email) and
   `email_verified=true`, then `admin_set_user_password(Permanent=True)` — this
   flips the user straight to **CONFIRMED**, so SRP login works immediately.
3. `admin_add_user_to_group(guest)` so the account is queryable for later
   cleanup and the `guest` tag rides in the JWT's `cognito:groups`.
4. Write the `PROFILE` row by hand — the PostConfirmation trigger never fires
   for admin-created users, so the route writes the same shape the trigger
   would have (best-effort: a profile-write failure is logged, not fatal).
5. Return `{email, password}`. Returning the password is acceptable: it's a
   disposable secret for a throwaway account, sent once over HTTPS to the
   client that immediately uses it.

From here the guest signs in via the **normal SRP flow** and persists runs
under `USER#<sub>` like anyone else.

### 2. Claim — `POST /account/claim` (authenticated as the real account)

Lets a freshly-registered real account absorb a guest's progress.

- Caller authenticates as the **real** account (`Authorization` header); the
  guest is proven by passing its **own** still-valid access token in the body.
  So only whoever holds the guest session can claim it — a real user can't
  point this at an arbitrary `sub` to steal someone else's runs.
- Guards: the token must carry the `guest` group (real accounts can't be
  claimed → `403`) and must not be the caller's own account (`400`).
- `claim_guest_data` (`shared/db/user_repo.py`) migrates with **merge
  semantics, no data loss**: the real account keeps its runs and gains the
  guest's (run ids are UUIDs, so re-keying never collides), and profile
  lifetime totals + points are summed in (real user's display name wins).
- The now-empty guest Cognito account is deleted best-effort — if that fails,
  the daily sweep reaps it later.

### 3. Sweep — `cleanup_lambda` (scheduled)

EventBridge runs `cleanup_lambda.handler.handler` **daily at 02:00 UTC**
(wired in `FatchadCognitoStack`). It pages `list_users_in_group("guest")` and,
for every guest older than `GUEST_MAX_AGE_HOURS` (default `24`), deletes **both**
the Cognito user and its `fatchad_user_data` partition. Cognito's
`UserCreateDate` provides the age, so no custom bookkeeping is needed. Set
`GUEST_MAX_AGE_HOURS=0` to wipe every guest on each run. One bad guest is logged
and skipped rather than aborting the sweep.

---

## Frontend

**New files:**

| File | Purpose |
|---|---|
| `frontend/src/stores/authStore.ts` | Cognito session state — login, logout, register, password reset, `userId`, `accessToken`, `isAdmin` |
| `frontend/src/pages/Login.tsx` | Login form |
| `frontend/src/pages/Register.tsx` | Registration (2 steps: credentials → email verification code) |
| `frontend/src/pages/ForgotPassword.tsx` | Password reset (2 steps: send code → set new password) |
| `frontend/src/components/RequireAuth.tsx` | Route guard — redirects to `/login` if not authenticated |
| `frontend/src/pages/auth.module.css` | Shared styles for all auth pages |

**Updated files:**

| File | What changed |
|---|---|
| `frontend/src/components/RequireAdmin.tsx` | Now uses `authStore` (Cognito groups) instead of `adminStore` (hardcoded token) |
| `frontend/src/routes.tsx` | Added `/login`, `/register`, `/forgot-password` routes; gameplay routes wrapped with `RequireAuth` |
| `frontend/src/main.tsx` | Calls `authStore.initFromSession()` on boot to restore session from localStorage |

**Required env vars** — add to `.env.local` after deploying `FatchadCognitoStack`:

```env
VITE_COGNITO_USER_POOL_ID=eu-central-1_xxxxx
VITE_COGNITO_APP_CLIENT_ID=yyyyy
```

Values come from the CDK stack outputs after `cdk deploy FatchadCognitoStack`.

---

## Status — complete

Both items below are now done (this section previously tracked them as pending):

| Task | Where |
|---|---|
| Routes migration | Gameplay routes derive `user_id` from the JWT `sub` claim via `get_current_user_id` (`backend/shared/auth.py`); no `?user_id=` params remain (`backend/gameplay_lambda/routes/runs.py`, `gameplay.py`). |
| API client | `frontend/src/api/client.ts` + `admin.ts` attach `Authorization: Bearer <accessToken>` from `authStore` on every call. |

Admin run-inspection views (Users directory, per-user detail, Run-Inspektor)
additionally require the admin Lambda to **read** `fatchad_user_data`
(`userTable.grantReadData` in `infra/lib/api-stack.ts`).

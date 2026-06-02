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

## What is still pending

| Task | Description |
|---|---|
| Routes migration | Remove `?user_id=` query params from all gameplay routes — derive `user_id` from JWT `sub` claim instead |
| API client | Add `Authorization: Bearer <accessToken>` header to all API calls |

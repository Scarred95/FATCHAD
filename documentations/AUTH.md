# Frontend auth — dev vs prod

The frontend ships with two interchangeable auth backends. Which one runs is
decided **at build time** by a single Vite env flag, `VITE_USE_DEMO_AUTH`.

```
VITE_USE_DEMO_AUTH=true   → demoBackend  (in-process, no network)
VITE_USE_DEMO_AUTH=false  → cognitoBackend (AWS Cognito via Amplify)
```

Both backends implement the same `AuthBackend` interface (`src/auth/AuthFlow.tsx`)
and both write to the same Zustand store (`src/auth/authStore.ts`), so the rest
of the app cannot tell them apart.

---

## How Vite picks the mode

Vite auto-loads env files based on the command you run. **Code changes are not
needed to switch backends — running a different command is enough.**

| Command                | Mode          | Env file loaded         | Backend selected |
|------------------------|---------------|-------------------------|------------------|
| `npm run dev`          | `development` | `.env.development`      | demo             |
| `npm run build`        | `production`  | `.env.production`       | cognito          |
| `npm run preview`      | `production`  | `.env.production`       | cognito          |

The CI deploy workflow overrides `VITE_USE_DEMO_AUTH=false` and injects the
real `VITE_USER_POOL_ID` / `VITE_USER_POOL_CLIENT_ID` from the
`FatchadAuthStack` CloudFormation outputs at build time.

### Local launch — dev mode (demo backend)

```bash
cd frontend
npm install        # first time only
npm run dev

```
Open the printed URL. Log in with:

```
Username: AurenAdmin
Password: test123
```

The signup / confirm / reset flows all "succeed" without any AWS calls —
6-digit codes are accepted as long as the format matches `/^\d{6}$/`. A
successful login writes a synthetic Cognito-shaped user (`id`, `username`)
into `useAuthStore`, which is enough for any code path that only needs an
authenticated session.

### Local launch — prod mode (Cognito)

Only useful once `FatchadAuthStack` is deployed and `aws-amplify` is
installed. To preview a production build locally:

```bash
cd frontend
# One-off override — bypasses .env.development
VITE_USE_DEMO_AUTH=false \
VITE_USER_POOL_ID=eu-central-1_XXXXXX \
VITE_USER_POOL_CLIENT_ID=XXXXXXXXXXXX \
npm run build && npm run preview
```

Without those three vars, `cognitoBackend.configureAmplify()` throws at
startup with an actionable error message.

---

## Where the wiring lives

```
src/auth/
├── AuthFlow.tsx          # state machine: login → signup → confirm → reset
├── AuthBackend           #   ^ interface exported from AuthFlow.tsx
├── authStore.ts          # Zustand store: { user, loading, setUser, setLoading }
├── demoBackend.ts        # AurenAdmin / test123, no AWS
├── cognitoBackend.ts     # Amplify wrapper (currently stubbed — see file header)
├── bootAuth.ts           # picks one backend at startup, exposes getAuthBackend()
└── pages/                # LoginPage, SignupPage, ConfirmEmailPage, ResetRequestPage, ResetSubmitPage
```

`main.tsx` calls `bootAuth()` **before** `createRoot().render()` so the
chosen backend is available synchronously when `App.tsx` first renders.

`App.tsx` is the gate:

- `loading=true` → render nothing (cold Amplify hydration only — in demo mode
  `bootAuth()` flips this off synchronously).
- `user === null` → render `<AuthFlow backend={getAuthBackend()} />`.
- `user !== null` → render the normal `<Outlet />`.

There is **no `/login` route** by design. The auth UI replaces the page; the
URL the user landed on is preserved and revealed after they sign in.

---

## Going live (when the User Pool exists)

1. `npm install aws-amplify`
2. Uncomment the `Amplify.configure(...)` block and the `Hub.listen(...)`
   subscription in `src/auth/cognitoBackend.ts`.
3. Uncomment each method body (the `// await Auth.signIn(...)` lines) and
   delete the `throw new Error('... not wired yet')` placeholders.
4. Deploy `FatchadAuthStack` and verify `VITE_USER_POOL_ID` /
   `VITE_USER_POOL_CLIENT_ID` are present in the deploy workflow.

No changes to `AuthFlow`, `authStore`, pages, or `App.tsx` should be needed —
the interface is already what Amplify will satisfy.

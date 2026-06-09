# FATCHAD Documentation

Start here. Each doc below is scoped to one concern — follow the "Read when"
column to find the right one.

## Current-state docs

| Doc | What it covers | Read when |
|---|---|---|
| [FRONTEND.md](FRONTEND.md) | The React/TS app: screens, routes, stores, API wiring, design system | You're touching the player or admin UI |
| [API_CONTRACT.md](API_CONTRACT.md) | Frontend ↔ backend wiring map — which layers to edit for a given change | You're adding/changing an endpoint or a shared field |
| [backend_documentation/API.md](backend_documentation/API.md) | Canonical HTTP contract — every endpoint's request/response shape + status codes | You need the exact wire shape of a call |
| [backend_documentation/GAME_FLOW.md](backend_documentation/GAME_FLOW.md) | The run engine: lifecycle, the per-turn `apply_choice` pipeline, endings, refill | You're changing game mechanics |
| [backend_documentation/categories.md](backend_documentation/categories.md) | Card-authoring guide — categories, flag naming, weights, questline patterns | You're authoring card content |
| [backend_documentation/DEPLOYMENT.md](backend_documentation/DEPLOYMENT.md) | AWS infra: the five CDK stacks, deploy flow, secrets, observability, smoke tests | You're deploying or debugging infra |
| [INFRA.md](INFRA.md) | The CDK app itself: one-time bootstrap, stack/role layout, frontend & DB release commands | You're running CDK or editing `infra/` |
| [backend_documentation/cognito.md](backend_documentation/cognito.md) | Cognito auth: user pool, groups, JWT verification, guest/claim flow | You're working on auth |
| [FEATURE_IDEAS.md](FEATURE_IDEAS.md) | Backlog of proposed features, with status | You're planning what to build next |

## Design records (historical)

| Doc | What it covers |
|---|---|
| [history/CLOUD_DESIGN.md](history/CLOUD_DESIGN.md) | The AWS-migration design rationale + cost model. The migration is complete; this is kept for the *why*. Current infra state lives in DEPLOYMENT.md |

## Conventions

- **Single source of truth:** request/response shapes live in **API.md**.
  API_CONTRACT.md and FRONTEND.md link to it rather than restating shapes — if
  you change a shape, change it in API.md.
- Shared entities (Card, Deck, Ending, Achievement, GameState) are defined in
  `backend/shared/schemas.py` and mirrored in `frontend/src/api/types.ts` /
  `frontend/src/admin/types.ts`. Change both or the field drops on the wire.

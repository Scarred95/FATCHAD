# FATCHAD Infra

CDK app for the FATCHAD AWS deployment. Currently covers step 1 of the
migration plan in [`CLOUD_DESIGN.md`](../CLOUD_DESIGN.md): IAM trust for CI
and the public S3 bucket that hosts the React SPA. The backend (Lambda + API
Gateway + DynamoDB + Cognito) arrives in later steps.

## One-time local bootstrap

Run this once per AWS account, with admin credentials. It creates the IAM
roles that GitHub Actions assumes for every subsequent deploy.

```bash
cd infra
npm install

# Authenticate with AWS as an admin (e.g. `aws sso login`).
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=eu-central-1

# CDK's own bootstrap (CDKToolkit stack) — required before any cdk deploy.
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION

# Our bootstrap stack: OIDC provider + two deploy roles.
npx cdk deploy FatchadBootstrapStack
```

Copy the two role ARN outputs and add them as GitHub Actions secrets:

```
Settings → Secrets and variables → Actions → New repository secret

  Name:  AWS_DEPLOY_ROLE_ARN
  Value: <FatchadBootstrapStack.GitHubDeployRoleArn output>

  Name:  AWS_FRONTEND_UPLOAD_ROLE_ARN
  Value: <FatchadBootstrapStack.FrontendUploadRoleArn output>
```

- `AWS_DEPLOY_ROLE_ARN` is used by `deploy-infra.yml` to run `cdk deploy`.
- `AWS_FRONTEND_UPLOAD_ROLE_ARN` is used by `deploy-frontend.yml` to sync
  the React build to the `fatchad-frontend` S3 bucket. Two roles for
  least-privilege: a leaked frontend role can only overwrite the SPA
  bucket, nothing else.

Then create the frontend bucket (also once):

```bash
npx cdk deploy FatchadFrontendStack
```

After this, all further deploys ride on GitHub Actions.

## Stacks

| Stack | Contains | How it's deployed |
|---|---|---|
| `FatchadBootstrapStack` | OIDC provider, `FatchadGitHubDeployRole`, `FatchadFrontendUploadRole` | Manual from a laptop. Re-deploy only when IAM trust changes. |
| `FatchadFrontendStack` | `fatchad-frontend` S3 bucket (versioned, public website hosting) | First time manual. After that, `deploy-infra.yml` redeploys it whenever `infra/**` changes. |
| `FatchadDataStack` | `fatchad_catalog` + `fatchad_user_data` DynamoDB tables (pay-per-request, streams enabled) | Tag-driven via `deploy-data.yml`. Push a `database-v*` tag (e.g. `database-v0.1.0`) or run the workflow manually. Backend wiring lands in a later step. |

### `FatchadFrontendStack`

| Resource | Purpose |
|---|---|
| `fatchad-frontend` S3 bucket | Hosts the React SPA build. Public read for v1; private + CloudFront OAC in step 2. |
| Object versioning + 90d retention | Every PUT keeps the prior version. Lets us roll back without rebuilding. |
| Removal policy: RETAIN | `cdk destroy` keeps the bucket. The bucket name is globally unique — losing it is permanent. |

### `FatchadDataStack`

Two DynamoDB tables, single-table design per table, no GSIs in v1.

| Table | Holds | Streams to (later) |
|---|---|---|
| `fatchad_catalog` | Decks, Cards, Endings, Achievements, current-version pointer. Every entity has an `enabled` flag — disabled items stay in the editor but get stripped from the published bundle. | Optional cache-invalidation / audit Lambda. |
| `fatchad_user_data` | Profiles, deck unlocks, achievements, runs (active/ended/abandoned), leaderboards. | Leaderboard aggregator Lambda. |

See header comments in [`lib/ddb-stack.ts`](lib/ddb-stack.ts) for the full PK/SK conventions per entity.

**Removal policy is currently `DESTROY` on both tables.** That's deliberate for the development phase — schema can change, data is fixture-only. Flip both to `RETAIN` before any real user account is created; the day we forget is the day we accidentally `cdk destroy` and lose history.

The bucket itself is provisioned by CDK; the actual SPA files are uploaded
by `deploy-frontend.yml` with `aws s3 sync`, not by `cdk deploy`. This split
keeps the CDK stack stable across releases — only true infrastructure
changes (e.g. adding CloudFront) trigger a CDK deploy.

## Releasing the frontend

```bash
# From the repo root, on whatever branch:
git tag frontend-v0.1.0
git push origin frontend-v0.1.0
```

`deploy-frontend.yml` fires, builds the frontend with `VITE_WIP_MODE=true`
and `VITE_APP_VERSION=v0.1.0`, then syncs `frontend/dist/` to
`s3://fatchad-frontend/`. Workflow summary prints the public URL.

Manual deploys from the Actions tab (`workflow_dispatch`) also work — handy
for hotfix redeploys without bumping the version.

### Rolling back

S3 object versioning is on, so every previous deploy is recoverable:

```bash
# List versions of index.html
aws s3api list-object-versions --bucket fatchad-frontend --prefix index.html

# Promote a specific version back to "current"
aws s3api copy-object \
  --copy-source "fatchad-frontend/index.html?versionId=<VERSION_ID>" \
  --bucket fatchad-frontend \
  --key index.html
```

For a full multi-file rollback, just redeploy the previous tag via
`workflow_dispatch` with `version_label=v0.0.9`.

## Releasing the database schema

```bash
# From the repo root, on whatever branch:
git tag database-v0.1.0
git push origin database-v0.1.0
```

`deploy-data.yml` fires, synths + diffs + deploys `FatchadDataStack`. The
tag is the source of truth for "what schema version is live" — `git tag -l
'database-v*' --sort=-v:refname | head` answers that question.

Manual deploys via `workflow_dispatch` also work, useful for redeploying
the current tag after a CDK-only change (e.g. tweaking outputs) without
bumping the version.

CDK is declarative, so re-running the same tag is a no-op. Adding a GSI,
flipping `removalPolicy`, or enabling/changing a stream are real diffs and
will be applied. Renaming a table is a destroy+create — CDK will warn,
and in DESTROY mode it'll happily delete the old one. Read the diff.

## Local development

```bash
npm run synth                         # CloudFormation only, no deploy
npx cdk diff FatchadFrontendStack     # what would change
npx cdk deploy FatchadFrontendStack   # deploy from your laptop (skips CI)
```

## Notes

- **Region**: `eu-central-1` (Frankfurt). Change via `CDK_DEFAULT_REGION`
  env var, or edit `bin/fatchad.ts`.
- **Why split the bootstrap stack?** It manages the role GitHub Actions
  uses. Chicken-and-egg: CI can't deploy its own trust. So the bootstrap
  stack is laptop-only, and `deploy-infra.yml` deliberately excludes it.
- **Least-privilege CDK deploy role**: only `sts:AssumeRole` on `cdk-*`
  roles in this account and `ssm:GetParameter` on `/cdk-bootstrap/*`. The
  four `cdk-hnb659fds-*` roles created by `cdk bootstrap` hold the actual
  power to create resources. A leaked deploy role can only deploy the
  CDK stacks defined in this repo.
- **Least-privilege frontend upload role**: only `s3:Put/Get/Delete` on
  the `fatchad-frontend` bucket and its objects. Trust is scoped to the
  `frontend-v*` tag pattern and listed branches (`main`, plus the active
  dev branch until the pipeline is stable).
- **Public S3 bucket** is acceptable for v1. Step 2 of the migration moves
  to CloudFront + Origin Access Control with the bucket private.

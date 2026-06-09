# FATCHAD

Ein satirisches, deutschsprachiges Kartenspiel im Stil von *Reigns* — per
Wisch-Entscheidung beeinflusst die Spielerin vier Werte (`moneten`, `aura`,
`respekt`, `rizz`) sowie eine versteckte `chaos`-Achse. Man bewegt sich durch
absurde Alltagssituationen; Karten bilden einen gerichteten Graphen, der den
Lauf verzweigt (Folgekarten in den Stapel pushen, Flags setzen / erfordern,
Endings auslösen).

**FATCHAD läuft als cloud-native Web-App auf AWS.** Die React-SPA wird per
S3-Static-Website-Hosting ausgeliefert, das FastAPI-Backend ist auf mehrere
Lambdas hinter API Gateway aufgeteilt, der Spielzustand liegt in DynamoDB, der
Karten-Content als versionierte Bundles in S3, Auth läuft über Cognito, und die
gesamte Infrastruktur ist als AWS-CDK definiert und wird per GitHub Actions
ausgerollt. Lokal startet alles weiterhin per `uvicorn` + Vite (siehe unten).

## Team

- **Auren**
- **Tommy**
- **Florian**

Die Arbeitsteilung läuft gleichmäßig — wir entscheiden tagesaktuell, wer
welchen Bereich übernimmt, je nachdem was gerade ansteht (Lambda-Funktionen,
DynamoDB-Modellierung, Frontend-Hosting, IaC).

## Architektur

Serverloses Setup auf AWS — kein eigener Server, auto-scaling,
pay-per-request:

```
                          statische Assets (HTML/JS/CSS)
        Browser ──────────────────────────────────▶ ┌────────────────────┐
           │                                         │ S3: SPA-Bucket     │ ◀── Vite-Build
           │  REST-Aufrufe (HTTPS)                   │ (Static-Website)   │
           ▼                                         └────────────────────┘
   ┌──────────────┐
   │ API Gateway  │
   │ (HTTPS)      │
   └──────────────┘
           │
           ▼
   ┌──────────────────┐
   │ AWS Lambda       │ ──▶ CloudWatch Logs / Metrics
   │ (Game + Admin)   │
   └──────────────────┘
        │            │
        │ Pointer +  │ liest Karten-JSON (catalog_full.json)
        │ Runs/User  │ + Admin „Publish" schreibt Bundles
        ▼            ▼
   ┌──────────────┐   ┌────────────────────┐
   │ DynamoDB     │   │ S3: Katalog-Bucket │
   │ Runs, User,  │   │ versionierte JSON- │
   │ Working-Cat, │   │ Bundles (Karten,   │
   │ Version-Ptr  │   │ Decks, Endings …)  │
   └──────────────┘   └────────────────────┘
```

Die **Karten-/Deck-/Ending-/Achievement-Daten** liegen also nicht direkt im
Hot-Path der DynamoDB: Der Admin editiert eine Working-Copy in DDB und löst ein
**Publish** aus, das versionierte JSON-Bundles in einen eigenen S3-Bucket
schreibt und den Version-Pointer in DDB setzt. Die Gameplay-Lambda liest pro
Snapshot-Refresh nur den Pointer aus DDB und holt die eigentlichen Karten-Daten
als `catalog_full.json` aus S3 (gecacht im Lambda-Container) — und reicht sie
ans Frontend weiter.

| Komponente      | Umsetzung                                                          |
| --------------- | ----------------------------------------------------------------- |
| Frontend        | React 18 + TypeScript + Vite + Zustand → **S3 Static-Website-Hosting** |
| Backend         | FastAPI (Pydantic) via Mangum, auf mehrere **AWS Lambdas** hinter **API Gateway** |
| Persistenz      | **DynamoDB** — zwei Tabellen: `fatchad_user_data` (Runs, User, Leaderboards) + `fatchad_catalog` (Working-Catalog, Version-Pointer) |
| Content/Katalog | versionierte JSON-Bundles in **S3**, von der Lambda gelesen        |
| Auth            | **Cognito** (JWT, Admin-Group)                                     |
| Observability   | **CloudWatch** Logs + Dashboard                                    |
| Deployment      | **AWS CDK** (IaC) + **GitHub Actions** (tag-getriggert)           |

## Design-Entscheidungen

- **Single-Table für User-Daten:** `fatchad_user_data` bündelt Profil, Unlocks,
  Achievements und aktiven Run unter `PK=USER#<uid>` — ein Query lädt den vollen
  User-Kontext. Der Katalog liegt in einer eigenen Tabelle (`fatchad_catalog`).
- **Lambda-Split entlang der IAM-Grenze:** `gameplay_lambda` und `admin_lambda`
  laufen getrennt — die Spieler-Lambda kann den Admin-Code nicht einmal
  importieren. `cognito_lambda` und `cleanup_lambda` sind eigene Surfaces.
- **Stateless Spielzustand:** Der `Run`-State lebt in DynamoDB, nicht im
  Lambda-Memory — jeder Request ist für sich auflösbar.
- **Katalog über S3 statt Hot-Path-DB:** Content wird gepublisht (versionierte
  Bundles in S3) und von der Lambda gecacht gelesen, statt ihn pro Request aus
  der DB zusammenzubauen.
- **CORS in FastAPI:** Das API Gateway bleibt CORS-agnostisch; die Allow-List
  (inkl. S3-Website-Origin) sitzt in der `CORSMiddleware`.

## Aufbau des Repositorys

```
backend/             FastAPI-Router pro Lambda + geteilte Spiellogik
  gameplay_lambda/   Spieler-Endpoints (Runs, Karten, Choices, Endings)
  admin_lambda/      Admin-CRUD (Cards, Decks, Endings, Achievements, Publish)
  cognito_lambda/    Cognito-Trigger / Auth-Glue
  cleanup_lambda/    Aufräum-/Wartungs-Jobs
  shared/            Spielmechanik, DynamoDB-Repos, Schemas, Catalog-Snapshot
  dev_app.py         Lokaler Combined-Entrypoint (beide Surfaces, ein Port)
frontend/            React-App (Spiel + /admin-Bereich)
  src/admin/         Karten-/Deck-/Ending-/Achievement-Editor
infra/               AWS-CDK-Stacks (S3, DynamoDB, IAM/OIDC)
documentation/       Architektur, API-Contract, Frontend-Doku
.github/workflows/   CI/CD (Frontend-, Lambda-, Data- und Infra-Deploy)
```

## Hosting / Deployment auf AWS

Komplettes Setup von einem leeren AWS-Account bis zur live deployten App.
Region ist überall `eu-central-1` (Frankfurt). Details zu den Stacks und
Rollen stehen in [`documentation/INFRA.md`](documentation/INFRA.md).

### 1. Einmaliger Bootstrap (lokal, mit Admin-Credentials)

Legt CDKs eigenen Toolkit-Stack und unseren `FatchadBootstrapStack` an —
letzterer erzeugt den OIDC-Provider und die drei IAM-Rollen, die GitHub
Actions später annimmt. Das muss lokal laufen, weil CI das Vertrauen, das es
selbst benutzt, nicht deployen kann (Henne-Ei).

```bash
cd infra
npm install

# Als AWS-Admin authentifizieren (z. B. `aws sso login`).
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=eu-central-1

npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
npx cdk deploy FatchadBootstrapStack
```

Der Deploy gibt drei Rollen-ARNs aus (`GitHubDeployRoleArn`,
`FrontendUploadRoleArn`, `LambdaDeployRoleArn`).

### 2. GitHub-Actions-Secrets setzen

`Settings → Secrets and variables → Actions → New repository secret`. Die ersten
drei kommen 1:1 aus den Bootstrap-Outputs, die letzten beiden definierst du selbst:

| Secret | Wert | Genutzt von |
| --- | --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `FatchadBootstrapStack.GitHubDeployRoleArn` | `deploy-infra`, `deploy-data` |
| `AWS_FRONTEND_UPLOAD_ROLE_ARN` | `FatchadBootstrapStack.FrontendUploadRoleArn` | `deploy-frontend` |
| `AWS_LAMBDA_DEPLOY_ROLE_ARN` | `FatchadBootstrapStack.LambdaDeployRoleArn` | `deploy-lambdas` |
| `ADMIN_TOKEN` | frei gewähltes Geheimnis (Static-Bearer für Admin-Fallback) | `deploy-lambdas` (CDK-Context `adminToken`) |
| `CORS_ORIGINS` | erlaubte Origins, kommagetrennt (z. B. die S3-Website-URL) | `deploy-lambdas` (CDK-Context `corsOrigins`) |

Drei getrennte Rollen wegen Least-Privilege: ein geleaktes Frontend-Token kann
nur den SPA-Bucket überschreiben, sonst nichts.

### 3. Frontend-Bucket anlegen (einmalig)

`FatchadFrontendStack` erstellt den `fatchad-frontend`-Bucket. Beim ersten Mal
lokal deployen; danach übernimmt das die `infra-v*`-Pipeline.

```bash
npx cdk deploy FatchadFrontendStack
```

### 4. Per Git-Tag deployen

Ab hier läuft alles über GitHub Actions. Jeder Deploy hängt an einem
**versionierten Tag** — so beantwortet `git tag` jederzeit „was ist live?".
Branch-Pushes triggern bewusst nichts. Reihenfolge beim Erst-Deploy:

```bash
# a) DynamoDB-Tabellen (FatchadDataStack)
git tag database-v0.1.0 && git push origin database-v0.1.0

# b) Cognito + API/Lambdas (FatchadCognitoStack → FatchadApiStack)
#    Cognito zuerst, weil die API-Stack die Pool-/Client-IDs cross-stack importiert.
git tag lambda-v0.1.0 && git push origin lambda-v0.1.0

# c) Frontend bauen + nach S3 syncen
#    Holt API-URL + Cognito-IDs zur Build-Zeit aus den CloudFormation-Outputs.
git tag frontend-v0.1.0 && git push origin frontend-v0.1.0
```

`infra-v*` deployt zusätzlich `FatchadFrontendStack` neu, wenn sich an der
Bucket-Infra etwas ändert. Jeder Workflow lässt sich auch manuell über
*Actions → Run workflow* (`workflow_dispatch`) starten — praktisch für einen
Hotfix-Redeploy ohne neuen Tag.

| Tag-Muster | Workflow | Stack(s) / Aktion |
| --- | --- | --- |
| `database-v*` | `deploy-data.yml` | `FatchadDataStack` (DynamoDB-Tabellen) |
| `lambda-v*` | `deploy-lambdas.yml` | `FatchadCognitoStack` + `FatchadApiStack` |
| `frontend-v*` | `deploy-frontend.yml` | Build → `s3://fatchad-frontend` |
| `infra-v*` | `deploy-infra.yml` | `FatchadFrontendStack` |

### 5. Katalog publishen

Karten/Decks/Endings/Achievements leben als Working-Copy in DynamoDB. Erst
ein **Publish** im Admin-Bereich schreibt die versionierten S3-Bundles
(`catalog_full.json` für die Engine, `catalog_public.json` fürs SPA) und
setzt den `META#current`-Pointer — Gameplay liest immer den gepublishten
Snapshot, nie die Working-Copy. Nach Inhaltsänderungen also im Admin-UI
„Publish" auslösen.

`FatchadBootstrapStack` wird nur erneut deployt, wenn sich das IAM-Trust
ändert (z. B. ein neuer Dev-Branch in die `sub`-Pattern aufgenommen wird).

## Lokal starten

```bash
# Backend — kombinierte Dev-App: /runs/*, /admin/* und /healthz auf einem Port
cd backend
pip install -r requirements.txt
uvicorn dev_app:app --reload

# Frontend (separates Terminal)
cd frontend
npm install
npm run dev
```

Der Admin-Bereich liegt unter `/admin` (über die Cognito-`admin`-Gruppe
geschützt).

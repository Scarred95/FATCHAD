# FATCHAD

Ein satirisches, deutschsprachiges Kartenspiel im Stil von *Reigns* — per
Wisch-Entscheidung beeinflusst die Spielerin vier Werte (`moneten`, `aura`,
`respekt`, `rizz`) sowie eine versteckte `chaos`-Achse. Man bewegt sich durch
absurde Alltagssituationen; Karten bilden einen gerichteten Graphen, der den
Lauf verzweigt (Folgekarten in den Stapel pushen, Flags setzen / erfordern,
Endings auslösen).

**Das Spiel existiert als spielbare Web-App** (React-Frontend + FastAPI-Backend).
Die Projektphase widmet sich der **Weiterentwicklung des Spiels** und der
**Portierung in eine cloud-native Architektur auf AWS**. Die Portierung ist
bereits weit fortgeschritten: Die API ist auf mehrere Lambdas aufgeteilt, die
Persistenz läuft auf DynamoDB, Auth über Cognito, die Infrastruktur ist als
AWS-CDK definiert, und CI/CD deployt über GitHub Actions. Lokal lässt sich
weiterhin alles per `uvicorn` + Vite starten (siehe unten).

## Team

- **Auren**
- **Tommy**
- **Florian**

Die Arbeitsteilung läuft gleichmäßig — wir entscheiden tagesaktuell, wer
welchen Bereich übernimmt, je nachdem was gerade ansteht (Lambda-Funktionen,
DynamoDB-Modellierung, Frontend-Hosting, IaC).

## Projektziel: Cloud-Native auf AWS

Wir bauen die bestehende, monolithische Spiel-API zu einem serverlosen
Setup auf AWS um, ohne den Spielablauf zu verändern. Erfolg = identisches
Spielerlebnis, aber komplett ohne eigenen Server, mit auto-scaling und
pay-per-request.

**Ziel-Architektur**

```
   Browser
      │  (statische Assets)
      ▼
┌──────────────┐        ┌──────────────────┐
│ CloudFront   │  ───▶  │ S3 Bucket        │  ◀── Build-Output (Vite)
│ (CDN + TLS)  │        │ (SPA: HTML/JS)   │
└──────────────┘        └──────────────────┘
      │  (REST-Aufrufe)
      ▼
┌──────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ API Gateway  │  ───▶  │ AWS Lambda       │  ───▶  │ DynamoDB         │
│ (HTTPS)      │        │ (Game-Endpoints) │        │ (Cards, Runs)    │
└──────────────┘        └──────────────────┘        └──────────────────┘
                                │
                                └──▶ CloudWatch Logs / Metrics
```

| Layer        | Bisher (lokal)                | Ziel (AWS) · Status                              |
| ------------ | ----------------------------- | ----------------------------------------------- |
| Frontend     | `npm run dev` via Vite        | Build → **S3** (✅), **CloudFront** (geplant)   |
| Backend      | FastAPI / uvicorn-Prozess     | **API Gateway** → **AWS Lambda** (✅, gesplittet)|
| Persistenz   | MongoDB                       | **DynamoDB** (✅ Single-Table)                   |
| Auth / Token | Static-Bearer aus `.env`      | **Cognito** (JWT, Admin-Group) ✅               |
| Observability| Lokale Logs                   | CloudWatch Logs + Dashboard (✅), Alarms (geplant)|
| Deployment   | manuell                       | **IaC** mit AWS **CDK** (✅) + GitHub Actions   |

## Knackpunkte beim Port

- **DynamoDB-Datenmodell:** MongoDB-Dokumente sind frei verschachtelt,
  DynamoDB will Single-Table-Design mit PK/SK. Cards, Runs und
  User-Suggestions müssen sauber auf Partition-Keys gemappt werden.
- **Lambda Cold-Start:** Die FastAPI-Routen werden auf einzelne Lambda-
  Handler verteilt (oder via Mangum/FastAPI-Adapter gebündelt). Wir
  entscheiden je nach Cold-Start-Verhalten.
- **Stateless Spielzustand:** Der bestehende `Run`-State wird in DynamoDB
  persistiert, statt im Server-Memory zu leben.
- **CORS + API-Gateway:** Routing- und Header-Setup, damit das SPA aus
  CloudFront sauber gegen das API-Gateway sprechen kann.
- **CI/CD:** GitHub Actions baut Frontend, deployt S3-Sync und schiebt
  Lambda-Updates.

## Verwendete Technologien

| Bereich       | Bestehend                               | Neu für die Cloud-Phase                  |
| ------------- | --------------------------------------- | ---------------------------------------- |
| Frontend      | React 18 + TypeScript + Vite, Zustand   | S3-Hosting (CloudFront geplant)          |
| Backend       | FastAPI, Pydantic                       | AWS Lambda (Python, Mangum), API Gateway |
| Datenbank     | MongoDB                                 | DynamoDB (Single-Table)                  |
| Auth          | Static-Bearer                           | Cognito (JWT, Admin-Group)               |
| Infrastruktur | —                                       | AWS CDK (TypeScript)                     |
| CI/CD         | manuell                                 | GitHub Actions → AWS                     |
| Monitoring    | lokale Logs                             | CloudWatch                               |

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

## Plan für die nächsten drei Wochen

**Woche 1 — AWS-Fundament**
- Spiel entwicklung planen und Featurescope festlegen
- Spiel lokal auf den gewünschten stand bringen
- AWS-Accounts / IAM-Rollen einrichten, Region festlegen
- DynamoDB-Tabellen modellieren (Cards, Runs, Suggestions) und Test-Daten
  migrieren
- Erste Lambda mit einem Read-Endpoint (z. B. `GET /cards`) live über
  API-Gateway erreichbar machen
- Tooling-Entscheidung getroffen: **AWS CDK** (TypeScript, siehe `infra/`)

**Woche 2 — Migration der Spiel-Logik**
- Restliche Game-Endpoints auf Lambdas portieren (Run starten, Karte
  ziehen, Choice auflösen, Endings)
- Mongo-Aufrufe gegen DynamoDB-Zugriffe austauschen, Single-Table-Design
  finalisieren
- Frontend-Build nach S3 deployen, CloudFront davor schalten
- API-Base-URL im Frontend konfigurierbar machen (lokal vs. AWS)

**Woche 3 — Härtung & Demo**
- CI/CD via GitHub Actions: Frontend-Sync nach S3, Lambda-Update bei Push
- CloudWatch-Logs/Alarms, einfache Kostenkontrolle (Budgets)
- End-to-End-Smoke-Tests gegen die deployte Umgebung
- Doku aufräumen, Architektur-Diagramm, Präsentation

Tagesaktuelle Aufgaben verteilen wir im kurzen Stand-up — wer gerade Lust
auf welchen Teil (Lambda, DynamoDB-Mapping, Frontend-Hosting, IaC) hat,
zieht ihn sich.

## Lokal starten (während der Migration weiterhin nutzbar)

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

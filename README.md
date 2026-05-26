# FATCHAD

Ein satirisches, deutschsprachiges Kartenspiel im Stil von *Reigns* — per
Wisch-Entscheidung beeinflusst die Spielerin vier Werte (`moneten`, `aura`,
`respekt`, `rizz`) sowie eine versteckte `chaos`-Achse. Man bewegt sich durch
absurde Alltagssituationen; Karten bilden einen gerichteten Graphen, der den
Lauf verzweigt (Folgekarten in den Stapel pushen, Flags setzen / erfordern,
Endings auslösen).

**Das Spiel existiert bereits als Rohform** und läuft lokal als Web-App
(React-Frontend + FastAPI-Backend + MongoDB). Die Projektphase widmet sich
nicht dem Spiel, sondern der **weiterentwicklung des Spiels** und der **Portierung in eine vollständig
cloud-native Architektur auf AWS**.

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

| Layer        | Bisher (lokal)                | Ziel (AWS)                                |
| ------------ | ----------------------------- | ----------------------------------------- |
| Frontend     | `npm run dev` via Vite        | Build → **S3** + **CloudFront** (CDN/TLS) |
| Backend      | FastAPI / uvicorn-Prozess     | **API Gateway** → **AWS Lambda**          |
| Persistenz   | MongoDB                       | **DynamoDB** (Cards, Runs, Suggestions)   |
| Auth / Token | Static-Bearer aus `.env`      | AWS-Secret + (ggf.) Cognito               |
| Observability| Lokale Logs                   | CloudWatch Logs + Metrics + Alarms        |
| Deployment   | manuell                       | **IaC** (Terraform oder AWS SAM/CDK)      |

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
| Frontend      | React 18 + TypeScript + Vite, Zustand   | S3 + CloudFront Hosting                  |
| Backend       | FastAPI, Pydantic                       | AWS Lambda (Python), API Gateway         |
| Datenbank     | MongoDB                                 | DynamoDB                                 |
| Infrastruktur | —                                       | Terraform **oder** AWS SAM/CDK           |
| CI/CD         | manuell                                 | GitHub Actions → AWS                     |
| Monitoring    | lokale Logs                             | CloudWatch                               |

## Aufbau des Repositorys

```
backend/         FastAPI-App, Spiellogik, DB-Repositories, Routen
  app/game/      Deck-Mechanik, Eligibility, Stat-Effekte
  app/routes/    Öffentliche und Admin-Endpoints
frontend/        React-App (Spiel + /admin-Bereich)
  src/admin/     Karten-Editor, Graph-Ansicht
infra/           (kommt) IaC-Definitionen für AWS
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
- Tooling-Entscheidung treffen: Terraform vs. AWS SAM/CDK

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
# Backend
cd backend
uvicorn app.main:app --reload

# Frontend (separates Terminal)
cd frontend
npm install
npm run dev
```

Der Admin-Bereich liegt unter `/admin` (per Token geschützt).

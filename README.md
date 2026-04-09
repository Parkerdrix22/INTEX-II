# Kateri

A production web application protecting Native American women and girls from sexual
abuse and trafficking, built for the Lighthouse-inspired nonprofit as a joint
IS 413 / IS 414 / IS 455 case-competition project.

**Live site:** <https://kateri.byuisresearch.com>

Kateri is a full-stack, role-gated case-management and donor-engagement platform
backed by a nightly-retraining machine-learning pipeline. It is deployed to Azure
App Service, served over HTTPS on a custom domain, and retrains seven ML models
against the live PostgreSQL database every night without human intervention.

---

## What's in this repository

| Directory | Purpose |
|---|---|
| `backend/Lighthouse.API/` | .NET 10 Web API — EF Core, ASP.NET Identity, cookie auth, 16 controllers, ONNX Runtime inference |
| `frontend/` | React 19 + TypeScript + Vite SPA — 30+ pages, bilingual (English / Diné bizaad), dark mode, cookie-consent gated features |
| `is455/ml-pipelines/` | Seven ML pipelines: Jupyter notebooks, Python training scripts, ONNX model artifacts, shared utilities |
| `is455/` | IS 455 deliverables: data dictionary, EDA notebooks, `requirements.txt`, database documentation |
| `.github/workflows/` | CI (backend, frontend) + nightly ML retrain + Azure deploy |
| `Lighthouse.slnx` | .NET solution file |

---

## The three competition tracks

### IS 413 — Enterprise Application Development

A full-stack C# + React application:

- **.NET 10 Web API** with EF Core migrations, ASP.NET Identity, cookie-based
  authentication, Google OAuth external login, and role-based authorization
  (`Admin`, `Staff`, `Donor`).
- **16 REST controllers** covering residents, caseload, donors, donations, home
  visitations, process recordings, reports & analytics, donor churn, donor
  impact, donor archetypes, case resolution, social-media planning, and a chat
  assistant.
- **React 19 + TypeScript + Vite frontend** with 30+ pages, React Router, a
  custom `LanguageContext` for i18n, `ThemeContext` for dark mode, protected
  routes, and role-aware navigation.
- **PostgreSQL on AWS RDS** as the operational store, with the full Lighthouse
  operational schema (residents, supporters, donations, safehouses,
  health/wellbeing records, education records, incidents, interventions,
  home visitations, process recordings, social media posts, donation
  allocations).
- **Azure App Service Linux** hosting with a custom domain, HTTPS redirection,
  HSTS, CSP, and GitHub-Actions-driven deploys.

### IS 414 — Information Security

Defense-in-depth built directly into the stack:

- HTTPS enforced site-wide; HSTS in non-development environments
- Content-Security-Policy middleware on every response
- HttpOnly, Secure, SameSite=Lax session cookies with sliding expiration
- Password policy: 14-character minimum, uppercase + special required
- CORS locked to the configured frontend origin with credentials
- Role-gated controllers — analytics, ML inference, and admin endpoints
  require `[Authorize(Roles = "Admin,Staff")]`; donor-specific endpoints
  enforce ownership checks per-request
- All secrets managed via environment variables / Azure App Service
  configuration — nothing committed to the repository
- **Cookie-consent banner** that gates optional analytics and feature cookies
  (GDPR-style), storing user consent in a browser cookie so optional features
  can be toggled per-session
- Seeded admin account on first run via `Auth__SeedAdminEmail` /
  `Auth__SeedAdminPassword`

### IS 455 — Machine Learning

Seven production ML pipelines, all trained nightly against the live database,
exported as ONNX artifacts, served by the C# API, and rendered in the React
dashboard. Full pipeline documentation lives in
[`is455/ml-pipelines/README.md`](is455/ml-pipelines/README.md).

| # | Pipeline | Algorithm | Headline metric | Live page |
|---|---|---|---|---|
| 1 | Resident Risk Classification | RandomForest + SMOTE | CV ROC-AUC **0.87 ± 0.11** | `/resident-risk-triage` |
| 2 | Donor Churn Prediction | RandomForest + LR odds ratios | CV ROC-AUC **0.68 ± 0.19** | `/donor-churn` |
| 3 | Social Media Engagement | GradientBoostingRegressor + OLS | **R² = 0.76** | `/post-planner` |
| 5 | Donation Impact Attribution | OLS panel (1-month lag) | Health **Adj R² = 0.48** | `/donor-impact`, `/my-impact` |
| 6 | Case Resolution Readiness | LogisticRegression | CV ROC-AUC **0.78**, recall **0.65** | `/case-resolution` |
| 7 | Donor Archetype Clustering | K-means (k=4) | Silhouette **0.41** | `/donor-archetypes` |
| 8 | Need-Based Donation Routing | Deterministic weighted scoring | — (rule-based) | Built into donor flow |

Pipeline 4 (Safehouse Operations) was prototyped and honestly retired — it
couldn't beat the naive baseline, and we chose not to ship an underperforming
model. The removal is documented in the git history.

---

## Architecture

```
                         ┌──────────────────────────┐
                         │  AWS RDS PostgreSQL      │
                         │  (schema: lighthouse)    │
                         └────────────┬─────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
                ▼                     ▼                     ▼
      ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
      │ Nightly ML       │  │ .NET 10 Web API  │  │ EF Core          │
      │ retrain (GH      │  │ (Azure App       │  │ migrations       │
      │ Actions 02:00    │  │  Service Linux)  │  │                  │
      │ UTC)             │  │                  │  │                  │
      └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘
               │                     │
               │ commits ONNX        │ cookie auth + role gates
               │ back to main        │ ONNX Runtime inference
               ▼                     ▼
      ┌──────────────────┐  ┌──────────────────┐
      │ ml-pipelines/    │  │ React 19 + Vite  │
      │ models/*.onnx    │  │ (kateri.byui     │
      │ *_schema.json    │  │  sresearch.com)  │
      │ training_        │  │  i18n: en + nv   │
      │ metrics.json     │  │  dark mode       │
      └──────────────────┘  └──────────────────┘
```

- **Every commit to `main`** triggers the Azure deploy workflow, pushing both
  the .NET backend and the built React bundle to Azure App Service.
- **Every night at 02:00 UTC**, `ml_retrain.yml` runs `train_all.py`, which
  auto-discovers every `train_pipeline_*.py` script, pulls fresh data from
  Postgres, retrains, exports ONNX + JSON, runs an ONNX round-trip
  verification gate, and commits the updated models back to `main`. That
  commit then triggers the normal Azure deploy, so new models go live within
  about five minutes of the nightly run.

---

## Internationalization

The entire site is bilingual: **English** and **Diné bizaad (Navajo)**.

- `frontend/src/i18n/en.json` — authoritative English source
- `frontend/src/i18n/nv.json` — Navajo translations, generated via
  `frontend/scripts/translate-nv.mjs` (Claude API, idempotent, content-hashed)
- `LanguageContext.tsx` provides a `t(key)` hook and persists the user's
  language choice in `localStorage`
- The language toggle in the footer discloses that Navajo content is
  machine-generated and pending native-speaker review — an honesty signal
  we chose over silently shipping imperfect translations

Re-running the translation script is safe: only strings whose English source
has changed (content hash mismatch) are re-sent to Claude. Brand terms and
URLs pass through a denylist verbatim.

---

## Local development

### Prerequisites

- .NET SDK 10
- Node.js 22+
- Python 3.11+ (only needed if you intend to run ML training locally)
- PostgreSQL (local install or access to the AWS RDS instance)

### Environment configuration

Copy values from `.env.example` into your local environment or
`dotnet user-secrets`. Key variables:

| Variable | Purpose |
|---|---|
| `ConnectionStrings__DefaultConnection` | Postgres connection string |
| `FrontendUrl` | CORS origin for the SPA |
| `Auth__SeedAdminEmail` / `Auth__SeedAdminPassword` | Seeded admin on first run |
| `Authentication__Google__ClientId` / `...__ClientSecret` | Google OAuth (optional) |
| `VITE_API_BASE_URL` | Frontend API origin (optional; defaults to same-origin) |
| `PGHOST` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` / `PGPORT` | ML training DB creds |
| `ANTHROPIC_API_KEY` | Only for re-running the Navajo translation script |

### Run the backend

```bash
cd backend/Lighthouse.API
dotnet restore
dotnet build
dotnet run
```

Health probes: `GET /api/health`, `GET /api/health/db`.

### Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Default dev URL: <http://localhost:5173>.

### Run the ML pipelines

```bash
pip install -r is455/requirements.txt
python is455/ml-pipelines/scripts/train_all.py                  # all pipelines
python is455/ml-pipelines/scripts/train_all.py --pipeline pipeline_03  # one
```

Outputs land in `is455/ml-pipelines/models/`.

---

## Authentication endpoints

- `POST /api/auth/register` — create account (public)
- `POST /api/auth/login` — sign in (public)
- `POST /api/auth/logout` — sign out
- `GET  /api/auth/me` — current session
- `GET  /api/auth/providers` — list external providers
- `GET  /api/auth/external-login?provider=Google` — begin OAuth flow

---

## Key routes

**Public**

- `/` — bilingual landing page
- `/login`, `/signup`
- `/privacy-policy`, `/cookie-policy`

**Donor-facing**

- `/donor-dashboard`, `/my-impact`, `/supporter-donations`, `/safehouse-tour`

**Staff / Admin (role-gated)**

- `/admin-dashboard`, `/caseload-inventory`, `/resident-case/:id`
- `/resident-risk-triage` (Pipeline 1)
- `/donor-churn` (Pipeline 2)
- `/post-planner` (Pipeline 3)
- `/donor-impact` (Pipeline 5)
- `/case-resolution` (Pipeline 6)
- `/donor-archetypes` (Pipeline 7)
- `/donors-contributions`, `/home-visitation-case-conferences`,
  `/process-recording`, `/reports-analytics`

---

## CI/CD

| Workflow | Trigger | Purpose |
|---|---|---|
| `backend-ci.yml` | PR / push | .NET restore, build, test |
| `frontend-ci.yml` | PR / push | npm ci, lint, build |
| `ml_retrain.yml` | Cron 02:00 UTC + manual | Retrain all pipelines, commit models |
| `deploy.yml` | Push to `main` | Azure App Service deploy |

### Required GitHub secrets

| Secret | Purpose |
|---|---|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Backend deploy |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Frontend deploy (legacy — current deploy is App Service) |
| `PGHOST` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` / `PGPORT` | Nightly ML retrain |
| `GITHUB_TOKEN` | Auto-provided; used by retrain to commit models |

| Repository variable | Purpose |
|---|---|
| `AZURE_WEBAPP_NAME` | Target App Service name |

---

## Project stats (approx.)

- **30+** React pages, **16** API controllers, **7** ML pipelines
- **2** languages (English, Diné bizaad), **~1,000** translated UI strings
- **1** live production deployment on Azure with custom HTTPS domain
- **1** nightly model retrain that self-updates without human intervention
- Hundreds of commits across four teammates; see `git log --author=...` for
  per-contributor history

---

## Acknowledgements

This project exists because of the real operational data and domain expertise
shared by **Lighthouse Sanctuary Philippines**, whose model of trauma-informed
sanctuary for survivors of trafficking and sexual abuse inspired the Kateri
concept. The ML work honors their data by trying to surface it honestly — with
limitations stated out loud — rather than overclaiming what a handful of
dozens of records can actually tell us.

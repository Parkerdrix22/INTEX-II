# Lighthouse Scaffold (Phase 1)

This repository contains the phase-1 scaffold for the Lighthouse project:

- .NET 10 backend API
- React + TypeScript (Vite) frontend
- PostgreSQL EF Core operational schema placeholders
- Cookie-based auth placeholder flow (admin sign-in only)
- CI workflows and Azure deployment stubs

## Project Structure

- `backend/Lighthouse.API` - .NET 10 API, EF Core, auth endpoints, security middleware
- `frontend` - React app with route placeholders for IS413 pages
- `.github/workflows` - CI and deployment workflows

## Local Prerequisites

- .NET SDK 10
- Node.js 22+
- PostgreSQL (local or remote)

## Environment Configuration

Copy values from `.env.example` into your local environment/user-secrets.

Important keys:

- `ConnectionStrings__DefaultConnection`
- `FrontendUrl`
- `Auth__SeedAdminEmail`
- `Auth__SeedAdminPassword`
- `VITE_API_BASE_URL` (optional; defaults to same-origin/proxy)

## Run Locally

### Backend

```bash
cd backend/Lighthouse.API
dotnet restore
dotnet build
dotnet run
```

Backend health endpoints:

- `GET /api/health`
- `GET /api/health/db`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default dev URL:

- `http://localhost:5173`

## Authentication Placeholder

- Login endpoint: `POST /api/auth/login`
- Logout endpoint: `POST /api/auth/logout`
- Session endpoint: `GET /api/auth/me`

Use your configured `Auth__SeedAdminEmail` and `Auth__SeedAdminPassword`.

## Current Routes

Public routes:

- `/`
- `/login`

Protected blank placeholder routes:

- `/impact-dashboard`
- `/privacy-policy`
- `/cookie-policy`
- `/admin-dashboard`
- `/donors-contributions`
- `/caseload-inventory`
- `/process-recording`
- `/home-visitation-case-conferences`
- `/reports-analytics`

## Security Baseline Included

- HTTPS redirection in backend
- CSP header middleware on responses
- Cookie auth settings (HttpOnly, Secure, SameSite Lax, sliding expiration)
- CORS configured for frontend origin with credentials enabled
- Secrets managed by env vars (no credentials should be committed)

## Database Notes

- Initial EF migration is included in `backend/Lighthouse.API/Migrations`
- Entity tables are placeholders aligned with the CSV operational domains
- CSV import pipeline is intentionally deferred for later phases

## Azure Deployment Stubs

`deploy.yml` includes guarded jobs for:

- Azure App Service (backend)
- Azure Static Web Apps (frontend)

Set these before deployment:

- Repository variable: `AZURE_WEBAPP_NAME`
- Repository secret: `AZURE_WEBAPP_PUBLISH_PROFILE`
- Repository secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`

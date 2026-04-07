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
- `Authentication__Google__ClientId` (optional, for external sign-in)
- `Authentication__Google__ClientSecret` (optional, for external sign-in)
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

## Authentication

- Login endpoint: `POST /api/auth/login`
- Logout endpoint: `POST /api/auth/logout`
- Session endpoint: `GET /api/auth/me`
- Providers endpoint: `GET /api/auth/providers`
- External login endpoint: `GET /api/auth/external-login?provider=Google`

Use your configured `Auth__SeedAdminEmail` and `Auth__SeedAdminPassword`.

Password policy is enforced by ASP.NET Identity options:

- minimum length `14`
- uppercase required
- special character required

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
- HSTS in non-development environments
- CSP header middleware on responses
- Cookie auth settings (HttpOnly, Secure, SameSite Lax, sliding expiration)
- CORS configured for frontend origin with credentials enabled
- Secrets managed by env vars (no credentials should be committed)
- Cookie consent banner with browser cookie persistence

## Authorization Coverage

- Public auth/session endpoints: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
- Staff/admin restricted analytics: donor churn, donor impact model context, social media planner
- Donor impact detail endpoint enforces ownership checks for donor users

## Security Verification Checklist

- HTTP to HTTPS redirect is enabled and Azure `HTTPS Only` is turned on.
- Browser network inspector shows `Content-Security-Policy` header on app responses.
- Unauthenticated users can access public pages and cannot access protected API routes.
- Admin/staff can access analytics endpoints; donors only access authorized donor data.
- Cookie banner appears for new visitors and stores consent in browser cookie.

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

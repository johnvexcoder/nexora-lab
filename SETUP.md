# Nexora Lab development

For installation on a server, use [PRODUCTION.md](PRODUCTION.md). This document is for contributors.

## Prerequisites

Node.js 24 LTS and npm, Git, and Linux build tools for better-sqlite3 if no prebuilt binary is available (Python 3, make, C++ compiler). Windows/macOS development may work but are not validated deployment targets. Docker Engine with Compose v2 is needed for container acceptance testing.

```sh
npm ci
cp .env.example backend/.env
```

For local development, edit `backend/.env`: `DEPLOYMENT_PROFILE=development`, `MOCK_MODE=true`, `CORS_ORIGIN=http://localhost:5173`, `DATA_DIR=./data`. Leave `DEMO_RESET_ADMIN=false` for a private, randomly generated administrator password. `npm run dev` starts the backend on 4000 and the frontend on 5173. Read the initial password from `backend/data/.admin-initial-password`; it is not logged. The development profile permits simulation; an explicitly disposable demo can opt into `DEMO_RESET_ADMIN=true`, which resets the demo administrator on every boot.

```sh
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

`backend/src` contains Express routes, authentication, SQLite, providers, telemetry, and the recovery CLI. `frontend/src` contains React UI, query/state stores, and branding. API requests use `/api`; WebSockets use `/ws`. The production nginx container routes both to the backend. No external font request is required.

Configuration is read once at process startup. Restart after editing environment variables. Never point a development or test process at production data. Tests create temporary databases and local HTTP servers; allow local socket binding in restricted environments.

The lockfile is authoritative: use `npm ci`, not a fallback `npm install`. Container base images remain tracked release tags; record their resolved digests during release qualification. Rebuilding a tag after an upstream base update is not guaranteed to produce identical bytes.

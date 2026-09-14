# HomeLab OS — Production-Readiness Review

**Scope:** `apps/` reviewed against the HomeLab OS mono-repo (`Server-Dashboard` / HomeLab OS) and the companion HomeLab Agent (`Server-Agent`).
**Date:** 2026-09-02 · **Live data verified on:** `http://dashboard.homelab.arpa:3000/api`
**Status:** Well-architected and genuinely functional, but **not yet production-clean**. The platform is live in real mode (Proxmox + Docker provider), fetching real telemetry, so these recommendations are hardening steps, not a rewrite.

> **A note on the live check.** I verified the running instance directly:
> - `/api/health` → `"status":"ok"`, `mockMode:false`, `provider:"proxmox + docker"`, `lastPollError:null`
> - `/api/servers` → 3 hosts (pve0, plus two more), real uptime/CPU/RAM/disk, health `100`, load low
> - `/api/health/global` → score `100`, 3/3 online, `activeAlerts:0`
> - `/api/stats` → 3 Nodes, 2 VMs + 8 CTs, avg CPU `6.1%`, RAM `62.7%`
> - `/api/network` → 13 nodes, 12 links
> - `/api/docker/containers` → real containers incl. `homelab-frontend`, `homelab-backend`, `jellyfin01/02`
>
> The system is currently healthy. The items below are about making that deployment **safe, observable, and repeatable** — not fixing a broken thing.

---

## 1. Summary

| Dimension | Grade | Verdict |
|-----------|-------|---------|
| Architecture | A | Clean provider abstraction, capability-based agent model, unified WS+history pipeline |
| Security | B− | Real scrypt, RBAC, 2FA, CSRF, rate-limiting, AES-at-rest — undone by root containers, plaintext-HTTP wiring, weak key derivation, open health endpoint |
| Observability | C+ | Zero structured/request logging, no log aggregation, minimal error handler |
| Reliability | B− | No retry/backoff on the telemetry channel, no alerting on failure, no health-driven restarts of consumers |
| Testing | C | Backend has a solid `node:test` suite; agent has **zero tests**; no frontend tests; WS/auth/agent gaps |
| Deploy | C+ | Non-root gap in both images, R/W Docker socket + host-root mounts, backend on `network_mode: host` |
| Maintainability | B | No migration framework, duplicate agent CRUD, scattered `as any`, dead config (`POLL_INTERVAL`) |

**Bottom line:** Hardening patches (roughly 6 focused, medium-sized changes) would take this from "great homelab tool" to "defensible production observability platform." None of the issues require a redesign.

---

## 2. Verified live data & what it tells us

Observed on `dashboard.homelab.arpa` (see above). Key takeaways:

- **The live provider path works end-to-end.** Proxmox discovery, Docker container enumeration, WS telemetry, and history seeding (`bootStats.historySeeded:true`, 121k points) are all functioning.
- **No active degradation.** `endpointErrors:{}` and `activeAlerts:0`.
- **Alert hygiene needs attention.** The feed shows a `Server Online` / `Server Offline` flap pair for `pve-pve0` (severity `success` then `critical`, both unread). Offline/online flap detection and de-duplication should be tuned so a noisy host doesn't page you (see §5.5).
- **All 3 nodes report health 100 with `lastSeen` fresh** — the data path is live, so we are hardening a *working* system.

---

## 3. Critical security issues (fix first)

### 3.1 Containers run as root / excessive privileges
- **Backend runs as root** — no `USER` directive in `backend/Dockerfile`.
- **Agent image runs as root** (`Server-Agent/Dockerfile:18` `USER root`) and `docker-compose.yml` mounts **host root** (`/:/host:ro,rslave`) **and** the **Docker socket** (`/var/run/docker.sock` R/W on backend, `:ro` on agent).
- **Backend uses `network_mode: host`** (`docker-compose.yml:8`), so it binds directly on the host with no firewall isolation.

**Why it matters:** root + Docker socket = `docker`-group-equivalent host takeover if the WebSocket/HTTP surface is ever exploited. Host networking removes the container-boundary benefit entirely.

**Fix:**
```dockerfile
# backend/Dockerfile and agent Dockerfile
RUN addgroup -S app && adduser -S -G app app
USER app
```
- Backend compose: drop `network_mode: host`; publish only needed ports and rely on nginx for `/api` + `/ws`.
- Mount the Docker socket **read-only** everywhere (`:ro`), and run Docker introspection via a separately-scoped helper if write access is ever truly needed (it is not for telemetry).
- The agent needs host access for SMART/sensors only on hosts where those collectors run; scope the mounts to host+profiles that genuinely require them rather than mounting `/` globally.

### 3.2 API key / secrets in plaintext over HTTP (agent)
`Server-Agent` ships `docker-compose.yml:8` with a plain `http://192.168.1.31:4000/api` and does **not enforce TLS** (`api.ts:20-21`, `config.ts:33-38` warn-but-proceed). The agent API key is sent in the `X-Agent-Key` header on every request.

**Fix:**
- Require `https://` (or localhost) for `DASHBOARD_URL` in non-local setups; refuse to start on plain HTTP when the host is not loopback.
- Terminate TLS at the dashboard reverse proxy and set `COOKIE_SECURE=true` + `NODE_ENV=production` (see §4.1).
- Consider key rotation with a live reload path (see §5.7).

### 3.3 Weak `SECRET_ENCRYPTION_KEY` derivation
`security/secrets.ts:42-45` silently **zero-pads** keys shorter than 16 bytes before deriving a SHA-256 key. A short/guessable key yields a recoverable key.

**Fix:** Enforce ≥32 random characters at startup; refuse to boot (or loudly warn) if `SECRET_ENCRYPTION_KEY` is missing or short. Generate with `openssl rand -base64 48`.

### 3.4 SMTP TLS validation disabled
`smtp.ts:87,103` set `rejectUnauthorized:false`. For a service that ships OTP / recovery codes by email, that is a credential-phishing vector on the wire.

**Fix:** Validate TLS by default; only allow disabling via an explicit opt-in env var scoped to labs where a self-signed relay is known.

### 3.5 Open / low-sensitivity endpoints leak internals
`GET /api/health` (`routes/index.ts:30`) returns `mockMode`, `provider`, `lastPollError`, and docker socket path unauthenticated; `GET /api/admin/mode` is also unauthenticated. Minor, but avoid advertising stack internals.

**Fix:** Keep `/api/ping` trivial; for `/api/health`, gate provider internals (`lastPollError`, socket path) behind auth or strip them from the public response; keep a coarse `status:ok` for load-balancer probes.

### 3.6 Hardcoded demo admin in mock mode
`security/boot.ts:27-35` force-sets the well-known `homelab-demo` password whenever `MOCK_MODE=true` or an admin already exists at boot. Anyone who deploys with `MOCK_MODE=true` unknowingly runs a known-credential admin.

**Fix:** Only seed the demo admin on a **fresh database that has never had an admin**. Never overwrite an existing admin password at boot.

---

## 4. Configuration & deployment hardening

### 4.1 TLS / cookies / reverse proxy
- Verify the frontend nginx container is reached only via a TLS-terminating proxy and that the SPA + `/api` + `/ws` are proxied correctly (already done per README; confirm in the live deployment).
- Set `NODE_ENV=production` **and** `COOKIE_SECURE=true` together so the `homelab_session` cookie is only ever sent over HTTPS (`session.ts:68-77` — `Secure` is off by default).
- Add `proxy_set_header X-Forwarded-Proto https;` (already in the docs) and confirm `app.set('trust proxy', 1)` is respected.

### 4.2 Health checks
- Backend **compose** healthcheck exists (`docker-compose.yml:30-35`) but the **Dockerfile** has no `HEALTHCHECK`. Put one in the image so `docker run` without compose is also guarded.
- The agent has **no healthcheck**; add a `HEALTHCHECK` that verifies the process is alive and that its last report to the dashboard was recent (or at least that the event loop is responsive).

### 4.3 Pin images & rebuild strategy
- Use immutable tags/digests (`node:20-alpine@sha256:...`, `nginx:1.27-alpine@sha256:...`) for reproducible builds.
- Keep the SQLite migration story explicit (§5.8). On upgrade, back up `DATA_DIR` before `docker compose up --build -d`.

### 4.4 Backend dependency pruning
`backend/Dockerfile:14` copies the full `node_modules` (including dev deps) into runtime. Switch to `npm ci --omit=dev` (or a prod-only install) to shrink the image and reduce attack surface.

---

## 5. Reliability & observability

### 5.1 Structured logging
There is **no structured logging** (only `console.log` with `[homelab]` prefixes) and **no request-logging middleware**. Add one structured logger (pino or winston JSON) with:
- request IDs (`crypto.randomUUID()` per request),
- correlation across WS + REST,
- outbound to stdout so Docker can scrape/forward it (vector/loki/filebeat).

### 5.2 Central error handling that does not leak internals
The global handler (`app.ts:55-61`) returns `err.message` to clients. Make it return a generic code/message and log the detail server-side with the request ID.

### 5.3 Async error handling
Express 4 does not catch rejected promises. Wrap routes (or add an `asyncHandler`) so every route handles rejection uniformly — several handlers rely on throw-through and a few are missing try/catch (`admin/routes.ts:472 testIntegration`).

### 5.4 Rate limiting globally
Current custom limiter (`security/rateLimit.ts`) guards login/sensitive actions only. Add a global per-IP cap on public endpoints (behind `trust proxy`) to blunt scraping and abuse, keeping strict limits on auth and admin mutations.

### 5.5 Alert flap detection & de-duplication
The live feed shows a host offline/online flap pair. Add flap suppression (ignore offline→online within N seconds), hysteresis, and a "still down after M minutes" escalation so transient blips don't spam the event timeline.

### 5.6 Retry/backoff on the agent telemetry channel
`Server-Agent` logs and retries next tick with **no exponential backoff** (`api.ts:48-58`), flooding logs during an outage. Add capped exponential backoff + jitter, a "backoff circuit" that reduces log noise, and a health endpoint the dashboard can poll to know the agent is still connected.

### 5.7 Agent key rotation without restart
The agent reads `API_KEY` once at startup (`config.ts:27`); rotating from the dashboard claims to work but requires a restart. Add a periodic key reload (e.g., re-read the key file/socket each report cycle or on a signal) so rotation is live.

### 5.8 Migration strategy
Migrations are ad-hoc `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` (`db/database.ts:69-265`). Introduce a versioned migration table + ordered migration scripts so schema changes are reproducible and reversible, and run a pre-boost backup automatically.

### 5.9 Pagination on admin lists
Several admin endpoints return unbounded lists (`admin/routes.ts:193 users`, `:368 snapshots`, `:410 integrations`, `:484 backups`, `:571 agents`). Add `limit/offset` (with sane defaults) and cursor support where cardinality can grow.

---

## 6. Testing

- **Backend (`Server-Dashboard/backend/src/test/`)** already has a strong `node:test` suite (security, docker provider, proxmox resilience, dispatch) — great foundation. **Add:** WS auth tests, the open `/api/health`/`/api/ping`/`/api/admin/mode` endpoints, the SMTP client, and agent auth (`/register`,`/report`,`/events`,`rotate-key`).
- **Agent (`Server-Agent`):** add a test suite (there are **zero tests**). Cover config validation, plugin isolation, capability→plugin routing, shell-parsing helpers, and the HTTP reporting path (mock the dashboard).
- **Frontend:** no tests exist. Start with smoke tests for the dashboard, settings, and the auth flows.
- Add CI (GitHub Actions) running `typecheck` + `lint` + `test` + a **Docker build** on every PR. There is currently no linting at all (root `lint` only typechecks the frontend).
- Get a clean `tsc` with `strict` and start removing the `as any` casts (19 in agent, 18 in backend) that undermine it.

---

## 7. Code-quality & hardening checklist

- [ ] Drop privileges on both images (`USER app`); remove R/W Docker socket & host-root mounts; drop `network_mode: host`.
- [ ] Enforce TLS for the agent ↔ dashboard link; enforce strong `SECRET_ENCRYPTION_KEY`.
- [ ] `COOKIE_SECURE=true` in production; verify reverse-proxy forwards `X-Forwarded-Proto`.
- [ ] Request + structured logging; central non-leaking error handler; async wrapper.
- [ ] Global rate limiting; keep auth limits strict.
- [ ] Alert flap suppression + escalation.
- [ ] Agent retry/backoff + live key rotation + healthcheck.
- [ ] Versioned migrations + pre-boost backup.
- [ ] Pagination on admin lists.
- [ ] Add tests (agent especially) + CI running typecheck/lint/test/build.
- [ ] Pin image digests; prune dev deps from runtime images.
- [ ] Remove demo-admin force-overwrite; keep it fresh-DB-only.

---

## 8. Priority sequence (if implementing)

**Phase 1 — Security (do not run unhardened in the open):**
1. Non-root containers + least-privilege mounts + remove host networking.
2. Enforce TLS + strong `SECRET_ENCRYPTION_KEY` + `COOKIE_SECURE`.
3. Remove demo-admin boot overwrite; gate `/api/health` internals.

**Phase 2 — Reliability & ops:**
4. Structured/request logging + non-leaking error handler + async wrapper.
5. Agent retry/backoff + live key rotation + agent healthcheck.
6. Alert flap suppression; add image `HEALTHCHECK`s.

**Phase 3 — Maintainability:**
7. Versioned migrations; admin pagination; dedupe agent CRUD.
8. Tests (agent from zero; backend gaps) + CI on typecheck/lint/test/build.

---

## 9. What is already production-grade (keep it)

- **Authentication core:** DB-backed sessions with hashed tokens, scrypt password hashing with per-user salt, constant-time compare.
- **Real 2FA:** TOTP + email OTP + recovery codes + security questions, with attempt caps and TTLs.
- **Server-side RBAC** enforced on every route; guest mode is scoped and opt-in.
- **CSRF double-submit** + read-only/safe/emergency-lock enforcement server-side.
- **AES-256-GCM encryption at rest** for integration secrets, masked on API reads, with `dashboardctl rotate-secrets`.
- **WS authentication** (`verifyClient` requires session or guest), sensor data stripped per feature flag server-side.
- **WAL checkpointing + online backup + restore tooling** via `dashboardctl`, plus hourly TTL prune.
- **Plugin isolation** in the agent (a crashing plugin does not take down the agent) and a shared metric cache avoiding duplicate system calls.

These strengths mean the fixes are surgical, not architectural.

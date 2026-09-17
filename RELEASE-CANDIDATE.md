# Nexora — Release Candidate Report

Status: release candidate (TASK-042)
Branch: `nexora/redesign`
Package version: 1.0.17

## Verification (all pass on this working tree)

### Backend (`backend/`)

| Check | Result |
|-------|--------|
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm test` | 131/131 pass |

### Frontend (`frontend/`)

| Check | Result |
|-------|--------|
| `npm run typecheck` | pass |
| `npm run build` | pass (Vite production build) |

## Cross-repository compatibility

- Consumes the shared Core↔Agent protocol: v0 implicit and the v1 envelope, unwrapped by
  the adapter in `backend/src/routes/agent.ts` and routed through the existing handlers;
  v0 messages log a one-time deprecation warning during migration.
- End-to-end agent integration covered by `backend/src/test/agentTelemetry.test.ts`
  (registration, `X-Agent-Key` auth, capabilities, telemetry, events, missing-data,
  heartbeat-check, and the v1 envelope path).

## Security posture

- Agents authenticate with an `hl_…` `X-Agent-Key`, stored only as a SHA-256 hash; a
  missing/unknown key is rejected 401. Identity mismatch on events is rejected 403.
- Admin agent endpoints enforce session auth + RBAC (`settings.view` / `settings.manage`);
  `/api/agent/` agent-facing endpoints are CSRF-exempt by design and require the API key.
- Parameterized SQL throughout; no agent-facing response exposes a secret.

## Known issues / limitations

- v1 registration records the agent software version from the payload (falls back to
  `1.0.0`) because the version also lives at the envelope level; the displayed version may
  be inaccurate for v1-registered agents until this is aligned (minor, cosmetic).
- The `report` handler logs unexpected errors via `console.error`; a structured logger is a
  future improvement (no secrets are emitted).
- Remaining `homelab-*` identifiers (DB filename, `homelab_session` cookie, SMTP EHLO,
  log file, test fixtures) are intentional compatibility identifiers, not stale branding;
  they are preserved so existing deployments and sessions keep working.

## Release-candidate gate

The README's release gate calls for a clean-host acceptance run (install, container
permissions, HTTPS, upgrade, disaster recovery) before certifying a production deployment.
Passing unit tests does not certify production. This report documents the current
working-tree state only.

## Not done (by policy)

- No push, merge, tag, deploy, or production-infrastructure changes.
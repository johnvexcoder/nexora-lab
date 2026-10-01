# Nexora Lab release acceptance checklist

This checklist applies to the reviewed Nexora Lab and Nexora Agent revisions together. The current release candidate is **not production certified** until every required check below has been performed on a clean supported host and its result recorded. Use disposable test data for upgrade, restore, and rollback exercises. Do not test destructive recovery against a production volume.

Record the Core and Agent commit IDs, image digests, host OS and architecture, Docker Engine and Compose versions, date, tester, and the location of private evidence. Keep credentials, keys, database exports, and full logs out of this document.

Local preflight on 2026-09-27: Core lint, typecheck, backend and frontend tests, and production build passed after the UI fixes. Agent lint, typecheck, 59 tests, and an isolated TypeScript build passed. Rootless Podman built all three images from their Dockerfiles: Core frontend `1b02b6f3f4a7`, Core backend `e21ae601711d`, and Agent `ef83e4534718`. The backend's SQLite dependency and Agent's runtime dependency loaded in temporary containers. Nginx configuration passed with the expected `backend` hostname supplied. Podman ignored Dockerfile health checks in its default OCI format, so health behavior remains unverified. The recent Core and Agent changes remain uncommitted. Docker Engine and Compose are unavailable on this Fedora workstation; Compose and clean-host gates remain open. These local results do not certify a production deployment.

| Gate | Acceptance evidence | Result |
| --- | --- | --- |
| Source and build | Reviewed Core and Agent commits are fixed; both working trees are clean; lint, typecheck, tests, and production builds pass; `docker compose config --quiet` and a fresh Compose build pass on the target architecture. | Not run |
| Clean Core install | A new dedicated data volume starts without permission errors; health and authenticated readiness endpoints respond; administrator setup, login, logout, and restart work; mock mode is off. | Not run |
| Browser and HTTPS | Dashboard and Network Map load through the intended HTTPS origin; WebSocket live updates reconnect after a brief outage; secure cookies, CORS, and restricted network exposure are verified. | Not run |
| Agent install and pairing | Install the Agent on a supported clean Linux host using a root-readable key file and reviewed release; registration, heartbeat, telemetry, and capability reporting appear in Core. | Not run |
| Agent failure recovery | Temporarily disconnect the test Agent from Core; verify bounded retry, event queue persistence across Agent restart, and delivery after reconnection; rotate its key and confirm the old key is rejected. | Not run |
| Optional collectors | On hosts where enabled, verify Proxmox, Docker, SMART, sensors, and network data against the source. Confirm unavailable metrics are marked unavailable, not measured as zero. Check Agent CPU and I/O load under the chosen polling interval. | Not run |
| Backup and restore | Create and export a consistent database backup and matching encryption key; restore them to a separate disposable stack; verify login, settings, agent keys, telemetry, and a fresh backup. | Not run |
| Upgrade and rollback | Upgrade a disposable copy of a prior supported release, including its data; verify application behavior and schema. Restore the prior database **and matching key** when testing rollback; do not rely on image rollback alone. | Not run |
| Security and exposure | Confirm only intended frontend/proxy ports are reachable, backend port 4000 and Docker sockets are not exposed, secrets are absent from logs/artifacts, and administrator/Agent RBAC and key rejection work. | Not run |
| Final review | Record deviations and known issues, approve the exact Core and Agent commits/images, and retain the recovery procedure and backup evidence before tagging or deployment. | Not run |

Follow [Core production operations](PRODUCTION.md) and the reviewed Agent `PRODUCTION.md` for commands and expected configuration. A passing unit suite or a mock browser preview does not replace these host-level checks.

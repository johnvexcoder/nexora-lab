# Nexora installation and operations

## Support and release status

Target: a single Linux host with Docker Engine and Compose v2 (`docker compose`), on x86-64 or ARM64. Debian/Ubuntu with systemd are the primary clean-host acceptance targets. ARM64, SELinux hosts and rootless Docker need their own acceptance run before support is claimed. Docker Desktop is useful for development but does not make macOS/Windows hosts supported telemetry targets. Allow roughly 2 GB RAM and 5 GB free disk for an initial small installation, then size storage for telemetry retention and backups.

Install Git, OpenSSL, curl, Docker Engine and its Compose plugin using your distribution/provider instructions. Verify `docker version`, `docker compose version`, available disk and clock synchronization. Access to Docker is effectively administrator access to the host. Native Node is not needed for Compose builds. Builds require access to the npm and container registries.

This candidate has **not** passed the full clean-host release gate. Use [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) before promoting a tag. There are no assumed prepublished Nexora container images.

## Clean installation

Use an actual reviewed release tag; `YOUR_REVIEWED_TAG` is a placeholder, not a published release. The old GitHub URL remains the clone URL until the owner performs the repository rename.

```sh
git clone https://github.com/johnvexcoder/HomeLab-OS.git Nexora
cd Nexora
git fetch --tags
git checkout YOUR_REVIEWED_TAG
cp .env.example .env
chmod 600 .env
openssl rand -base64 48
```

Copy the generated value into `SECRET_ENCRYPTION_KEY`. Keep it with your off-host backup secrets. Configure:

```dotenv
DEPLOYMENT_PROFILE=lan
MOCK_MODE=false
DEMO_RESET_ADMIN=false
DASHBOARD_BIND_ADDRESS=127.0.0.1
DASHBOARD_PORT=3000
CORS_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
DOCKER_ENABLED=false
SECRET_ENCRYPTION_KEY=YOUR_GENERATED_RANDOM_VALUE
ADMIN_INITIAL_PASSWORD=
NEXORA_DATA_VOLUME=homelab-os_homelab-data
```

Do not leave the literal key placeholder in place. An empty initial password creates a random password in `/data/.admin-initial-password`. Alternatively set a unique initial password of at least 10 characters. Existing accounts are never overwritten unless the development-only disposable demo reset is explicitly selected. Environment configuration changes require container recreation.

```sh
docker compose config --quiet
docker compose build --pull
docker compose up -d --wait
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
docker compose exec backend cat /data/.admin-initial-password
```

Visit `http://localhost:3000` on the host, or use an SSH tunnel from your workstation (`ssh -L 3000:127.0.0.1:3000 USER@HOST`). Sign in as `admin`, change the password under account settings, enable TOTP, and store recovery codes securely. Then remove the initial credential file:

```sh
docker compose exec backend rm -f /data/.admin-initial-password
```

If you supplied `ADMIN_INITIAL_PASSWORD`, remove it from `.env` and recreate the backend after the first login. Keep guest access disabled unless intentionally sharing read-only telemetry.

## Trusted LAN access

Set `DASHBOARD_BIND_ADDRESS` to the host's management-LAN address and `CORS_ORIGIN` to the exact browser origin, for example `http://192.168.50.10:3000`. Recreate with `docker compose up -d`. Multiple allowed origins can be comma separated. This also governs browser WebSocket origins.

Permit TCP/3000 only from your trusted management subnet. Do not router-forward it or expose backend port 4000. Docker-published ports can bypass simple host firewall rules: enforce filtering using Docker-aware firewall rules and/or an upstream management-VLAN firewall, and test reachability from an untrusted host. HTTP exposes passwords and agent credentials to observers on that network; use HTTPS where possible.

## Pair a monitored host

1. In Settings → Agents, create an agent for the host and save its full one-time API key. A displayed prefix is not a usable key.
2. Follow [Nexora Agent's production guide](https://github.com/johnvexcoder/HomeLab-Agent/blob/main/PRODUCTION.md) from the reviewed Agent tag. Set `DASHBOARD_URL=https://YOUR_HOST/api` (or `http://LAN_IP:3000/api` with `ALLOW_INSECURE_HTTP=true` for trusted LAN HTTP). Port 4000 is private in Compose.
3. Confirm registration and fresh metrics in both the Agent logs and dashboard. Authorize the Agent's optional Docker socket override only on Docker hosts. Do not mount a socket into the dashboard.
4. Rotate the key in Settings when needed and replace the Agent key file. Native agents reload the key per request. For Compose file secrets, recreate the Agent after replacing the host file so the bind mount sees the new file.

Optional direct Proxmox polling needs all of `PROXMOX_HOST`, `PROXMOX_TOKEN_ID`, and `PROXMOX_TOKEN_SECRET`; use a read-only monitoring token and trusted TLS certificates. `PROXMOX_VERIFY_TLS=true` is the default. Import your private CA using an explicit trust bundle if needed. Agent-only operation is valid; an empty dashboard before pairing is expected.

## Optional HTTPS and internet exposure

Prefer a VPN. For direct HTTPS exposure, put a maintained reverse proxy on the same host, bind Nexora to loopback, and configure a real DNS name. For example a host-installed Caddy configuration:

```caddyfile
nexora.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Replace the hostname with your own and arrange certificate issuance. Caddy handles WebSocket upgrades. Other proxies must forward `/`, `/api/`, and `/ws`, preserve Host, and support WebSocket upgrades with a long read timeout. A proxy in another container cannot use its own loopback to reach Nexora: use an explicitly configured private network instead.

Set `DEPLOYMENT_PROFILE=hardened`, `COOKIE_SECURE=true`, `CORS_ORIGIN=https://nexora.example.com`, `MOCK_MODE=false`, a 32+ character random encryption key, and verified Proxmox TLS. Recreate the containers. Permit only the proxy's TCP/443 (and TCP/80 if required for certificate issuance) externally. Keep 3000/4000 unreachable externally. Test HTTPS login, Secure cookies, logout, WebSocket updates, and agent pairing through the real proxy. Do not publish until these checks pass. Public `/api/health` is coarse liveness, not confirmation that every monitored host is reachable; authenticated `/api/diagnostics` provides provider detail.

## Backups

Use the online backup API/UI or CLI to create a consistent SQLite snapshot:

```sh
docker compose exec backend node dist/cli/dashboardctl.js backup
```

The CLI prints a file such as `/data/backups/nexora-...db`. Copy that specific file and its `.manifest.json` off-host:

```sh
mkdir -m 700 -p backup-export
docker compose cp backend:/data/backups/ACTUAL_BACKUP.db backup-export/
docker compose cp backend:/data/backups/ACTUAL_BACKUP.db.manifest.json backup-export/
cp .env backup-export/deployment.env
chmod -R go-rwx backup-export
```

If using a generated encryption key, also copy `/data/secrets.key`. Backups contain password hashes, sessions, settings, and encrypted credentials: encrypt the export using your backup system and restrict access. The manifest is not a replacement for the encryption key. Copying a live `homelab.db` file alone is not a safe SQLite/WAL backup. Manual backups are retained indefinitely; automatic daily/weekly/monthly retention is configured in Settings. Check free space and backup delivery separately from container health.

## Restore and disaster recovery

Restore is deliberately offline; the web restore operation returns `offline_restore_required`. Stop all writers first, including other containers/processes using this volume. Keep the old database and its exact encryption key together until recovery is verified.

```sh
docker compose stop frontend backend
# Place the backup in the mounted volume using a one-off stopped-stack service.
docker compose run --rm --no-deps -v "$PWD/backup-export:/restore:ro" backend \
  node dist/cli/dashboardctl.js restore /restore/ACTUAL_BACKUP.db
docker compose run --rm --no-deps backend node dist/cli/dashboardctl.js verify-db
docker compose up -d --wait
```

For total host loss, check out the same release, restore `deployment.env` as `.env` with mode 600, build, and restore the database as above. Restore the exact `SECRET_ENCRYPTION_KEY`, or restore `secrets.key` to `/data/secrets.key` with owner 1000:1000 and mode 600 before starting. Restoring a newer schema into older code is not supported. The CLI retains a `.pre-restore-*` database in the volume; the supplied backup must pass SQLite integrity and Nexora table checks. Verify administrator login, settings, integrations, agent keys, telemetry and backup creation after restoration. Restored sessions/keys may become valid again; revoke sessions and rotate agent keys if recovering from compromise.

## Upgrade and rollback

1. Export a backup and its key; record `git describe --tags --always`, `docker compose images`, `.env`, Compose overrides and the volume name. Keep the previous source tag and images.
2. Read the release notes, including schema changes and [MIGRATION.md](MIGRATION.md). Stop the stack before switching tags.
3. Check out the reviewed new tag, validate configuration, build, and start:

```sh
docker compose stop
git fetch --tags
git checkout YOUR_REVIEWED_NEW_TAG
docker compose config --quiet
docker compose build --pull
docker compose up -d --wait
```

4. Verify login, agent telemetry, restart durability and a new backup. If verification fails, stop the stack, check out the previous tag, restore its pre-upgrade database **and matching encryption key**, and start the retained previous images (or rebuild that tag if necessary). SQLite schema migration is forward-only; changing the image alone is not a data rollback. Do not delete volumes during an upgrade.

## Troubleshooting and recovery

- **Volume-permission failure:** the backend runs as UID/GID 1000. Fresh Docker volumes inherit image ownership; old root-owned volumes or bind mounts may not. With the backend stopped and a backup retained, repair only its data mount:

  ```sh
  docker compose stop backend
  docker compose run --rm --no-deps --user 0 --cap-add CHOWN --cap-add DAC_OVERRIDE backend \
    sh -c 'chown -R 1000:1000 /data && chmod 700 /data'
  docker compose up -d --wait
  ```

  If using SELinux, diagnose labels and choose an appropriately labeled dedicated data directory; do not disable SELinux globally. Never apply recursive ownership changes to the host root or Docker socket.
- **No Docker data:** leave `DOCKER_ENABLED=false` on the dashboard. Check the Agent's optional socket mount and socket group. A read-only socket mount still grants daemon authority; use only on trusted hosts.
- **Provider callback startup failure:** current CompositeProvider permits missing optional notification hooks. Rebuild the backend image and verify the running image matches the reviewed source.
- **Login works but live updates fail:** confirm the exact `CORS_ORIGIN`, `/ws` proxy upgrade, and valid session. Revoked sessions are disconnected on the next broadcast. Secure cookies require HTTPS.
- **Agent 401/404:** 401 means missing/revoked key; 404 often means a missing `/api` suffix or wrong port. Do not use a key prefix. Check host clock and logs.
- **Readiness or disk failure:** `docker compose logs --tail=100 backend frontend`; do not paste logs containing secrets publicly. Check disk space, volume ownership and `/api/diagnostics` after authenticating.
- **Forgotten administrator:** stop the backend and run `docker compose run --rm --no-deps backend node dist/cli/dashboardctl.js reset-admin`. Save its one-time output securely; restart. Other CLI commands include `status`, `verify-db`, `recovery`, `repair-db`, and `emergency-unlock`.
- **Encryption keys:** never change an existing environment key directly. Environment-key rotation is intentionally refused rather than silently damaging stored secrets; retain it during this rename. Offline file-key rotation (`rotate-secrets`) creates a pre-rotation database backup and keeps `secrets.key.previous`/`secrets.key.next` for interrupted-operation recovery. Stop the backend first, preserve the old DB/key, and after interruption restore that pair rather than guessing which key belongs to which database.

## Uninstall

`docker compose down` removes the application containers/network and preserves data. Archive the volume and keys before removing a deployment directory. Permanent deletion is a separate intentional operation: identify the exact volume using `docker volume inspect`, then remove only that volume after confirming your backups. Reinstall using the same volume/key to recover. Revoke agent keys or stop agents when retiring the dashboard.

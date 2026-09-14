<p align="center"><img src="frontend/public/branding/nexora-detailed-320.png" width="160" alt="Nexora"></p>

# Nexora

A self-hosted infrastructure dashboard for a homelab: live host metrics, Proxmox guests, Docker workloads, network topology, alerts, and administrator controls. Nexora Agent collects telemetry on each monitored Linux host.

**Release status:** release candidate work; clean-host installation, container permissions, HTTPS, upgrade, and disaster recovery still require the acceptance run in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). Passing unit tests does not certify a production deployment.

## Start here

- [Production installation, pairing, backup, restore, and recovery](PRODUCTION.md)
- [Development setup and architecture](SETUP.md)
- [Migration from HomeLab OS and GitHub rename preparation](MIGRATION.md)
- [Changes](CHANGELOG.md) · [Validation evidence](VALIDATION.md)
- [Contributing](CONTRIBUTING.md) · [Security reporting](SECURITY.md) · [GPL-3.0-or-later license](LICENSE)

The dashboard and [Nexora Agent](https://github.com/johnvexcoder/HomeLab-Agent) remain independent repositories. The dashboard's existing remote is [HomeLab-OS](https://github.com/johnvexcoder/HomeLab-OS); `Nexora` is its planned repository name. No remote rename or published Nexora image is assumed by the installation instructions.

## What it does

- React dashboard with real-time WebSocket updates, history charts, alerts and topology.
- Agent telemetry, plus optional direct Proxmox API integration.
- Local administrator bootstrap, role-based permissions, sessions, TOTP and recovery tools.
- SQLite persistence, online database backups, configuration snapshots, and offline recovery CLI.
- Optional SMTP and notification integrations configured through the administrator UI.

Use a trusted management LAN or an HTTPS reverse proxy. Nexora is a single-host application, not a high-availability control plane. Telemetry requires compatible host tools and permissions; the default Agent intentionally cannot access the Docker daemon or raw disks.

The approved Nexora logos are included unchanged: the core mark appears in compact navigation and browser placements, and the detailed mark in larger branding. Existing persisted names such as `homelab.db` are compatibility identifiers, not incomplete branding.

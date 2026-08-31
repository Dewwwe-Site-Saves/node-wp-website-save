# Plan : WP Backup Manager

## Current: Phase 3 — Web app (Next.js + SQLite)

> The CLI (`index.js`) stays functional and independent. The web app is a second consumer
> of the same `lib/backup.js` module. You can use the CLI without starting the web server.

### Stack
- Next.js (App Router) + TypeScript
- SQLite via better-sqlite3
- shadcn/ui + Tailwind CSS
- node-cron for scheduled backups
- Shared modules (`lib/backup.js`, `lib/ftp.js`, etc.) between CLI and app

### Implementation progress

```
3.1  Init Next.js + SQLite + migration ........... DONE
3.2  API routes sites (CRUD) + Sites page + form . TODO
3.3  API routes backups (run, history) + job queue  TODO
3.4  Dashboard page .............................. IN PROGRESS
3.5  History page + backup detail (log) .......... TODO
3.6  Settings page ............................... TODO
3.7  Scheduler (node-cron + instrumentation.ts) .. TODO
3.8  Docker + Compose ............................ TODO
3.9  Full test on NAS ............................ TODO
```

### Architecture decisions

- **CLI + App coexist**: `config.json` keeps working for CLI. SQLite is used by the app. Migration script (`npm run migrate`) imports config.json into SQLite. CLI fallback: reads config.json first, SQLite second.
- **Password encryption**: AES-256 with `ENCRYPTION_KEY` env var for passwords stored in SQLite.
- **Job queue**: In-memory `BackupQueue` class with concurrency limit. API routes enqueue jobs and return immediately. Frontend polls for progress. No Redis/Bull needed — Node.js async I/O handles it.
- **Scheduler**: `node-cron` started via `instrumentation.ts`. Per-site cron schedule configurable via UI. Auto-reconfigures on site changes.
- **CMS-agnostic naming**: Project could support Prestashop or others later — only the PHP dump script is WordPress-specific. Considering rename to `site-backup-manager`.

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sites` | List all sites |
| POST | `/api/sites` | Add a site |
| GET | `/api/sites/[id]` | Site detail |
| PUT | `/api/sites/[id]` | Update a site |
| DELETE | `/api/sites/[id]` | Delete a site |
| POST | `/api/sites/[id]/test` | Test FTP/SFTP connection |
| POST | `/api/backups/run/[id]` | Run backup for a site |
| POST | `/api/backups/run` | Run all active backups |
| GET | `/api/backups` | History (filterable by site, status) |
| GET | `/api/backups/[id]` | Backup detail |
| GET | `/api/backups/[id]/log` | Full backup log |
| GET | `/api/dashboard` | Aggregated stats (last backup per site) |
| GET | `/api/settings` | Global config |
| PUT | `/api/settings` | Update global config |

### UI Pages

1. **Dashboard** (`/`) — site cards with last backup status, date, duration. "Backup All" button.
2. **Sites** (`/sites`) — table with "Run Backup", "Edit", "Test Connection" buttons.
3. **Add/Edit site** (`/sites/new`, `/sites/[id]`) — form (domain, host, credentials, protocol, port, webroot, cron schedule, GitHub repo).
4. **History** (`/history`) — paginated table with site and status filters.
5. **Backup detail** (`/history/[id]`) — full log, metrics, commit SHA.
6. **Settings** (`/settings`) — GitHub, SharePoint, SMTP config.

### Docker

```yaml
services:
  wp-backup:
    build: .
    container_name: wp-backup-manager
    restart: unless-stopped
    ports:
      - "8920:3000"
    volumes:
      - ./data:/app/data
      - ~/.ssh:/root/.ssh:ro
      - ./sp-certificates:/app/sp-certificates:ro
    environment:
      - NODE_ENV=production
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    networks:
      wp-backup-net:
        ipv4_address: 172.20.X.2
```

---

## Remaining manual tasks

- Revoke GitHub PAT and create a new fine-grained one
- Change FTP/SFTP passwords for all 7 sites
- Regenerate SharePoint certificate
- Switch all repos to SSH clone

---

## Future phases

### Phase 4 — Hack detection
- Analyze modified files after each backup for signs of compromise
- PHP files in `wp-content/uploads/` → critical alert
- Suspicious content (`eval(`, `base64_decode(`, `shell_exec(`) → warning
- Abnormal volume of modified PHP files → warning
- Core WordPress checksum verification via `api.wordpress.org/core/checksums/1.0/`
- Results stored in `backups.hack_alert` + `backups.hack_details`
- Triggers notification, backup continues normally

### Phase 5 — Email notifications
- SMTP configuration in Settings UI
- `nodemailer` for sending
- Templates: backup success, backup failure, hack detected
- Async sending (does not block backup)
- Optional daily digest email

### Phase 6 — Backup restoration
- Select a backup from history (commit SHA / git tag)
- Upload files to site via FTP/SFTP (full or partial)
- Database restoration via dedicated PHP script (`restore-db.php`, same token auth)
- Auto-backup current state before restore (rollback point)
- UI with confirmation modal, progress bar, real-time log

---

## Ideas (not planned yet)

- Replace Git with Restic for storage (deduplication, encryption, retention policies)
- Discord/Slack webhook notifications
- WP-CLI for sites with SSH access (`wp db export` instead of PHP script)
- Prestashop / Drupal support (CMS-specific dump scripts)
- WordPress core checksum verification
- Real-time log streaming via SSE or WebSocket during backup
- Diff viewer for changed files between backups
- Backup size tracking and storage alerts

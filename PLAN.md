# Plan : WP Backup Manager

## Remaining tasks

### Credential rotation (manual)
- Revoke GitHub PAT and create a new fine-grained one
- Change FTP/SFTP passwords for all 7 sites
- Regenerate SharePoint certificate
- Switch all repos to SSH clone

### WP-CLI for SSH sites (optional)
- `wp db export` via SSH instead of the PHP script (more reliable, no PHP timeout)
- Config: add `ssh: true` + `sshKey` field per site
- Automatic fallback to PHP script if no SSH

---

## Phase 3 — Web app (Next.js + SQLite)

> The CLI (`index.js`) stays functional and independent. The web app is a second consumer
> of the same `lib/backup.js` module. You can use the CLI without starting the web server.

### Architecture

**Two ways to use the same project:**
- **CLI**: `node index.js dewwwe.com` — as before, uses `lib/backup.js` directly
- **Web app**: `npm run dev` / `npm start` — Next.js that also uses `lib/backup.js`

**Stack:**
- Next.js (App Router) — fullstack React framework
- SQLite via better-sqlite3 — lightweight storage (single file, no DB service)
- node-cron — built-in scheduler for planned backups
- Existing modules (`lib/backup.js`, `lib/ftp.js`, `lib/sftp.js`, etc.) — shared between CLI and app

### Project structure

```
wp-backup-manager/
├── index.js                   # CLI entry point (unchanged)
├── lib/                       # Shared modules CLI + Web app
│   ├── backup.js              # Backup logic (exists)
│   ├── ftp.js                 # FTP client (exists)
│   ├── sftp.js                # SFTP client (exists)
│   ├── sp.js                  # SharePoint (exists)
│   ├── sync.js                # Incremental comparison (exists)
│   ├── cleanup.js             # Local cleanup (exists)
│   ├── db.js                  # SQLite connection + queries
│   ├── scheduler.js           # node-cron, backup scheduling
│   └── queue.js               # Job queue for parallelism from UI
├── helpers/
│   └── backup-wp.php          # Secured PHP script (exists)
├── app/                       # Next.js App Router
│   ├── layout.tsx             # Global layout (sidebar navigation)
│   ├── page.tsx               # Dashboard
│   ├── sites/
│   │   ├── page.tsx           # Site list
│   │   ├── new/page.tsx       # Add site form
│   │   └── [id]/page.tsx      # Site detail / edit
│   ├── history/
│   │   ├── page.tsx           # Backup history
│   │   └── [id]/page.tsx      # Backup detail (log)
│   ├── settings/
│   │   └── page.tsx           # Global config
│   └── api/                   # Next.js API Routes
│       ├── sites/
│       │   ├── route.ts       # GET (list), POST (create)
│       │   └── [id]/
│       │       ├── route.ts   # GET, PUT, DELETE
│       │       └── test/route.ts  # POST test connection
│       ├── backups/
│       │   ├── route.ts       # GET (history)
│       │   ├── run/route.ts   # POST run-all
│       │   ├── run/[id]/route.ts  # POST run single site
│       │   └── [id]/
│       │       ├── route.ts   # GET detail
│       │       └── log/route.ts   # GET full log
│       ├── dashboard/
│       │   └── route.ts       # GET aggregated stats
│       └── settings/
│           └── route.ts       # GET, PUT
├── components/
│   ├── Layout.tsx
│   ├── SiteCard.tsx
│   ├── StatusBadge.tsx
│   ├── BackupLog.tsx
│   └── SiteForm.tsx
├── data/                      # Persistent data (Docker volume)
│   ├── backup.db              # SQLite
│   └── files/                 # Site backups (git repos)
├── next.config.js             # output: 'standalone' for Docker
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### SQLite schema

```sql
CREATE TABLE sites (
  id INTEGER PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  repo TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'ftp',  -- 'ftp', 'sftp', 'ssh'
  host TEXT NOT NULL,
  port INTEGER DEFAULT 21,
  username TEXT NOT NULL,
  password TEXT,                          -- encrypted at rest
  web_root_path TEXT DEFAULT 'www',
  ssh_key_path TEXT,
  sp_list_item_id TEXT,
  cron_schedule TEXT DEFAULT '0 3 * * *',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backups (
  id INTEGER PRIMARY KEY,
  site_id INTEGER REFERENCES sites(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'error', 'warning'
  duration_ms INTEGER,
  files_downloaded INTEGER,
  files_unchanged INTEGER,
  files_deleted INTEGER,
  dump_size_bytes INTEGER,
  commit_sha TEXT,
  error_message TEXT,
  hack_alert INTEGER DEFAULT 0,
  hack_details TEXT,
  log TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

**config.json → SQLite migration:**
- One-shot migration script that reads `config.json` and inserts sites + settings into SQLite
- After migration, `config.json` is no longer needed (CLI can read from SQLite too)
- Fallback: if `config.json` exists, CLI uses it first (backward compatibility)

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

1. **Dashboard** (`/`) — site cards with last backup status (green/red/orange/gray), date, duration. "Backup All" button.
2. **Sites** (`/sites`) — table of configured sites. "Run Backup", "Edit", "Test Connection" buttons.
3. **Add/Edit site** (`/sites/new`, `/sites/[id]`) — form (domain, host, credentials, protocol, port, webroot, cron schedule, GitHub repo).
4. **History** (`/history`) — paginated table with site and status filters. Click for detail.
5. **Backup detail** (`/history/[id]`) — full log, metrics (duration, files, dump size), commit SHA.
6. **Settings** (`/settings`) — global config (GitHub, SharePoint, SMTP).

### Job Queue

```js
// lib/queue.js
class BackupQueue {
  constructor(concurrency = 3) { ... }
  enqueue(domain, config, options) { ... }  // Returns a job ID
  getStatus(jobId) { ... }                  // 'pending' | 'running' | 'complete' | 'error'
  getRunning() { ... }                      // Running jobs
  getPending() { ... }                      // Pending jobs
  getResult(jobId) { ... }                  // Backup result
}
```

- Singleton shared across all API routes
- `POST /api/backups/run/[id]` enqueues a job and returns immediately with the job ID
- Frontend can poll `GET /api/backups` to see progress
- Each completed job is saved to SQLite

### Scheduler

- `node-cron` for per-site scheduled backups
- Each site has its own cron schedule (configurable via UI)
- Scheduler starts at Next.js boot (via `instrumentation.ts`)
- Auto-reconfigures when sites are added/modified/deleted

### Docker

```dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache git openssh-client python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache git openssh-client
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/helpers ./helpers
VOLUME ["/app/data", "/root/.ssh"]
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

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

networks:
  wp-backup-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.X.0/29
```

### Implementation order

```
3.1  Init Next.js + SQLite + config.json migration
3.2  API routes sites (CRUD) + Sites page + form
3.3  API routes backups (run, history) + job queue
3.4  Dashboard page
3.5  History page + backup detail (log)
3.6  Settings page
3.7  Scheduler (node-cron + instrumentation.ts)
3.8  Docker + Compose
3.9  Full test on NAS
```

---

## Phase 4 — Hack detection

### File analysis after each backup

After incremental download, the script knows which files were modified. Analyze changes to detect signs of compromise.

**Detection rules:**

1. **PHP files in uploads/** — WordPress should never have `.php` files in `wp-content/uploads/`
2. **Suspicious filenames** — random/encoded names (`xk3j2.php`), dotfiles in unusual places (`.user.ini`)
3. **Suspicious content** — `eval(`, `base64_decode(`, `gzinflate(`, `exec(`, `system(`, `shell_exec(` in modified files
4. **Abnormal volume** — >50 PHP files modified outside of a known WP update
5. **Modified core files** — `wp-admin/`, `wp-includes/` should not change except during WP updates. Compare checksums with official WordPress API (`api.wordpress.org/core/checksums/1.0/`)

**Alert levels:** Critical, Warning, Info

**Integration:** runs after `downloadChanged()`, results stored in `backups.hack_alert` + `backups.hack_details`. Triggers notification. Backup continues normally (we want the history).

---

## Phase 5 — Email notifications

- SMTP configuration in Settings (host, port, user, password, from, recipients)
- `nodemailer` for sending
- Templates: backup success, backup failure, hack detected
- Async sending (does not block backup)
- Optional daily digest email

---

## Phase 6 — Backup restoration

### File restoration
- Select a backup from history (identified by commit SHA / git tag)
- Checkout the corresponding version from the git repo
- Upload files to the site via FTP/SFTP
- Option: restore only specific directories

### Database restoration
- Dedicated PHP script (`helpers/restore-db.php`) with same token auth pattern
- Upload SQL dump, PHP script imports it
- Auto-backup current DB before import (rollback point)
- Self-deletes after execution

### UI
- "Restore" button on each backup in history
- Confirmation modal with options (files only, DB only, everything, exclude dirs)
- Progress bar + real-time log

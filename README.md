# WP Backup Manager

Node.js app for backing up WordPress websites. Downloads files via FTP/SFTP, dumps the database, and pushes everything to a GitHub repository. Web UI to manage sites, run backups, follow logs and schedule everything.

> v2 rewrite in progress on the `v2` branch — see [PLAN.md](./PLAN.md)

## Usage

```bash
npm install
cp .env.example .env   # fill in the secrets
npm run db:migrate     # create / update the database

# Dev
npm run dev

# Production
npm run build
npm run start

# Checks
npm run typecheck
npm test
```

First start opens a setup page to create the admin account. Sites, GitHub token, SharePoint and schedule are managed from the Settings page.

## Config

Environment variables, see [.env.example](./.env.example):

- `DATA_DIR` — database, site clones and certificates
- `ENCRYPTION_KEY` — encrypts stored passwords and tokens
- `SESSION_SECRET` — signs the session cookie
- `TZ` — timezone for cron schedules

### GitHub

Fine-grained personal access token restricted to the backup repos, with `Contents: read/write` and `Metadata: read`. Stored encrypted, used for pushes and releases.

> Backup repos must be **private**: they contain `wp-config.php` and the full database dump.

### SharePoint List update

The app can update a date field in a SharePoint list after each backup.

1. Go to https://portal.azure.com, App Registrations, "New Registration"
2. Under "API Permissions" add the application permission SharePoint/Sites.ReadWrite.All
3. Generate a certificate:
```bash
openssl req -x509 -newkey rsa:2048 -keyout keytmp.pem -out cert.pem -days 365 -passout pass:HereIsMySuperPass -subj '/C=FR/L=Lyon'
openssl rsa -in keytmp.pem -out key.pem -passin pass:HereIsMySuperPass
```
4. Upload `cert.pem` to the App Registration under "Certificates & secrets" and copy the thumbprint
5. Put `key.pem` in `$DATA_DIR/sp-certificates/`
6. Fill in the SharePoint section in Settings, then set the list item ID on each site

> Certificates expire and you will have to regenerate it every year!!

## How it works

The app runs the following steps for each site:

1. **Git clone or fetch** the backup repo and reset it on the remote default branch
2. **Cleanup leftover artifacts** — removes old SQL dumps, tokens and PHP scripts left by previous runs on the remote server
3. **Token authentication** — generates a unique token, uploads its hash via FTP/SFTP
4. **Database dump** — uploads `backup-wp.php` to the site, triggers it via HTTPS with the token in a header. The PHP script self-deletes after execution
5. **Dump download & validation** — downloads the SQL file right away to `db.sql` at the root of the repo, verifies it is not empty and contains valid SQL, deletes it from the remote server
6. **Incremental download** — scans remote files and only downloads those that changed (different size or modification date). FTP uses a pool of 5 parallel connections, SFTP 3
7. **Git commit, tag & push** — one commit per run with a UTC tag (`YYYYMMDD-HHmmss`); nothing is committed when nothing changed
8. **GitHub release** — one release per backup on the tag, with the run stats
9. **SharePoint update** — updates the last backup date in the SharePoint list (optional)

## Security

- The web UI and API are behind a login
- Passwords and tokens are encrypted at rest (AES-256-GCM)
- The PHP script (`backup-wp.php`) is protected by a unique token generated per run, only its hash is stored on the server
- The token is deleted from the server as soon as it's validated
- The PHP script self-deletes after execution
- The dump filename is unguessable and the dump is deleted from the server right after download
- MySQL password is passed through the environment, never on the command line
- Git commands run without a shell, the GitHub token is handed to git through the environment and never appears in URLs, in `.git/config` or in logs
- A safeguard automatically cleans up orphaned artifacts at the start of each run

## Incremental vs full mode

By default, backups run in **incremental** mode:
- Compares size and modification date of each remote file with the local file
- Only downloads new or modified files
- Deletes local files that no longer exist on the remote (skipped if part of the remote listing failed)
- FTP scanning uses a pool of 5 parallel connections for faster listing

The "Full download" option clears the local tree and downloads every file again. It refuses to run when part of the remote listing failed, so a partial snapshot never replaces a complete one.

## Multi-site support

Backups run through a queue with limited concurrency (configurable in Settings). Each site has its own log, stored with the run and streamed live in the UI. A site can't have two backups running at the same time.

## Error handling

- A backup never crashes the app — every run ends with a status (`success`, `error`, `cancelled`) and its log
- SharePoint and release errors are non-blocking (backup is still considered successful)
- Git errors are reported, the backup is marked as error
- On dump failure, remote files (PHP, token) are cleaned up
- Runs interrupted by a restart are marked as error at next boot

## Debug

If something goes wrong with a site, delete `$DATA_DIR/files/your-site` and re-run the backup. It will clone the repo and do a full download.

## Roadmap

### Done
- [x] Tag repos with date of backup for easy roll back
- [x] SFTP support
- [x] Secure backup PHP script with token auth + auto-cleanup
- [x] Incremental file download (only changed files)
- [x] Parallel FTP scanning (5 connections)
- [x] Parallel file download
- [x] Multi-site parallel execution
- [x] SQL dump validation before commit
- [x] Automatic cleanup of leftover artifacts
- [x] Resilient error handling (never crashes)
- [x] Web app with UI (Next.js + shadcn/ui + SQLite)
- [x] Real-time log streaming during backup (SSE)

### In progress (v2)
- [x] Prisma data model + migrations
- [x] Password encryption at rest (AES-256)
- [x] Engine rewrite (TypeScript, no shell, GitHub token through the environment)
- [x] GitHub releases created by the app
- [ ] Login + first-run setup
- [ ] Scheduled backups via node-cron (per-site cron schedule, configurable via UI)
- [ ] Settings page + test connection
- [ ] Docker deployment for Synology NAS (standalone Next.js image)

### Planned
- [ ] Repo history retention (keep the last N releases, squash older snapshots)
- [ ] Hack detection (suspicious files, PHP in uploads, modified core files, WP checksum verification)
- [ ] Email notifications (SMTP, backup success/failure/hack alerts, daily digest)
- [ ] Backup restoration via FTP/SFTP from the UI (files + DB, with rollback point)
- [ ] Multi-user auth for the web UI

### Ideas
- [ ] Replace Git with Restic for storage (deduplication, encryption, retention policies)
- [ ] Discord/Slack webhook notifications
- [ ] WP-CLI support for sites with SSH access (`wp db export`)
- [ ] Prestashop / Drupal support (CMS-specific dump scripts)
- [ ] Diff viewer for changed files between backups
- [ ] Backup size tracking and storage alerts
- [ ] Webhook triggers (start backup from external systems)
- [ ] Backup integrity verification (checksum after download)
- [ ] Project rename to `site-backup-manager` (CMS-agnostic)

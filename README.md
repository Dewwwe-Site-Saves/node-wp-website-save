# node-wp-website-save

Node.js tool for backing up WordPress websites. Downloads files via FTP/SFTP, dumps the database, and pushes everything to a GitHub repository.

## Usage

```bash
npm install

# Single site
npm run save mysite.fr

# Multiple sites in parallel
npm run save mysite.fr othersite.com

# All configured sites
npm run save -- --all

# Force full download (instead of incremental)
npm run save mysite.fr -- --full
```

## Config

Create a `config.json` file from the example:
> See [config-example.json](./config-example.json)

### SharePoint List update
See [setup-sharepoint-updates](./setup-sharepoint-updates.md)

## How it works

The script runs the following steps for each site:

1. **Git pull/clone** the backup repo
2. **Cleanup leftover artifacts** — removes old SQL dumps, tokens and PHP scripts left by previous runs on the remote server
3. **Token authentication** — generates a unique token, uploads it via FTP/SFTP
4. **Database dump** — uploads `backup-wp.php` to the site, triggers it via HTTP with the token. The PHP script self-deletes after execution
5. **Incremental download** — scans remote files and only downloads those that changed (different size or modification date). FTP scanning uses a pool of 5 parallel connections
6. **Dump validation** — verifies the SQL file is not empty and contains valid SQL
7. **Remote cleanup** — deletes the SQL dump from the remote server
8. **Git commit, tag & push** — automatic commit with dated tag
9. **SharePoint update** — updates the last backup date in the SharePoint list (optional)

## Security

- The PHP script (`backup-wp.php`) is protected by a unique token generated per run
- The token is deleted from the server as soon as it's validated
- The PHP script self-deletes after execution
- The dump filename is unguessable (contains the token)
- The dump is deleted from the server after download
- All mysqldump parameters are escaped with `escapeshellarg()`
- A safeguard automatically cleans up orphaned artifacts at the start of each run

## Incremental vs full mode

By default, the script runs in **incremental** mode:
- Compares size and modification date of each remote file with the local file
- Only downloads new or modified files
- Deletes local files that no longer exist on the remote
- FTP scanning uses a pool of 5 parallel connections for faster listing

The `--full` flag forces a complete download of all files.

## Multi-site support

The script supports parallel execution of multiple sites with concurrency limited to 3 by default. Each site has its own logger prefixed with `[domain]` to identify logs. A summary is displayed at the end with the status of each site.

## Error handling

- The script never crashes — it always finishes cleanly with a summary
- SharePoint errors are non-blocking (backup is still considered successful)
- Git errors are reported but the script continues
- Exit code `0` on success, `1` on error
- On dump failure, remote files (PHP, token) are cleaned up

## Debug

If something goes wrong, delete the `/files/your-site` folder and re-run the script. It will clone the repo and do a full download.

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

### In progress
- [ ] Web app with UI (Next.js + shadcn/ui + SQLite) — see [PLAN.md](./PLAN.md)
- [ ] config.json → SQLite migration script
- [ ] Password encryption at rest (AES-256)

### Planned
- [ ] Hack detection (suspicious files, PHP in uploads, modified core files, WP checksum verification)
- [ ] Email notifications (SMTP, backup success/failure/hack alerts, daily digest)
- [ ] Backup restoration via FTP/SFTP from the UI (files + DB, with rollback point)
- [ ] Scheduled backups via node-cron (per-site cron schedule, configurable via UI)
- [ ] Docker deployment for Synology NAS (standalone Next.js image)
- [ ] Real-time log streaming during backup (SSE or WebSocket)

### Ideas
- [ ] Replace Git with Restic for storage (deduplication, encryption, retention policies)
- [ ] Discord/Slack webhook notifications
- [ ] WP-CLI support for sites with SSH access (`wp db export`)
- [ ] Prestashop / Drupal support (CMS-specific dump scripts)
- [ ] Diff viewer for changed files between backups
- [ ] Backup size tracking and storage alerts
- [ ] Project rename to `site-backup-manager` (CMS-agnostic)


# Roadmap

v2 is in production since 2026-09-06. This file tracks what is left to verify on the running instance and what comes next. Items move from "Ideas" to "Next" when they get a design, and out of this file when they ship (the README keeps the list of what the app does).

## Checks pending on the production instance

Everything below is code that exists and is covered by tests, but has not yet been exercised end to end on the deployed instance.

- [ ] One backup per remaining site (each site once, so that protocol, web root and dump path are confirmed for all of them; the first site passed on 2026-09-06)
- [ ] A scheduled run firing on its own at the configured time
- [ ] A run with nothing changed on the remote: no commit, no tag, no Release, status `success`
- [ ] Login throttle: 429 with `Retry-After` after five failed attempts from the same address
- [ ] A backup cancelled from the UI while a download is in progress leaves the clone consistent (next run recovers)
- [ ] A container restart during a run: the interrupted backup is marked `error` at the next boot and the next scheduled run goes through

## Next

Features with a rough design, in the order they are likely to be built.

- [ ] **Retry on transient remote errors**. FTP hosts sometimes answer "temporarily unavailable" for a few seconds and the run fails on the first such error (issue #5). Retry a listing or a download a few times with a delay before giving up, and count the retries in the run stats.
- [ ] **Design pass on the UI**. Phone layout, spacing and typography, empty states, the live log modal on small screens. Done as one dedicated pass rather than page by page.
- [ ] **Repo history retention**. Keep the last N Releases per site and drop older snapshots. Deleting tags and Releases alone does not free space on GitHub; reclaiming it means re-rooting the branch (new orphan commit from the current tree, force push, GitHub runs gc later). Needs a setting per site and a dry-run report before the first real run.
- [ ] **Hack detection**. PHP in `wp-content/uploads`, suspicious patterns, core checksum verification via `api.wordpress.org`. Adds `hackAlert` / `hackDetails` columns by migration.
- [ ] **Notifications**. SMTP settings, `nodemailer`, templates for success, failure and hack alerts, daily digest. Discord and Slack webhooks.
- [ ] **Restore**. Pick a Release or tag, upload files over FTP/SFTP, `restore-db.php` with the same token scheme, automatic pre-restore backup.
- [ ] **Multi-user**. Users page in Settings, invitations, `viewer` role enforced through `requireRole`.
- [ ] **Hardening headers**. CSP, `X-Frame-Options`, `poweredByHeader: false` in `next.config.js`.

## Ideas

Not designed yet, kept so they are not forgotten.

- [ ] **Per-site commit identity**: optional `Site.commitName` / `Site.commitEmail` overriding the global identity from Settings, for a client repo that must show the client's own author. Site form gets an "Override commit author" toggle; `lib/db.ts` merges site, then settings, then default when building the `GithubConfig`.
- [ ] **Repo auto-creation** from the site form through the GitHub API (private repo, README).
- [ ] **API tokens** for external triggers (webhooks, curl) without a browser session.
- [ ] **SSH remotes** as an alternative to the HTTPS token (app-generated key shown in Settings).
- [ ] **Restic backend** instead of git (deduplication, encryption, retention).
- [ ] **WP-CLI dump** for sites with SSH access (`wp db export`).
- [ ] **Prestashop / Drupal** dump scripts.
- [ ] **Multi-arch image** (`linux/arm64`) if the host ever changes.
- [ ] **Diff viewer** between two backups, size tracking and storage alerts.
- [ ] **File explorer**: browse the tree of a given backup (Release or tag) from the UI, view or download a single file, entry point for a per-file restore. Read from the local clone via `git ls-tree` / `git show`, no extra storage.
- [ ] **Structured logs**: log lines carry a level and a step (scan, download, dump, commit, push, sharepoint); the live log modal and the backup detail page get level filters and a per-step timeline with durations.
- [ ] **Backup integrity verification**: checksum of each downloaded file against the remote when the protocol allows it.
- [ ] **Integration tests** against a local FTP/SFTP container.
- [ ] **Rename the remote artifacts** (`dewwwe-backup.php`, `.dewwwe-backup-token`) to a product name. Only once no host carries leftovers under the old names, since the cleanup step at the start of each run looks for them.

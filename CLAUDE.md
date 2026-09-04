# WP Backup Manager — project instructions

Self-hosted backup manager for WordPress sites: pulls files over FTP/SFTP, dumps the database, versions everything in a GitHub repo. Next.js web UI to manage sites, run backups, follow logs and schedule them.

## State of the rewrite

Working branch is `v2`. [PLAN.md](./PLAN.md) is the source of truth for scope and ordering — check which phase covers a feature before proposing it.

- Phases 0 to 3 are committed. The v1 engine is gone; the app runs on `lib/engine` through `lib/jobs/queue.ts`, scheduled by `lib/jobs/scheduler.ts`, booted by `instrumentation.ts`.
- Phase 4 is next: auth and first-run setup, the API routes renamed around the Backup id, settings page, UI hooks. The Phase 3 section of PLAN.md lists what deviates from the plan (in-process enqueue lock, boot logic in `lib/jobs/boot.ts`, routes still on their Phase 2 URLs).
- Real-site checks still pending before the Docker rollout are listed at the end of Phase 2 in PLAN.md (full download, SFTP, SharePoint with PnP v4, the other sites).

## Engine

`lib/engine` is pure TypeScript: no Next.js import, no Prisma import, no ambient config. It only sees the decrypted `SiteConfig` / `GithubConfig` / `SharePointConfig` objects from `lib/engine/types.ts`.

- `backup.ts` — `runBackup(site, github, sharepoint, options)` is the single entry point. It never throws: the outcome is `result.status` (`success` | `error` | `cancelled`) plus `errorMessage` and the full log. The queue copies the result as-is.
- `git.ts` — `execFile` with array arguments, identity and credentials passed per invocation with `-c`. The token reaches git through an inline `credential.helper` reading `GIT_BACKUP_TOKEN` from the environment (no `GIT_ASKPASS` file), never through a URL. Errors are built from stderr only.
- `remote/` — `RemoteClient` interface, FTP (basic-ftp, 5 connections) and SFTP (ssh2-sftp-client, 3 connections, one worker per connection). Engine paths are absolute under the login directory (`/www/...`); the SFTP client resolves them under `realPath('.')` because an SSH login lands in a real home. The local tree keeps the web root folder (`www/...`).
- `sync.ts` — scan, plan, download, prune. Orphan deletion is skipped when any directory failed to list; full mode refuses a partial listing.
- `dump.ts` — token hash + `helpers/backup-wp.php` uploaded from memory, HTTPS trigger with `redirect: 'manual'`, dump downloaded to `<clone>/db.sql` and validated, remote artifacts removed in `finally`.
- `sharepoint.ts` — PnP v4, `SPDefault()` + `MSAL()` behaviors, certificate under `DATA_DIR/sp-certificates/key.pem`. Failure is a warning.
- Cancellation: check `options.signal` between steps and files with `throwIfAborted`, wrap long calls with `abortable`, detect with `isCancellation` (`lib/engine/cancel.ts`).
- Tests use `lib/engine/testing/fake-remote.ts` (in-memory `RemoteClient`), a real git binary on temp bare repos (with `GIT_CONFIG_GLOBAL=/dev/null`) and `vi.stubGlobal('fetch', ...)`. `scripts/smoke-sync.ts` (untracked on purpose) runs a read-only scan against a real site.

## Layout

- `app/` — Next.js 16 App Router (pages + `api/` routes)
- `components/` — React components, `components/ui` is shadcn
- `lib/` — `db.ts`, `prisma.ts`, `crypto.ts`, `validation.ts` (zod), `paths.ts`
- `lib/jobs/` — `queue.ts`: DB-first queue. The `Backup` row is the job; in memory only the `AbortController` and the log buffer of the runs in progress. `enqueue` throws `BackupConflictError` when the site already has an active backup, `cancel` marks a pending row or aborts a running one, `subscribe(backupId, listeners)` registers `log` / `status` / `done` listeners and returns the buffered lines in the same tick (the SSE route relies on that ordering). Queue, scheduler and boot state live on `globalThis` unconditionally: in production the boot hook and the route bundles may not share a module instance. `scheduler.ts`: one node-cron task per enabled site, `reload()` rebuilds them from the database and must be called after every site or settings mutation. `boot.ts`: called once by `instrumentation.ts` (env check, `initDatabase`, orphan job sweep, scheduler, daily retention).
- `lib/testing/db.ts` — throwaway SQLite database for tests that run Prisma for real (temp `DATA_DIR`, migrations replayed); import it before anything that touches the database.
- `lib/engine/` — the backup engine, see above
- `prisma/` — schema and migrations
- `helpers/backup-wp.php` — dropped on the remote host to dump the database, read at each run from `<cwd>/helpers`
- `scripts/` — one-off `tsx` scripts

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run format      # prettier --write .
```

Run `typecheck` and `test` yourself after changing engine or lib code. Anything with a side effect — `build`, `dev`, `db:migrate`, `db:deploy`, `npm install` — propose the command, don't run it.

There is no ESLint here on purpose: `eslint-config-next` pulls in typescript-eslint, which refuses to load under TypeScript 7 ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)) — the guard is in `@typescript-eslint/parser` too, so no TS parser is available at all. Prettier handles formatting and `tsc --strict` covers most of what the rules would catch. Don't re-add ESLint until that issue lands.

VS Code uses its bundled TypeScript for IntelliSense: TypeScript 7 ships no `tsserver.js`, so `js/ts.tsdk.path` must stay unset in `.vscode/settings.json`. `npm run typecheck` is the reference.

Spell checking: Code Spell Checker reads `.vscode/cspell.json`. Add project vocabulary there rather than sprinkling `cspell:ignore` comments.

## Conventions

- 4-space indent, single quotes, semicolons, `printWidth` 100 — Prettier enforces it, run `npm run format` before proposing a commit.
- Never hard-wrap prose at a fixed width, in markdown or in comments. One paragraph is one line.
- Code, identifiers, comments and **UI labels** in English.
- Imports use the `@/*` alias in `app/`, `components/` and root files (`importModuleSpecifier: non-relative`). Inside `lib/` they are relative: vitest resolves no alias, and `lib` must stay runnable from the tests.
- Dates stored as ISO 8601 UTC. Git tags are `YYYYMMDD-HHmmss` in UTC.
- Stored credentials are encrypted as `enc:v1:<iv>:<tag>:<data>` via `lib/crypto.ts` — never write a secret to the database in clear.
- All runtime state lives under `DATA_DIR` (env var, falls back to `cwd/data`): database, `files/<repo>` clones, `sp-certificates/`. Never build paths from `__dirname` — it breaks the Docker standalone build.
- Tests are vitest, colocated as `*.test.ts` next to the module.

## Do not touch

`.env`, `data/` and the legacy `config.json` hold live secrets and 7 sites' worth of real backups. They are gitignored and denied in `.claude/settings.json`.

## Working style

- One phase per session. Prefer a few well-scoped commits over one big one, and a pure-rename commit before rewriting a file so `git log --follow` keeps its history. Run `/code-review` before the final commit.
- Never commit or push — propose the message and the `git add` command, Louis commits.
- Don't add a dependency without asking first.
- End every session by bringing the docs back in line with what was actually done: this file (state of the rewrite, engine notes, conventions), `README.md` (how it works, roadmap checkboxes) and `PLAN.md` (pending checks, deviations from the plan). Stale knowledge is worse than none.

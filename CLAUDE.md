# Reposite — project instructions

Self-hosted backup manager for WordPress sites: pulls files over FTP/SFTP, dumps the database, versions everything in a GitHub repo. Next.js web UI to manage sites, run backups, follow logs and schedule them.

## State of the rewrite

Working branch is `v2`. [PLAN.md](./PLAN.md) is the source of truth for scope and ordering — check which phase covers a feature before proposing it.

- Phases 0 to 5 are done. The v1 engine is gone; the app runs on `lib/engine` through `lib/jobs/queue.ts`, scheduled by `lib/jobs/scheduler.ts`, booted by `instrumentation.ts`, behind a session cookie checked by `proxy.ts`. The Phase 4 section of PLAN.md lists what deviates from the plan (no database access in the proxy, `lib/session.ts` next to `lib/auth.ts`, `SESSION_COOKIE_SECURE`).
- Phase 5 (2026-09-06) added the Docker image, the Portainer compose and the GitHub Actions workflows, after the rename from WP Backup Manager to Reposite. Nothing has run on the NAS yet: the "To verify on the NAS" list at the end of Phase 5 in PLAN.md (image boot, the browser checks left from Phase 4, the real-site checks left from Phase 2, Jenkins jobs to disable) is the next session. `v2` gets merged into `main` and tagged `v2.0.0` once the NAS run is validated.

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

- `app/` — Next.js 16 App Router. `app/(app)/` holds the pages behind the login (its layout loads the current user and renders `AppShell`), `app/(auth)/` the login and setup pages, `app/api/` the route handlers. The API table in PLAN.md (Phase 4) is the reference for the routes.
- `proxy.ts` — Next 16 proxy (the former middleware): verifies the session cookie on every request except `/login`, `/setup`, `/api/auth/{login,setup,logout}` and `/api/health` (the Docker probe); pages are redirected to `/login?next=`, `/api/*` gets a 401. No database access there: the login page redirects to `/setup` while the `User` table is empty, and `/setup` back to `/login` once a user exists.
- `components/` — React components, `components/ui` is shadcn. `JobStatusProvider` is the single poller of `/api/status` (3 s, paused when the tab is hidden); components read it through `useJobStatus()` and it calls `router.refresh()` whenever the set of active backups changes, so server components never poll themselves.
- `lib/` — `db.ts`, `prisma.ts`, `crypto.ts`, `validation.ts` (zod), `constants.ts` (statuses, protocols, `SECRET_MASK`: the only lib module client components may value-import, `validation.ts` pulls node-cron), `paths.ts`, `auth.ts` (bcrypt, JWT session token, cookie options; no database import so the proxy can use it), `session.ts` (`getCurrentUser`, `requireRole`, `openSession` / `closeSession` through `next/headers`), `login-throttle.ts`, `api.ts` (`jsonError`, `parseBody`, `apiHandler`), `connection-test.ts`
- `lib/jobs/` — `queue.ts`: DB-first queue. The `Backup` row is the job; in memory only the `AbortController` and the log buffer of the runs in progress. `enqueue` throws `BackupConflictError` when the site already has an active backup, `cancel` marks a pending row or aborts a running one, `subscribe(backupId, listeners)` registers `log` / `status` / `done` listeners and returns the buffered lines in the same tick (the SSE route relies on that ordering). Queue, scheduler and boot state live on `globalThis` unconditionally: in production the boot hook and the route bundles may not share a module instance. `scheduler.ts`: one node-cron task per enabled site, `reload()` rebuilds them from the database and must be called after every site or settings mutation. `boot.ts`: called once by `instrumentation.ts` (env check, `initDatabase`, orphan job sweep, scheduler, daily retention).
- `lib/testing/db.ts` — throwaway SQLite database for tests that run Prisma for real (temp `DATA_DIR`, migrations replayed); import it before anything that touches the database.
- `lib/engine/` — the backup engine, see above
- `prisma/` — schema and migrations
- `helpers/backup-wp.php` — dropped on the remote host to dump the database, read at each run from `<cwd>/helpers`
- `scripts/` — one-off `tsx` scripts: `import-config.ts` (legacy config.json), `reset-password.ts <email> [password]` (the only way back in without the current password). In Docker they run through `docker exec -u <PUID> Reposite-App npx tsx scripts/...`, which is why `tsx`, `scripts/` and `lib/` ship in the image.
- `Dockerfile`, `docker-entrypoint.sh`, `docker-compose.yml`, `.dockerignore` — the image and the Portainer stack, see below. `.github/workflows/` — `ci.yml` (typecheck, format check, tests on every push), `docker-build-push.yml` (image on GHCR), `release.yml` (GitHub Release on a `v*` tag).

## Docker

Modelled on Curatr (`~/github/media-quality-tracker`, same stack). Three stages on a pinned Alpine tag (`ARG NODE_IMAGE`, bump it explicitly, never a moving tag): `builder` (`npm ci`, `next build` standalone), `prod-deps` (`npm ci --omit=dev`), `runner` (git, dumb-init, su-exec). The runner copies the standalone output, then the full production `node_modules` on top of it, then `prisma/`, `helpers/`, `scripts/`, `lib/` and the generated client: `prisma` and `tsx` are runtime dependencies on purpose so that `prisma migrate deploy` and the operator scripts run in the container.

The entrypoint runs as root only to map PUID/PGID, give `/data` to that user (top-level entries, plus a recursive pass on any clone under `files/` owned by someone else) and apply the migrations, then drops to the app user for `node server.js`. `DATA_DIR=/data`, `PORT=3000`, `/api/health` answers the `HEALTHCHECK`.

The image is built by GitHub Actions, never on the NAS: `staging` on `main`, `latest` and the semver tag on `vX.Y.Z`, `<branch>` on a manual run. Deployment is a Portainer stack in Repository mode on `docker-compose.yml`, secrets in the stack environment, updated by hand with Pull and redeploy. The subnet in the compose is a `172.23.X.0/29` placeholder until a free one is picked.

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run format      # prettier --write .
```

Run `typecheck` and `test` yourself after changing engine or lib code. Anything with a side effect — `build`, `dev`, `db:migrate`, `db:deploy`, `npm install`, `docker build`, `docker run` — propose the command, don't run it.

There is no ESLint here on purpose: `eslint-config-next` pulls in typescript-eslint, which refuses to load under TypeScript 7 ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)) — the guard is in `@typescript-eslint/parser` too, so no TS parser is available at all. Prettier handles formatting and `tsc --strict` covers most of what the rules would catch. Don't re-add ESLint until that issue lands.

VS Code uses its bundled TypeScript for IntelliSense: TypeScript 7 ships no `tsserver.js`, so `js/ts.tsdk.path` must stay unset in `.vscode/settings.json`. `npm run typecheck` is the reference.

Spell checking: Code Spell Checker reads `.vscode/cspell.json`. Add project vocabulary there rather than sprinkling `cspell:ignore` comments.

## Conventions

- 4-space indent, single quotes, semicolons, `printWidth` 100 — Prettier enforces it, run `npm run format` before proposing a commit.
- Never hard-wrap prose at a fixed width, in markdown or in comments. One paragraph is one line.
- Code, identifiers, comments and **UI labels** in English.
- Imports use the `@/*` alias in `app/`, `components/` and root files (`importModuleSpecifier: non-relative`). Inside `lib/` they are relative: vitest resolves no alias, and `lib` must stay runnable from the tests.
- Dates stored as ISO 8601 UTC. Git tags are `YYYYMMDD-HHmmss` in UTC.
- Stored credentials are encrypted as `enc:v1:<iv>:<tag>:<data>` via `lib/crypto.ts` — never write a secret to the database in clear. The API never returns a stored secret: it sends `SECRET_MASK` (`lib/validation.ts`) and treats the mask or an empty string in a PUT as "keep the stored value".
- Route handlers are `export const GET = apiHandler(async (request, { params }) => ...)`: `AuthError` becomes its status, any other exception a 500 with a generic message. Mutating handlers start with `await requireRole('admin')`; read handlers rely on the proxy. Bodies go through `parseBody(request, schema)`, ids through `parseId`.
- Adding a page under `app/(app)/` needs nothing for auth; a new public route must be added to `PUBLIC_PATHS` in `proxy.ts`.
- A page or GET route that reads the database exports `dynamic = 'force-dynamic'`, even when it also reads cookies or search params: `next build` prerenders anything it can, and it does so against an empty database.
- All runtime state lives under `DATA_DIR` (env var, falls back to `cwd/data`): database, `files/<repo>` clones, `sp-certificates/`. Never build paths from `__dirname` — it breaks the Docker standalone build.
- Tests are vitest, colocated as `*.test.ts` next to the module.

## Do not touch

`.env`, `data/` and the legacy `config.json` hold live secrets and 7 sites' worth of real backups. They are gitignored and denied in `.claude/settings.json`.

## Working style

- One phase per session. Prefer a few well-scoped commits over one big one, and a pure-rename commit before rewriting a file so `git log --follow` keeps its history. Run `/code-review` before the final commit.
- Never commit or push — propose the message and the `git add` command, Louis commits.
- Don't add a dependency without asking first. Moving `prisma` or `tsx` back to `devDependencies` breaks the image.
- End every session by bringing the docs back in line with what was actually done: this file (state of the rewrite, engine notes, conventions), `README.md` (how it works, roadmap checkboxes) and `PLAN.md` (pending checks, deviations from the plan). Stale knowledge is worse than none.

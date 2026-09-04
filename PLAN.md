# Plan : WP Backup Manager v2

> Rewritten 2026-09-03 after the full audit. No production install exists yet, so the
> data model, file layout and engine internals can change freely. The audit findings are
> folded into the phases below rather than patched on the current code.

## Target architecture

One Next.js application (App Router, TypeScript strict) that contains everything:

```
app/                    UI pages + API route handlers (thin: validate, call services, respond)
  login/, setup/        Auth pages (setup only when no user exists yet)
  api/                  See "API" below
lib/
  paths.ts              DATA_DIR resolution (db, files, certificates), as functions
  crypto.ts             AES-256-GCM for secrets at rest
  auth.ts               Password hashing, session cookie (signed JWT), current user helper
  validation.ts         zod schemas shared by API routes and forms
  prisma.ts             Prisma client singleton (better-sqlite3 driver adapter) + pragmas
  db.ts                 Typed queries used by routes and jobs (decrypted configs, pagination)
  generated/prisma/     Generated client (gitignored, `prisma generate` on postinstall)
  engine/               Backup engine. Pure TypeScript, no Next.js import, no DB import.
    types.ts            SiteConfig, GithubConfig, BackupOptions, BackupResult, Logger
    logger.ts
    git.ts              execFile-based git wrapper, HTTPS + GIT_ASKPASS
    github.ts           GitHub REST calls (create release, later: create repo)
    remote/
      client.ts         RemoteClient interface
      ftp.ts            basic-ftp implementation
      sftp.ts           ssh2-sftp-client implementation
    sync.ts             scan / compare / download / delete-orphans (protocol-agnostic)
    dump.ts             token, PHP upload, HTTP trigger, dump download + validation
    sharepoint.ts
    backup.ts           Orchestrator: runBackup(siteConfig, options) -> BackupResult
  jobs/
    queue.ts            In-process queue, DB-first (Backup row created on enqueue)
    scheduler.ts        node-cron, one task per enabled site
    events.ts           EventEmitter used by SSE routes
instrumentation.ts      Boot: check env, sweep orphan jobs, start scheduler
prisma/
  schema.prisma
  migrations/
helpers/backup-wp.php   Remote dump script (uploaded from memory, never from a temp file)
scripts/import-config.ts  One-off import of the legacy config.json (seed for the 7 sites)
```

### Decisions

- **CLI removed.** `index.js`, `config.json` and `scripts/migrate.js` go away. The engine stays a
  pure module (`lib/engine`) with no Next.js or Prisma dependency, so a CLI can be re-added in
  ten lines if ever needed. Manual runs go through the API.
- **Prisma + SQLite** via the better-sqlite3 driver adapter. Schema-driven migrations
  (`prisma migrate dev` locally, `prisma migrate deploy` in the container entrypoint).
  Prisma enum support on SQLite is limited: status/protocol columns are `String` constrained
  by zod at the boundary.
- **Everything under `DATA_DIR`** (env var, default `./data`): `backup.db`, `files/<repo>/`,
  `sp-certificates/`. No more `__dirname`-relative paths (they break in the standalone build).
- **Secrets encrypted at rest** (site passwords, GitHub token, SMTP later). The app refuses to
  boot in production without `ENCRYPTION_KEY`. No cleartext fallback.
- **GitHub over HTTPS with a fine-grained token.** The token lives encrypted in `Settings`
  and is handed to git through `GIT_ASKPASS` (a tiny script reading an env var), so it never
  appears in a URL, in `.git/config`, in `ps` or in error messages. One token, managed in the
  Settings page, no SSH key to generate or distribute. SSH remotes stay possible later as an
  option.
- **Releases created by the app**, not by a workflow in each backup repo. After a successful
  push the engine calls the GitHub API to create a Release on the new tag, with a body that
  carries the run stats (files changed, dump size, duration, trigger). Same result as today
  (one Release per backup, the entry point to find a snapshot by date) but with a maintained
  code path and richer notes. The legacy `auto-tagged-release.yml` in each repo is deleted by
  the engine on the first v2 commit so tags do not produce duplicate Releases.
- **Auth ready for multi-user from day one.** A `User` table (email, password hash, role),
  the first user created through a `/setup` page when the table is empty, sessions as signed
  cookies carrying the user id and role. Multi-user later means adding a users page, not
  changing the auth model.
- **`jobId` disappears from the API.** A `Backup` row is created at enqueue time with status
  `pending`, so the backup id is the job id everywhere (stream, cancel, history).
- **Git storage stays** for now. Restic is in "Later". Repos must be private (they contain
  `wp-config.php` and the full dump). Repo history retention is a planned feature (see Later).
- **SFTP by password only.** The `ssh_key_path` column is dropped. SharePoint keeps its
  certificate file under `SP_CERT_DIR`.
- **UI in English.**

---

## Phase 0 — Cleanup and foundations

Goal: a clean TypeScript project skeleton, nothing functional yet.

- Remove `index.js`, `config-example.json`, `scripts/migrate.js`,
  `setup-sharepoint-updates.md` (content moves to README). `helpers/.gitignore` and
  `helpers/auto-tagged-release.yml` are still read by the v1 engine and go away in Phase 2
  (the `.gitignore` template becomes a constant in `sync.ts`).
- Remove unused files `components/ui/select.tsx` and `components/ui/separator.tsx`.
  `@base-ui/react` and `@hugeicons/*` are the primitives of the shadcn "base-mira" style and
  stay. Move `shadcn` to devDependencies.
- Add deps: `prisma` and `@prisma/client` pinned together on 7.10.0 (the CLI's `latest` tag
  currently points to an 8.0 release candidate), `@prisma/adapter-better-sqlite3`, `zod`,
  `jose`, `bcryptjs`, `tsx` (dev), `vitest` (dev). The `@pnp/*` v3 → v4 upgrade (fixes the
  `uuid` advisory through `@azure/msal-node`) happens in Phase 2 together with
  `sharepoint.ts`, since the v1 `lib/sp.js` still runs until then. GitHub API through plain
  `fetch`, no SDK.
- `tsconfig.json`: `strict: true`, `exclude: ["node_modules", "files", "data", ".next"]`.
  Today `tsc` compiles WordPress plugin `.ts` files found under `files/`.
- `next.config.js`: `serverExternalPackages: ['better-sqlite3', '@prisma/client']`.
- `.gitignore`: add `/data`, `/prisma/*.db`, remove the `files/.gitkeep` exception.
- `lib/paths.ts`: `DATA_DIR`, `FILES_DIR`, `DB_PATH`, `SP_CERT_DIR`. Created at boot if missing.
- `.env.example` documenting `DATA_DIR`, `ENCRYPTION_KEY`, `SESSION_SECRET`, `TZ`.

## Phase 1 — Data model (Prisma)

```prisma
model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  passwordHash String
  role         String   @default("admin")   // admin | viewer (viewer unused until multi-user)
  createdAt    DateTime @default(now())
  lastLoginAt  DateTime?
}

model Site {
  id            Int       @id @default(autoincrement())
  domain        String    @unique          // hostname, validated
  repo          String    @unique          // local folder name, ^[A-Za-z0-9._-]+$
  repoUrl       String                     // https://github.com/<owner>/<repo>(.git)? only
  protocol      String    @default("ftp")  // "ftp" | "sftp"
  host          String
  port          Int
  username      String
  passwordEnc   String                     // enc:v1:<iv>:<tag>:<ciphertext>
  webRootPath   String    @default("www")
  spListItemId  String?
  cronSchedule  String?                    // null = use Settings.defaultCron
  enabled       Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  backups       Backup[]
}

model Backup {
  id              Int       @id @default(autoincrement())
  site            Site      @relation(fields: [siteId], references: [id], onDelete: Cascade)
  siteId          Int
  status          String    @default("pending") // pending | running | success | error | cancelled
  triggerType     String    @default("manual")  // manual | scheduled
  fullDownload    Boolean   @default(false)
  skipGit         Boolean   @default(false)
  queuedAt        DateTime  @default(now())
  startedAt       DateTime?
  finishedAt      DateTime?
  durationMs      Int?
  filesDownloaded Int?
  filesUnchanged  Int?
  filesDeleted    Int?
  dumpSizeBytes   Int?
  commitSha       String?
  tag             String?
  releaseUrl      String?
  errorMessage    String?
  log             String?
  @@index([siteId, queuedAt(sort: Desc)])
  @@index([status])
}

model Settings {                            // singleton, id = 1
  id                 Int     @id @default(1)
  githubEmail        String?               // commit author email
  githubTokenEnc     String?               // fine-grained PAT: Contents read/write, Metadata read
  spTenantId         String?
  spClientId         String?
  spCertThumbprint   String?
  spTenantName       String?
  spSiteName         String?
  spListName         String?
  spDateField        String?
  defaultCron        String  @default("0 3 * * *")
  concurrency        Int     @default(2)
  retentionDays      Int     @default(90)  // prune Backup rows older than this
  updatedAt          DateTime @updatedAt
}
```

Delivered in two steps:
- **1a** — schema, `prisma.config.ts`, `lib/prisma.ts`, `lib/crypto.ts`, `lib/validation.ts`,
  `lib/engine/types.ts` (config contracts), `scripts/import-config.ts`, unit tests. The v1
  `lib/db.js` and its consumers are untouched, the app still runs on the old database file.
- **1b** — `lib/db.ts` replaces `lib/db.js`; routes, pages, components and `lib/queue.js`
  move to the Prisma models (camelCase fields, zod on every body). The app runs on Prisma.

Notes:
- No `githubOwner` setting: owner and repo are parsed from each site's `repoUrl`.
- `hackAlert` / `hackDetails` are **not** created now. They arrive with the hack-detection
  feature through their own migration. No orphan columns.
- `options` JSON string replaced by explicit `fullDownload` / `skipGit` columns.
- All timestamps are `DateTime` (Prisma stores ISO 8601 UTC), which fixes the mixed
  `CURRENT_TIMESTAMP` vs ISO formats.
- `lib/prisma.ts` exports the client and `initDatabase()` (WAL + foreign keys pragmas).
  `lib/db.ts` exports typed helpers used by routes and jobs (`getSiteConfig(id)` returns the
  decrypted `SiteConfig` for the engine, `getGithubConfig()` the decrypted token,
  `getSettings()` the singleton row created on first access).
- `scripts/import-config.ts`: reads the legacy `config.json`, encrypts passwords, inserts
  sites and settings, rewrites `repoUrl` values to plain HTTPS. Run once by hand, then
  `config.json` is deleted.

## Phase 2 — Engine rewrite (`lib/engine`, TypeScript)

Everything in this phase is pure code with no Next.js or database import. Unit-testable.

### `git.ts`
- `git(args: string[], cwd: string, opts?)` built on `execFile('git', args, { cwd, env })`.
  No shell, no string concatenation, arguments are arrays.
- Credentials: `env.GIT_ASKPASS` points to `helpers/git-askpass.sh` (prints
  `$GIT_BACKUP_TOKEN`), `env.GIT_BACKUP_TOKEN` set per invocation, `GIT_TERMINAL_PROMPT=0`.
  Remote URLs are plain `https://github.com/<owner>/<repo>.git`.
- Identity via `-c user.name="WP Backup Manager" -c user.email=<Settings.githubEmail>` per
  invocation. Never `--global`.
- `ensureRepo(localPath, repoUrl)`: clone if missing or `.git` absent; otherwise
  `remote set-url origin <repoUrl>` (drops any token left in an old clone) then
  `fetch` + `reset --hard origin/HEAD`. Re-clone only if `.git` is unreadable, never on a
  transient pull failure.
- `commitAndTag(localPath, message, tag)`: `git status --porcelain` first; if empty, no
  commit and no tag (result `commitSha = HEAD`, `tag = null`). Tag format
  `YYYYMMDD-HHmmss` in UTC: sortable, no collision within a minute.
- Errors never include the command line or the environment.
- `maxBuffer` stays generous but stdout of `fetch`/`push` is discarded.

### `github.ts`
- `createRelease(owner, repo, tag, { name, body })` through `fetch` on
  `POST /repos/{owner}/{repo}/releases`, token in the `Authorization` header. Body template:
  domain, date, trigger, files downloaded/unchanged/deleted, dump size, duration, commit.
  Returns the release URL. Failure is a warning, the backup stays `success`.
- Token validation for the Settings page: `GET /user` and `GET /repos/{owner}/{repo}` on one
  configured site.

### `remote/client.ts`
```ts
interface RemoteEntry { path: string; type: 'file' | 'dir'; size: number; mtime: Date | null }
interface RemoteClient {
  connect(): Promise<void>
  list(dir: string): Promise<RemoteEntry[]>
  download(remotePath: string, localPath: string): Promise<void>
  upload(content: Buffer, remotePath: string): Promise<void>
  remove(remotePath: string): Promise<void>
  close(): Promise<void>
}
interface RemoteClientFactory { create(): Promise<RemoteClient>; poolSize: number }
```
- `ftp.ts`: basic-ftp, passive IPv4, connection timeout, pool size 5, `mtime` from MLSD when
  available otherwise `null`.
- `sftp.ts`: ssh2-sftp-client, password auth, `readyTimeout`, `keepaliveInterval` 10 s.
  `mtime = new Date(item.modifyTime)` (already milliseconds; the current `* 1000` re-downloads
  every file on every run). One connection, 5 parallel transfers over it.

### `sync.ts`
- `scanRemote(factory, rootDir, signal, log)`: BFS with a worker pool. Returns
  `{ files: RemoteEntry[], listErrors: number }`.
- `planSync(localRoot, files, mode)`: `mode = 'incremental' | 'full'`. Incremental keeps the
  current size + mtime comparison with the 2 s tolerance. Full marks everything to download.
- `downloadFiles(factory, plan, signal, log)`: parallel workers, per-file failures counted
  and logged, checks `signal` between files.
- `deleteOrphans(localRoot, remoteSet, preserved)`: **skipped entirely when
  `listErrors > 0`**, with a warning. Full mode calls it with an empty set before downloading
  instead of the `.git` move-around dance in `cleanup.js`.
- Path safety: `isSafePath` kept, applied to every entry.
- The dump file is excluded from the sync (it is handled by `dump.ts`).

### `dump.ts`
- Generates a 32-byte token. Uploads `sha256(token)` as `.dewwwe-backup-token` and the PHP
  script, both from a `Buffer` (no temp file under `helpers/`).
- HTTP call with `axios`: token in header `X-Backup-Token`, `timeout` 10 min,
  `maxRedirects: 0`, `validateStatus: () => true`, response body truncated to 500 chars in
  error messages.
- Downloads the dump **immediately** to `<localRoot>/db.sql` (stable name, diffable history),
  validates size and SQL header, deletes the remote dump. Total exposure window on the
  webroot drops from minutes to seconds.
- `finally`: removes remote PHP and token file whatever happened (cancel included).

### `helpers/backup-wp.php`
- Compares `hash_equals(file_get_contents(tokenFile), hash('sha256', header))`. Reading the
  token file over HTTP gives nothing useful.
- `MYSQL_PWD` passed through `putenv()` instead of `--password=` (not visible in `ps`).
- `function_exists('exec')` and `is_readable('wp-config.php')` checked first, explicit JSON
  error codes: `exec_disabled`, `no_wp_config`, `mysqldump_failed`.
- Still self-deletes and deletes the token file.

### `backup.ts` (orchestrator)
```ts
runBackup(site: SiteConfig, github: GithubConfig, sharepoint: SharePointConfig | null,
          options: { fullDownload, skipGit, signal, onLog }): Promise<BackupResult>
```
Steps, each a function, each checking `signal`:
1. `ensureRepo`
2. cleanup leftovers on the remote (`db_*.sql`, token, PHP) and in the local tree
   (legacy `.github/workflows/auto-tagged-release.yml`, legacy `db_*.sql`)
3. dump: upload, trigger, download `db.sql`, remote delete
4. sync files (incremental or full)
5. commit + tag + push (unless `skipGit`)
6. GitHub Release on the tag (warning on failure)
7. SharePoint update **only if status is `success`**
`finally`: remote cleanup, close clients.
`BackupResult.status` is the single source of truth; the queue copies it as-is.

### `sharepoint.ts`
- Certificate read from `SP_CERT_DIR/key.pem`. PnP v4. Non-blocking on failure (warning).

### Tests (vitest)
- `sync.test.ts`: planSync and deleteOrphans on a temp directory, including the
  `listErrors > 0` guard.
- `git.test.ts`: tag format, "nothing to commit" path, on a temp bare repo.
- `crypto.test.ts`: round trip, wrong key, malformed prefix.
- `validation.test.ts`: site schema (domain, repo, repoUrl, cron).

### Real-site checks still pending (as of 2026-09-04)

Verified on dewwwe.com (FTP): skip-git run, full run with commit, tag, push and Release, cancel during the scan. Not verified yet, to do before the Docker rollout of Phase 5: full download mode, an SFTP site (never proven to work in v1 either), the SharePoint update with PnP v4 (certificate to move under `DATA_DIR/sp-certificates/`), the six other sites once each, and a run with nothing changed ("Nothing to commit" path).

## Phase 3 — Jobs: queue, scheduler, boot

### `jobs/queue.ts`
- `enqueue(siteId, options)`: rejects with 409 if a `pending` or `running` Backup exists for
  the site (checked in the DB, not in memory). Creates the Backup row with status `pending`
  and returns its id.
- Worker loop with `Settings.concurrency`. On start: `status = running`, `startedAt`. On end:
  copies `BackupResult` fields, `status = result.status`.
- Log lines buffered in memory only while the job runs, flushed to `Backup.log` at the end,
  buffer dropped. `events.emit('log', { backupId, entry })` and `events.emit('done', ...)`.
- `cancel(backupId)`: pending → `cancelled` immediately; running → `AbortController.abort()`,
  status set by the engine result (not forced from the queue).

### `jobs/scheduler.ts`
- `reload()`: stops all tasks, reads enabled sites, one `cron.schedule` per site using
  `site.cronSchedule ?? settings.defaultCron`, timezone from `TZ`. Called after every site or
  settings mutation.
- Cron expressions validated with `cron.validate` in `validation.ts`.

### `instrumentation.ts`
- Runs only when `process.env.NEXT_RUNTIME === 'nodejs'`.
- Fails fast if `ENCRYPTION_KEY` or `SESSION_SECRET` is missing in production.
- Sweeps Backup rows left in `pending`/`running`: `status = error`,
  `errorMessage = "Interrupted by server restart"`.
- Starts the scheduler and a daily retention task (`deleteMany` older than
  `Settings.retentionDays`, always keeping the last 5 per site).

### Done (2026-09-04) and deviations from the plan

- `enqueue` serializes the conflict check and the insert with an in-process lock instead of a database transaction: the app is a single process, and it keeps the queue off Prisma interactive transactions on the single-connection better-sqlite3 adapter.
- The worker loop is `dispatch()`, re-entered after every enqueue and every completion. The job is in memory before the claim (so a cancel in that window aborts it) and leaves memory before `done` is emitted. A `status` event carries the `pending → running` transition with the claim time.
- SSE consumers go through `subscribe(backupId, listeners)`: listeners and buffer in the same tick, then the route re-reads the row, since every final status is written before `done` is emitted. A finished backup gets its stored log replayed (`parseLog` in `lib/engine/logger.ts`).
- Queue, scheduler and boot state sit on `globalThis` in every environment, not only in development: the boot hook and the route bundles of a production build may not share a module instance. A second `boot()` in the same process skips the orphan sweep.
- `cancel` is answered by the queue before the row is looked up, so a run whose site was deleted (cascade) stays cancellable.
- `getSettings()` is a read with a one-time `create`, not an `upsert` (which took a write transaction on every call).
- `jobId` is gone. The routes keep their Phase 2 URLs (`/api/backups/run/[id]`, `cancel/[jobId]`, `logs/[jobId]`, `status`) but the parameter is the Backup id; Phase 4 renames them.
- `scheduler.reload()` is called by the site routes. The settings route does not exist yet, it comes with Phase 4 and must call it too. `stop()` and `scheduledSiteIds()` exist for tests and the boot log.
- Boot logic lives in `lib/jobs/boot.ts` so it can be tested; `instrumentation.ts` only guards `NEXT_RUNTIME` and imports it dynamically. Retention runs once at boot, then daily at 04:00 `TZ`; it keeps the last 5 per site and never deletes an active row. Missing secrets throw in production and only warn elsewhere.
- Tests that need a real SQLite database go through `lib/testing/db.ts` (temp `DATA_DIR`, migrations replayed).

## Phase 4 — API and UI

### Auth
- `lib/auth.ts`: `hashPassword` / `verifyPassword` (bcryptjs), `createSession(user)` →
  JWT (`jose`, HS256 with `SESSION_SECRET`, 7 days) in an `httpOnly`, `sameSite=lax`, `secure`
  cookie; `getCurrentUser()` for server components and route handlers.
- `proxy.ts` (Next 16 name for middleware): no user in `User` table → redirect everything to
  `/setup`; no session → redirect pages to `/login`, return 401 on `/api/*`.
  `/setup`, `/login`, `/api/auth/*` are public.
- Roles are checked in one helper (`requireRole('admin')`) called by mutating routes, so
  adding a `viewer` role later touches no route logic.

### First-run setup
- On every request `proxy.ts` checks whether the `User` table is empty (result cached in
  memory, invalidated when the first user is created). While empty, every page redirects to
  `/setup` and every API route except `/api/auth/setup` returns 503 `{ error: "setup_required" }`.
- `/setup` page: email, password, password confirmation. Rules enforced by zod on both sides:
  valid email, 12 characters minimum. Submits to `POST /api/auth/setup`, which creates the
  user with role `admin`, opens a session and redirects to `/settings` so the GitHub token and
  SharePoint config get filled in right away.
- Once a user exists, `/setup` and `/api/auth/setup` answer 403 permanently. No env-based
  admin password, no default credentials.
- Password change for the current user lives in the Settings page ("Account" section:
  current password, new password, confirmation). Password reset without the old one is done
  by the operator with `npx tsx scripts/reset-password.ts <email>` inside the container.
- Lost-access recovery: same script. It is the only way in without a valid password, on
  purpose.

### API

| Method | Route | Notes |
|--------|-------|-------|
| POST | `/api/auth/setup` | creates the first admin, 403 once a user exists |
| POST | `/api/auth/login` | `{ email, password }` → session cookie |
| POST | `/api/auth/logout` | |
| GET / POST | `/api/sites` | list (no secrets) / create (zod) |
| GET / PUT / DELETE | `/api/sites/[id]` | detail without secrets; PUT keeps the password when the field is empty |
| POST | `/api/sites/[id]/test` | connect + list webroot, 15 s timeout, returns `{ ok, entries, error }` |
| GET | `/api/backups` | paginated, `?siteId=&status=&page=&pageSize=` |
| POST | `/api/backups` | `{ siteIds?: number[], fullDownload?, skipGit? }`; omitted `siteIds` = all enabled sites; returns created ids and per-site 409s |
| GET | `/api/backups/[id]` | detail including log |
| POST | `/api/backups/[id]/cancel` | |
| GET | `/api/backups/[id]/stream` | SSE: replay + live lines, `done` event carries the final status |
| GET | `/api/status` | `{ running: [...], pending: [...] }` |
| GET / PUT | `/api/settings` | secrets returned as `"••••••"`; PUT ignores masked values |
| POST | `/api/settings/test-github` | validates the token and repo access |

Every handler: `await params`, `parseInt` guarded, body parsed with zod, errors as
`{ error: string }` without internal messages.

### UI
- `app/layout.tsx` becomes a server component with `metadata`; the sidebar moves to
  `components/Sidebar.tsx` (client) and shows the current user with a logout action. All
  internal links use `<Link>`.
- One `useJobStatus()` hook (polling `/api/status` every 3 s, single instance through a
  context provider) replaces the three independent pollers. `router.refresh()` only on
  running → idle transition.
- `LogModal`: statuses come from the server (`pending`, `running`, `success`, `error`,
  `cancelled`), no client-side remapping. `done` event closes the stream with the real status.
  Release link shown next to the commit when present.
- History page: pagination and site/status filters backed by `/api/backups`.
- Settings page: GitHub (owner, email, token with "Test" button), SharePoint, schedule,
  concurrency, retention. Secrets masked with a reveal-on-edit field.
- Commit identity configurable globally: new `Settings.githubName` column (migration), "Commit author" fields (name + email) in the GitHub section of Settings. `GithubConfig` gains `name`, `git.ts` drops the hard-coded `AUTHOR_NAME` constant and uses it, falling back to `WP Backup Manager` when the setting is empty. Per-site override is listed under Later.
- Site form: "Use global schedule" maps to `cronSchedule = null`; "Test connection" button.
- Setup and login pages.
- Props typed from Prisma types (`Site`, `Backup`); no `any`.

## Phase 5 — Docker and NAS deployment

- `Dockerfile`, multi-stage, base image pinned (`node:24.x-bookworm-slim`, exact tag).
  Builder installs build tools for better-sqlite3, runs `prisma generate` and `next build`.
  Runner installs `git` only, copies `.next/standalone`, `.next/static`, `public`, `prisma/`,
  `helpers/`.
- `docker-entrypoint.sh`: `prisma migrate deploy` then `node server.js`.
- `docker-compose.yml`: dedicated `/29` subnet, volume `/volume1/docker/wp-backup/data:/data`,
  env from `.env`, `restart: unless-stopped`. No SSH mount needed.
- `.dockerignore`: `node_modules`, `.next`, `data`, `files`, `.git`.
- Rollout: `/setup` to create the admin, import the 7 sites with `import-config.ts`, move the
  existing `files/*` clones into `/data/files/` (the engine resets their remote URL on first
  run), configure the GitHub token in Settings, run one site manually, then all, then enable
  the scheduler.
- Manual tasks at rollout: revoke the current GitHub token and create a fine-grained one
  (Contents read/write + Metadata read on the backup repos), rotate the FTP/SFTP passwords,
  regenerate the SharePoint certificate, verify every backup repo is private, restore the
  developer's global git identity on the Mac (`git config --global user.name/email`).

---

## Later (not detailed yet)

- **Repo history retention**: keep the last N Releases per site and drop older snapshots.
  Deleting tags and Releases alone does not free space on GitHub; reclaiming it means
  re-rooting the branch (new orphan commit from the current tree, force push, GitHub runs gc
  later). Needs a setting per site and a dry-run report before the first real run.
- **Hack detection**: PHP in `wp-content/uploads`, suspicious patterns, core checksum
  verification via `api.wordpress.org`. Adds `hackAlert`/`hackDetails` columns by migration.
- **Notifications**: SMTP settings, `nodemailer`, templates for success/failure/hack, daily
  digest. Discord/Slack webhooks.
- **Restore**: pick a Release/tag, upload files via FTP/SFTP, `restore-db.php` with the same
  token scheme, automatic pre-restore backup.
- **Multi-user**: users page in Settings, invitations, `viewer` role enforced through
  `requireRole`.
- **Per-site commit identity**: optional `Site.commitName` / `Site.commitEmail` overriding the global identity from Settings (useful when a client's backup repo must show the client's own author). Site form gets an "Override commit author" toggle; `lib/db.ts` merges site → settings → default when building the `GithubConfig`.
- **Repo auto-creation** from the site form through the GitHub API (private repo, README).
- **API tokens** for external triggers (webhooks, curl) without a browser session.
- **SSH remotes** as an alternative to the HTTPS token (app-generated key shown in Settings).
- **Restic backend** instead of git (deduplication, encryption, retention).
- **WP-CLI dump** for sites with SSH access.
- **Prestashop / Drupal** dump scripts, project rename to `site-backup-manager`.
- **Diff viewer** between two backups, size tracking and storage alerts.
- **File explorer**: browse the tree of a given backup (Release/tag) from the UI, view or download a single file, entry point for a per-file restore. Read from the local clone via `git ls-tree` / `git show`, no extra storage.
- **Structured logs**: log lines carry a level and a step (scan, download, dump, commit, push, sharepoint), the live log modal and the backup detail page get level filters and a per-step timeline with durations. Inspired by the DBackup dashboard.
- **Integration tests** against a local FTP/SFTP container.

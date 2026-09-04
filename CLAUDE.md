# WP Backup Manager — project instructions

Self-hosted backup manager for WordPress sites: pulls files over FTP/SFTP, dumps the database, versions everything in a GitHub repo. Next.js web UI to manage sites, run backups, follow logs and schedule them.

## State of the rewrite

Working branch is `v2`. [PLAN.md](./PLAN.md) is the source of truth for scope and ordering — check which phase covers a feature before proposing it.

- Phases 0, 1 and 2a are committed.
- Phase 2b is the current work: `dump.ts`, `sharepoint.ts` (PnP v4), `backup.ts` orchestrator, rewiring `lib/queue.js` onto the new engine, deleting the v1 files.

## Two engines coexist right now

- `lib/engine/*.ts` — the v2 engine. All new engine code goes here.
- `lib/backup.js`, `cleanup.js`, `ftp.js`, `queue.js`, `sftp.js`, `sp.js`, `sync.js` — **v1, still wired behind `queue.js` until 2b lands.** Do not extend these; they get deleted. Known v1 issues (shell injection, token in the clone URL, `git config --global`, SFTP re-downloading everything) are already fixed in `lib/engine` — don't re-fix them in the v1 files.

## Layout

- `app/` — Next.js 16 App Router (pages + `api/` routes)
- `components/` — React components, `components/ui` is shadcn
- `lib/` — `db.ts`, `prisma.ts`, `crypto.ts`, `validation.ts` (zod), `paths.ts`
- `prisma/` — schema and migrations
- `helpers/backup-wp.php` — dropped on the remote host to dump the database
- `scripts/` — one-off `tsx` scripts

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run format      # prettier --write .
```

Run `typecheck` and `test` yourself after changing engine or lib code. Anything with a side effect — `build`, `dev`, `db:migrate`, `db:deploy`, `npm install` — propose the command, don't run it.

There is no ESLint here on purpose: `eslint-config-next` pulls in typescript-eslint, which refuses to load under TypeScript 7 ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)) — the guard is in `@typescript-eslint/parser` too, so no TS parser is available at all. Prettier handles formatting and `tsc --strict` covers most of what the rules would catch. Don't re-add ESLint until that issue lands.

## Conventions

- 4-space indent, single quotes, semicolons — Prettier enforces it.
- Never hard-wrap prose at a fixed width, in markdown or in comments. One paragraph is one line.
- Code, identifiers, comments and **UI labels** in English.
- Imports use the `@/*` alias, not relative paths (`importModuleSpecifier: non-relative`).
- Dates stored as ISO 8601 UTC.
- Stored credentials are encrypted as `enc:v1:<iv>:<tag>:<data>` via `lib/crypto.ts` — never write a secret to the database in clear.
- All runtime state lives under `DATA_DIR` (env var, falls back to `cwd/data`). Never build paths from `__dirname` — it breaks the Docker standalone build.
- Tests are vitest, colocated as `*.test.ts` next to the module.

## Do not touch

`.env`, `data/`, `files/`, `sp-certificates/` hold live secrets and 7 sites' worth of real backups. They are gitignored and denied in `.claude/settings.json`.

## Working style

- One phase per session, one commit at the end. Run `/code-review` before that commit.
- Never commit or push — propose the message and the `git add` command, Louis commits.
- Don't add a dependency without asking first.

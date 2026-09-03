import fs from 'node:fs';
import path from 'node:path';

/**
 * Root directory for everything the app persists: database, site clones, certificates.
 * Set with the DATA_DIR env var (absolute path recommended in Docker). Defaults to ./data
 * relative to the working directory, never to the source tree, so the standalone build
 * behaves the same as `next dev`.
 *
 * Exposed as functions, not constants: the value is read when called, so callers that load
 * a .env file at startup (Prisma CLI, tsx scripts) get the right directory regardless of
 * import order.
 */
export function dataDir(): string {
    return path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));
}

/** Local git clones of the backup repositories, one folder per site (`<repo>`). */
export function filesDir(): string {
    return path.join(dataDir(), 'files');
}

/** SQLite database file. */
export function dbPath(): string {
    return path.join(dataDir(), 'backup.db');
}

/**
 * Database URL for Prisma (CLI, Studio and the better-sqlite3 adapter).
 * The `file://` form with an absolute path is the one every Prisma tool parses the same way:
 * Studio identifies the protocol on `://`, and the adapter strips `file:` and hands the
 * remaining `///abs/path` to SQLite, which collapses the leading slashes.
 */
export function dbUrl(): string {
    return `file://${dbPath()}`;
}

/** SharePoint app-only certificate directory (`key.pem`). */
export function spCertDir(): string {
    return path.join(dataDir(), 'sp-certificates');
}

/** Creates the data directories if they do not exist. Called once at boot. */
export function ensureDataDirs(): void {
    for (const dir of [dataDir(), filesDir(), spCertDir()]) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

import fs from 'node:fs';
import path from 'node:path';

/**
 * Root directory for everything the app persists: database, site clones, certificates.
 * Set with the DATA_DIR env var (absolute path recommended in Docker). Defaults to ./data
 * relative to the working directory, never to the source tree, so the standalone build
 * behaves the same as `next dev`.
 */
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));

/** Local git clones of the backup repositories, one folder per site (`<repo>`). */
export const FILES_DIR = path.join(DATA_DIR, 'files');

/** SQLite database file. */
export const DB_PATH = path.join(DATA_DIR, 'backup.db');

/** SharePoint app-only certificate (`key.pem`). */
export const SP_CERT_DIR = path.join(DATA_DIR, 'sp-certificates');

/** Creates the data directories if they do not exist. Called once at boot. */
export function ensureDataDirs(): void {
    for (const dir of [DATA_DIR, FILES_DIR, SP_CERT_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

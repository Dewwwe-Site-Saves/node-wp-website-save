import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Throwaway SQLite database for tests that run Prisma for real. Points `DATA_DIR` at a temp directory, loads the client, replays the migrations. Call it at the top of the test file before importing anything that touches the database (dynamic imports only after this).
 */
export async function setupTestDatabase() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-backup-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.ENCRYPTION_KEY ??= 'ab'.repeat(32);

    const { prisma } = await import('../prisma');

    const root = path.join(process.cwd(), 'prisma', 'migrations');
    const dirs = fs
        .readdirSync(root)
        .filter((name) => fs.statSync(path.join(root, name)).isDirectory())
        .sort();
    for (const dir of dirs) {
        const sql = fs.readFileSync(path.join(root, dir, 'migration.sql'), 'utf8');
        for (const statement of sql.split(';')) {
            if (statement.trim()) await prisma.$executeRawUnsafe(statement);
        }
    }

    return {
        prisma,
        dataDir,
        async cleanup() {
            await prisma.$disconnect();
            fs.rmSync(dataDir, { recursive: true, force: true });
        },
    };
}

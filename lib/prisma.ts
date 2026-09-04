import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/client';
import { dbUrl, ensureDataDirs } from './paths';

// Cached on globalThis so `next dev` hot reloads reuse one connection instead of leaking them.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
    ensureDataDirs();
    const adapter = new PrismaBetterSqlite3({ url: dbUrl() }, { timestampFormat: 'iso8601' });
    return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

/**
 * One-time database setup: WAL journal for concurrent readers during backups, foreign keys
 * enforced (SQLite defaults to off). Called at boot and by scripts.
 */
export async function initDatabase(): Promise<void> {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON');
}

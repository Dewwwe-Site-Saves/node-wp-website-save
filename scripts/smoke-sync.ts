/**
 * Debug helper: exercises the remote clients and the sync planner against a real site from the local database, without writing anything on the remote and, by default, nothing locally either.
 *
 *   npx tsx scripts/smoke-sync.ts <domain>                 list + plan against files/<repo> (read-only)
 *   npx tsx scripts/smoke-sync.ts <domain> --local <dir>   compare against another local tree
 *   npx tsx scripts/smoke-sync.ts <domain> --sync <dir>    real incremental sync into <dir> (downloads)
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { getSiteConfig } from '../lib/db';
import { createLogger } from '../lib/engine/logger';
import { createRemoteFactory, remoteRootDir } from '../lib/engine/remote';
import { planSync, scanRemote, syncFiles } from '../lib/engine/sync';
import { initDatabase, prisma } from '../lib/prisma';

try {
    process.loadEnvFile('.env');
} catch {
    // .env is optional, variables may come from the environment
}

const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { local: { type: 'string' }, sync: { type: 'string' } },
});
const domain = positionals[0];
if (!domain) {
    console.error('Usage: npx tsx scripts/smoke-sync.ts <domain> [--local <dir>] [--sync <dir>]');
    process.exit(1);
}

await initDatabase();
const row = await prisma.site.findUnique({ where: { domain }, select: { id: true } });
const site = row ? await getSiteConfig(row.id) : null;
if (!site) {
    console.error(`Unknown site: ${domain}`);
    process.exit(1);
}

const log = createLogger(`[${site.domain}]`, (entry) =>
    console.log(`${entry.time} [${entry.level}] ${entry.msg}`),
);
const factory = createRemoteFactory(site);
const rootDir = remoteRootDir(site);
console.log(
    `${site.protocol.toUpperCase()} ${site.host}:${site.port}, remote root ${rootDir}, pool ${factory.poolSize}`,
);

if (values.sync) {
    const stats = await syncFiles(factory, path.resolve(values.sync), rootDir, {
        mode: 'incremental',
        log,
    });
    console.log(stats);
} else {
    const localRoot = path.resolve(values.local ?? path.join('files', site.repo));
    const clients = await Promise.all(
        Array.from({ length: factory.poolSize }, () => factory.create()),
    );
    try {
        const started = Date.now();
        const { files, listErrors } = await scanRemote(clients, rootDir, log);
        const plan = planSync(localRoot, files, 'incremental');
        console.log({
            scanned: files.length,
            listErrors,
            withoutMtime: files.filter((f) => f.mtime === null).length,
            toDownload: plan.toDownload.length,
            unchanged: plan.unchanged,
            localRoot,
            scanSeconds: Math.round((Date.now() - started) / 1000),
        });
        for (const entry of plan.toDownload.slice(0, 20))
            console.log(`  would download ${entry.path} (${entry.size} B)`);
        if (plan.toDownload.length > 20)
            console.log(`  ... and ${plan.toDownload.length - 20} more`);
    } finally {
        await Promise.allSettled(clients.map((client) => client.close()));
    }
}

await prisma.$disconnect();

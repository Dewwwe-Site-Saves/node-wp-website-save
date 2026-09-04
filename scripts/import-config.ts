/**
 * One-off import of the legacy v1 config.json into the database.
 *
 *   npx tsx scripts/import-config.ts [path/to/config.json]
 *
 * Existing domains are skipped, so the script can be re-run safely. Delete config.json once
 * the import is verified: it holds every password in cleartext.
 */
import fs from 'node:fs';
import path from 'node:path';
import { assertEncryptionKey, encrypt } from '../lib/crypto';
import { initDatabase, prisma } from '../lib/prisma';
import { siteCreateSchema } from '../lib/validation';

try {
    process.loadEnvFile('.env');
} catch {
    // .env is optional, variables may come from the environment
}

interface LegacySite {
    repo: string;
    repoUrl: string;
    ftp: {
        webRootPath?: string;
        host: string;
        user: string;
        password: string;
        port?: number;
        sftp?: boolean;
    };
    spListItemID?: string;
}

interface LegacyConfig {
    github?: { user?: string; appPass?: string; mail?: string };
    sharepoint?: {
        tenantID?: string;
        applicationClientID?: string;
        certificateThumbprint?: string;
        tenantName?: string;
        siteName?: string;
        listName?: string;
        dateFieldName?: string;
    };
    sites: Record<string, LegacySite>;
}

/** git@github.com:o/r.git and https://user:token@github.com/o/r.git → https://github.com/o/r.git */
function normalizeRepoUrl(url: string): string {
    const ssh = url.match(/^git@github\.com:(.+?)(\.git)?$/);
    if (ssh) return `https://github.com/${ssh[1]}.git`;
    try {
        const parsed = new URL(url);
        parsed.username = '';
        parsed.password = '';
        return parsed.toString();
    } catch {
        return url;
    }
}

async function main(): Promise<void> {
    assertEncryptionKey();

    const configPath = path.resolve(process.argv[2] ?? 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as LegacyConfig;

    await initDatabase();

    // Settings (singleton). Only fills what the legacy config provides, never overwrites
    // values already set in the UI.
    const current = await prisma.settings.findUnique({ where: { id: 1 } });
    await prisma.settings.upsert({
        where: { id: 1 },
        create: {
            id: 1,
            githubEmail: config.github?.mail ?? null,
            githubTokenEnc: config.github?.appPass ? encrypt(config.github.appPass) : null,
            spTenantId: config.sharepoint?.tenantID ?? null,
            spClientId: config.sharepoint?.applicationClientID ?? null,
            spCertThumbprint: config.sharepoint?.certificateThumbprint ?? null,
            spTenantName: config.sharepoint?.tenantName ?? null,
            spSiteName: config.sharepoint?.siteName ?? null,
            spListName: config.sharepoint?.listName ?? null,
            spDateField: config.sharepoint?.dateFieldName ?? null,
        },
        update: {
            githubEmail: current?.githubEmail ?? config.github?.mail ?? null,
            githubTokenEnc:
                current?.githubTokenEnc ??
                (config.github?.appPass ? encrypt(config.github.appPass) : null),
            spTenantId: current?.spTenantId ?? config.sharepoint?.tenantID ?? null,
            spClientId: current?.spClientId ?? config.sharepoint?.applicationClientID ?? null,
            spCertThumbprint:
                current?.spCertThumbprint ?? config.sharepoint?.certificateThumbprint ?? null,
            spTenantName: current?.spTenantName ?? config.sharepoint?.tenantName ?? null,
            spSiteName: current?.spSiteName ?? config.sharepoint?.siteName ?? null,
            spListName: current?.spListName ?? config.sharepoint?.listName ?? null,
            spDateField: current?.spDateField ?? config.sharepoint?.dateFieldName ?? null,
        },
    });
    console.log('Settings imported');

    let created = 0;
    let skipped = 0;
    let invalid = 0;

    for (const [domain, legacy] of Object.entries(config.sites)) {
        const existing = await prisma.site.findUnique({ where: { domain } });
        if (existing) {
            console.log(`  skip    ${domain} (already exists)`);
            skipped++;
            continue;
        }

        const parsed = siteCreateSchema.safeParse({
            domain,
            repo: legacy.repo,
            repoUrl: normalizeRepoUrl(legacy.repoUrl),
            protocol: legacy.ftp.sftp ? 'sftp' : 'ftp',
            host: legacy.ftp.host,
            port: legacy.ftp.port ?? (legacy.ftp.sftp ? 22 : 21),
            username: legacy.ftp.user,
            password: legacy.ftp.password,
            webRootPath: legacy.ftp.webRootPath ?? 'www',
            spListItemId: legacy.spListItemID ?? null,
            cronSchedule: null,
            enabled: true,
        });

        if (!parsed.success) {
            console.log(`  invalid ${domain}:`);
            for (const issue of parsed.error.issues) {
                console.log(`            ${issue.path.join('.')}: ${issue.message}`);
            }
            invalid++;
            continue;
        }

        const { password, ...site } = parsed.data;
        await prisma.site.create({ data: { ...site, passwordEnc: encrypt(password) } });
        console.log(`  created ${domain}`);
        created++;
    }

    console.log(`\nDone: ${created} created, ${skipped} skipped, ${invalid} invalid`);
    if (created > 0) {
        console.log('Verify the sites in the UI, then delete config.json.');
    }
    await prisma.$disconnect();
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});

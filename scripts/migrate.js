/**
 * Migration script: config.json → SQLite
 * Run once: npm run migrate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, createSite, setSetting, getAllSites } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '..', 'config.json');

if (!fs.existsSync(configPath)) {
    console.log('No config.json found, nothing to migrate.');
    process.exit(0);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = getDb();

// Check if already migrated
const existing = getAllSites();
if (existing.length > 0) {
    console.log(`Database already contains ${existing.length} sites. Skipping migration.`);
    console.log('To re-migrate, delete data/backup.db and run again.');
    process.exit(0);
}

console.log('Migrating config.json → SQLite...\n');

// Migrate GitHub settings
if (config.github) {
    if (config.github.user) setSetting('github_user', config.github.user);
    if (config.github.appPass) setSetting('github_token', config.github.appPass);
    if (config.github.mail) setSetting('github_email', config.github.mail);
    console.log('  GitHub settings migrated');
}

// Migrate SharePoint settings
if (config.sharepoint) {
    const sp = config.sharepoint;
    if (sp.tenantID) setSetting('sp_tenant_id', sp.tenantID);
    if (sp.applicationClientID) setSetting('sp_client_id', sp.applicationClientID);
    if (sp.certificateThumbprint) setSetting('sp_cert_thumbprint', sp.certificateThumbprint);
    if (sp.tenantName) setSetting('sp_tenant_name', sp.tenantName);
    if (sp.siteName) setSetting('sp_site_name', sp.siteName);
    if (sp.listName) setSetting('sp_list_name', sp.listName);
    if (sp.dateFieldName) setSetting('sp_date_field', sp.dateFieldName);
    console.log('  SharePoint settings migrated');
}

// Migrate sites
for (const [domain, site] of Object.entries(config.sites)) {
    createSite({
        domain,
        repo: site.repo,
        repo_url: site.repoUrl,
        protocol: site.ftp.sftp ? 'sftp' : 'ftp',
        host: site.ftp.host,
        port: site.ftp.port || (site.ftp.sftp ? 22 : 21),
        username: site.ftp.user,
        password: site.ftp.password,
        web_root_path: site.ftp.webRootPath || 'www',
        ssh_key_path: null,
        sp_list_item_id: site.spListItemID || null,
        cron_schedule: '0 3 * * *',
        enabled: 1,
    });
    console.log(`  Site migrated: ${domain}`);
}

const sites = getAllSites();
console.log(`\nMigration complete: ${sites.length} sites, settings saved to data/backup.db`);

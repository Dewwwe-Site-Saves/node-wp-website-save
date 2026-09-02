import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data', 'backup.db');

let _db = null;

export function getDb() {
    if (_db) return _db;

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');

    // Create tables if they don't exist
    _db.exec(`
        CREATE TABLE IF NOT EXISTS sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT UNIQUE NOT NULL,
            repo TEXT NOT NULL,
            repo_url TEXT NOT NULL,
            protocol TEXT NOT NULL DEFAULT 'ftp',
            host TEXT NOT NULL,
            port INTEGER DEFAULT 21,
            username TEXT NOT NULL,
            password TEXT,
            web_root_path TEXT DEFAULT 'www',
            ssh_key_path TEXT,
            sp_list_item_id TEXT,
            cron_schedule TEXT DEFAULT '0 3 * * *',
            enabled INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS backups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id INTEGER REFERENCES sites(id),
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            duration_ms INTEGER,
            files_downloaded INTEGER,
            files_unchanged INTEGER,
            files_deleted INTEGER,
            dump_size_bytes INTEGER,
            commit_sha TEXT,
            error_message TEXT,
            hack_alert INTEGER DEFAULT 0,
            hack_details TEXT,
            log TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    // Add columns that may not exist in older databases
    const addColumn = (table, column, type) => {
        try { _db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); } catch { /* already exists */ }
    };
    addColumn('backups', 'trigger_type', 'TEXT DEFAULT "manual"');
    addColumn('backups', 'options', 'TEXT');

    return _db;
}

// Site queries
export function getAllSites() {
    return getDb().prepare('SELECT * FROM sites ORDER BY domain').all();
}

export function getSiteById(id) {
    return getDb().prepare('SELECT * FROM sites WHERE id = ?').get(id);
}

export function getSiteByDomain(domain) {
    return getDb().prepare('SELECT * FROM sites WHERE domain = ?').get(domain);
}

export function createSite(site) {
    const stmt = getDb().prepare(`
        INSERT INTO sites (domain, repo, repo_url, protocol, host, port, username, password, web_root_path, ssh_key_path, sp_list_item_id, cron_schedule, enabled)
        VALUES (@domain, @repo, @repo_url, @protocol, @host, @port, @username, @password, @web_root_path, @ssh_key_path, @sp_list_item_id, @cron_schedule, @enabled)
    `);
    return stmt.run(site);
}

export function updateSite(id, site) {
    const stmt = getDb().prepare(`
        UPDATE sites SET domain=@domain, repo=@repo, repo_url=@repo_url, protocol=@protocol, host=@host, port=@port,
        username=@username, password=@password, web_root_path=@web_root_path, ssh_key_path=@ssh_key_path,
        sp_list_item_id=@sp_list_item_id, cron_schedule=@cron_schedule, enabled=@enabled
        WHERE id = @id
    `);
    return stmt.run({ ...site, id });
}

export function deleteSite(id) {
    return getDb().prepare('DELETE FROM sites WHERE id = ?').run(id);
}

// Backup queries
export function getBackups({ siteId, status, limit = 50, offset = 0 } = {}) {
    let query = `
        SELECT b.*, s.domain FROM backups b
        JOIN sites s ON b.site_id = s.id
        WHERE 1=1
    `;
    const params = {};
    if (siteId) { query += ' AND b.site_id = @siteId'; params.siteId = siteId; }
    if (status) { query += ' AND b.status = @status'; params.status = status; }
    query += ' ORDER BY b.started_at DESC LIMIT @limit OFFSET @offset';
    params.limit = limit;
    params.offset = offset;
    return getDb().prepare(query).all(params);
}

export function getBackupById(id) {
    return getDb().prepare(`
        SELECT b.*, s.domain FROM backups b
        JOIN sites s ON b.site_id = s.id
        WHERE b.id = ?
    `).get(id);
}

export function createBackup(backup) {
    const stmt = getDb().prepare(`
        INSERT INTO backups (site_id, started_at, status, trigger_type, options)
        VALUES (@site_id, @started_at, @status, @trigger_type, @options)
    `);
    return stmt.run({
        trigger_type: 'manual',
        options: null,
        ...backup,
    });
}

export function updateBackup(id, data) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    const stmt = getDb().prepare(`UPDATE backups SET ${fields} WHERE id = @id`);
    return stmt.run({ ...data, id });
}

export function getLastBackupPerSite() {
    return getDb().prepare(`
        SELECT s.*, b.status as last_status, b.started_at as last_backup_at,
               b.duration_ms as last_duration_ms, b.commit_sha as last_commit_sha,
               b.error_message as last_error
        FROM sites s
        LEFT JOIN backups b ON b.id = (
            SELECT id FROM backups WHERE site_id = s.id ORDER BY started_at DESC LIMIT 1
        )
        ORDER BY s.domain
    `).all();
}

// Settings queries
export function getSetting(key) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

export function setSetting(key, value) {
    return getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getAllSettings() {
    const rows = getDb().prepare('SELECT * FROM settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/**
 * Build a config object compatible with backupSite() from SQLite data.
 */
export function buildBackupConfig(basePath) {
    const settings = getAllSettings();
    const sites = getAllSites();

    const config = {
        localPath: basePath,
        filesPath: basePath + '/files/',
        github: {
            user: settings.github_user || '',
            appPass: settings.github_token || '',
            mail: settings.github_email || '',
        },
        sites: {},
    };

    // SharePoint config (only if all required fields are present)
    if (settings.sp_tenant_id && settings.sp_client_id) {
        config.sharepoint = {
            tenantID: settings.sp_tenant_id,
            applicationClientID: settings.sp_client_id,
            certificateThumbprint: settings.sp_cert_thumbprint || '',
            tenantName: settings.sp_tenant_name || '',
            siteName: settings.sp_site_name || '',
            listName: settings.sp_list_name || '',
            dateFieldName: settings.sp_date_field || '',
        };
    }

    for (const site of sites) {
        config.sites[site.domain] = {
            repo: site.repo,
            repoUrl: site.repo_url,
            ftp: {
                webRootPath: site.web_root_path,
                host: site.host,
                user: site.username,
                password: site.password,
                port: site.port,
                sftp: site.protocol === 'sftp',
            },
            spListItemID: site.sp_list_item_id || null,
        };
    }

    return config;
}

import fs from 'fs';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import Sftp from './sftp.js';
import Ftp from './ftp.js';
import Sp from './sp.js';
import Cleanup from './cleanup.js';

const execPromise = util.promisify(exec);

/**
 * Creates a logger that captures output in a buffer while optionally forwarding to console.
 * @param {string} prefix - Prefix for each log line (e.g. "[dewwwe.com]")
 * @param {boolean} quiet - If true, don't forward to console (for parallel runs)
 */
function createLogger(prefix, quiet = false, onLog = null) {
    const lines = [];

    function write(level, ...args) {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const line = `${prefix} ${msg}`;
        const entry = { level, msg: line, time: new Date().toISOString() };
        lines.push(entry);
        if (!quiet) {
            if (level === 'error') console.error(line);
            else if (level === 'warn') console.warn(line);
            else console.log(line);
        }
        if (onLog) onLog(entry);
    }

    return {
        log: (...args) => write('info', ...args),
        error: (...args) => write('error', ...args),
        warn: (...args) => write('warn', ...args),
        getLog: () => lines.map(l => `${l.time} [${l.level}] ${l.msg}`).join('\n'),
        getLines: () => lines,
    };
}

/**
 * Run a backup for a single site.
 * @param {string} domain - Site domain (e.g. 'dewwwe.com')
 * @param {object} config - Full config object (github, sharepoint, sites)
 * @param {object} options
 * @param {string} options.basePath - Base path of the project (__dirname)
 * @param {boolean} options.fullDownload - Force full download instead of incremental
 * @param {boolean} options.quiet - Suppress console output (for parallel runs)
 * @returns {object} Backup result
 */
export async function backupSite(domain, config, options = {}) {
    const { basePath, fullDownload = false, skipGit = false, quiet = false, onLog = null } = options;
    const log = createLogger(`[${domain}]`, quiet, onLog);
    const startedAt = new Date();

    const result = {
        domain,
        status: 'success',
        startedAt,
        finishedAt: null,
        durationMs: 0,
        filesDownloaded: 0,
        filesUnchanged: 0,
        filesDeleted: 0,
        dumpSizeBytes: 0,
        commitSha: null,
        log: '',
        error: null,
    };

    const siteConfig = config.sites[domain];
    if (!siteConfig) {
        result.status = 'error';
        result.error = `No config found for domain: ${domain}`;
        log.error(result.error);
        result.finishedAt = new Date();
        result.durationMs = result.finishedAt - startedAt;
        result.log = log.getLog();
        return result;
    }

    const filesPath = basePath + '/files/';
    const localSitePath = filesPath + siteConfig.repo + '/';
    let connection;

    function createConnection() {
        if (siteConfig.ftp.sftp) {
            return new Sftp(basePath, siteConfig, log);
        } else {
            return new Ftp(basePath, siteConfig, log);
        }
    }

    try {
        // Setup local folders
        const clean = new Cleanup(basePath, siteConfig.repo);
        let mySiteFolderExists = clean.setupFiles();

        // Git pull / clone
        let pullError = false;
        if (mySiteFolderExists) {
            log.log('Pulling ' + siteConfig.repo + '...');
            try {
                await execPromise('cd "' + localSitePath + '" && git pull', { maxBuffer: 1024 * 500000 });
            } catch (error) {
                log.error('Pull failed:', error.message);
                pullError = true;
            }
        }

        if (mySiteFolderExists && pullError) {
            log.log('Pull failed, deleting folder and cloning again...');
            fs.rmSync(localSitePath, { recursive: true, force: true });
            mySiteFolderExists = false;
        }

        if (!mySiteFolderExists || pullError) {
            log.log('Cloning ' + siteConfig.repo + '...');
            const repoUrl = siteConfig.repoUrl;
            let requestUrl;
            if (repoUrl.indexOf('git@') === 0) {
                requestUrl = repoUrl;
            } else {
                requestUrl = repoUrl.replace('https://', 'https://' + config.github.user + ':' + config.github.appPass + '@');
            }
            await execPromise('cd "' + filesPath + '" && git clone ' + requestUrl);
        }

        // Clean up leftover artifacts from previous runs
        connection = createConnection();
        log.log('Cleaning up old backup artifacts...');
        try {
            const remoteFiles = await connection.listFiles();
            const leftovers = remoteFiles.filter(f =>
                f.name.startsWith('db_') && f.name.endsWith('.sql') ||
                f.name === '.dewwwe-backup-token' ||
                f.name === 'dewwwe-backup.php'
            );
            for (const file of leftovers) {
                log.log('  Removing leftover: ' + file.name);
                await connection.deleteFile(file.name);
            }
            if (leftovers.length === 0) log.log('  No leftovers found');
        } catch (error) {
            log.warn('Could not clean up leftovers:', error.message);
        }

        // Generate and upload backup token (unique file per site to avoid conflicts in parallel runs)
        const backupToken = crypto.randomBytes(32).toString('hex');
        const tokenFilePath = basePath + '/helpers/.dewwwe-backup-token-' + domain.replace(/\./g, '-');
        fs.writeFileSync(tokenFilePath, backupToken);

        log.log('Uploading backup token and script...');
        await connection.uploadFile(tokenFilePath, '.dewwwe-backup-token');
        await connection.uploadFile(basePath + '/helpers/backup-wp.php', 'dewwwe-backup.php');
        fs.unlinkSync(tokenFilePath);

        // Trigger database dump
        log.log('Dumping database...');
        let dumpFileName = null;
        try {
            const backupResponse = await axios.get('https://' + domain + '/dewwwe-backup.php?token=' + backupToken);
            const backupData = backupResponse.data;

            if (backupData.status !== 'ok' || !backupData.file) {
                throw new Error('Database dump failed: ' + JSON.stringify(backupData));
            }
            dumpFileName = backupData.file;
            log.log('Database dump successful: ' + dumpFileName);
        } catch (error) {
            try { await connection.deleteFile('dewwwe-backup.php'); } catch (e) { /* may have self-deleted */ }
            try { await connection.deleteFile('.dewwwe-backup-token'); } catch (e) { /* may have been deleted */ }
            throw new Error('Database dump failed: ' + error.message);
        }

        // Download files
        let mustCommitGitignore = false;
        if (fullDownload) {
            log.log('Full download mode...');
            mustCommitGitignore = clean.cleanupSiteFolder();
            await connection.download();
        } else {
            log.log('Incremental download mode...');
            mustCommitGitignore = clean.ensureGitFiles();
            await connection.downloadChanged();
        }

        // Validate dump
        const expectedDumpPath = localSitePath + siteConfig.ftp.webRootPath + '/' + dumpFileName;
        if (!fs.existsSync(expectedDumpPath) || fs.statSync(expectedDumpPath).size < 1024) {
            throw new Error('Downloaded dump file is missing or too small: ' + dumpFileName);
        }
        const dumpHead = fs.readFileSync(expectedDumpPath, { encoding: 'utf8', flag: 'r' }).substring(0, 500);
        if (!dumpHead.includes('CREATE TABLE') && !dumpHead.includes('INSERT INTO') && !dumpHead.includes('MySQL dump') && !dumpHead.includes('mysqldump')) {
            throw new Error('Downloaded dump file does not look like valid SQL');
        }
        result.dumpSizeBytes = fs.statSync(expectedDumpPath).size;
        log.log('Dump file validated: ' + dumpFileName + ' (' + Math.round(result.dumpSizeBytes / 1024) + ' KB)');

        // Clean up dump from remote
        try {
            await connection.deleteFile(dumpFileName);
            log.log('Remote dump file cleaned up');
        } catch (error) {
            log.warn('Could not delete remote dump file:', error.message);
        }

        // Git commit & push & tag
        if (skipGit) {
            log.log('Skipping git commit/push (--no-git)');
        } else {
            log.log('Committing & pushing ' + siteConfig.repo + '...');
            const date = new Date();
            const mm = date.getMonth() + 1;
            const dd = date.getDate();
            const HH = date.getHours();
            const MM = date.getMinutes();
            const dateString = [date.getFullYear() +
                (mm > 9 ? '' : '0') + mm,
                (dd > 9 ? '' : '0') + dd,
                (HH > 9 ? '' : '0') + HH +
                (MM > 9 ? '' : '0') + MM
            ].join('-');

            try {
                const gitSetupcmd = 'git config --global user.email "' + config.github.mail + '" && git config --global user.name "Auto Site Save" && git config --global http.postBuffer 157286400';
                const cdCmd = ' && cd "' + localSitePath + '"';
                let commitGitignore = '';
                if (mustCommitGitignore) {
                    commitGitignore = " && git add '.gitignore' && git commit -m 'adding gitignore' ";
                }
                const commitCmd = " && git add . && git commit -m 'Auto commit " + dateString + "'";
                const tagCmd = ' && git tag ' + dateString.replaceAll('-', '.').replaceAll('.0', '.');
                const pushCmd = ' && git push';
                const pushTagCmd = ' && git push origin ' + dateString.replaceAll('-', '.').replaceAll('.0', '.');
                await execPromise(gitSetupcmd + cdCmd + commitGitignore + commitCmd + tagCmd + pushCmd + pushTagCmd, { maxBuffer: 1024 * 500000 });

                // Extract commit SHA
                try {
                    const { stdout: sha } = await execPromise('cd "' + localSitePath + '" && git rev-parse --short HEAD');
                    result.commitSha = sha.trim();
                } catch (e) { /* non-critical */ }

                log.log('Git push successful' + (result.commitSha ? ' (' + result.commitSha + ')' : ''));
            } catch (error) {
                log.error('Git commit/push failed:', error.message);
                result.status = 'error';
            }
        }

        // Update SharePoint List
        if (!skipGit && config.sharepoint && siteConfig.spListItemID) {
            try {
                const sp = new Sp(basePath, config, log);
                await sp.updateListItem(siteConfig.spListItemID);
                log.log('SharePoint updated');
            } catch (error) {
                log.warn('SharePoint update failed:', error.message);
            }
        }

    } catch (error) {
        log.error('BACKUP FAILED:', error.message);
        result.status = 'error';
        result.error = error.message;
    }

    result.finishedAt = new Date();
    result.durationMs = result.finishedAt - startedAt;
    result.log = log.getLog();

    const elapsed = Math.round(result.durationMs / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const statusLabel = result.status === 'success' ? 'COMPLETE' : 'FAILED';
    log.log(`Backup ${statusLabel} — ${mins}m ${secs}s`);
    result.log = log.getLog();

    return result;
}

/**
 * Run backups for multiple sites with limited concurrency.
 * @param {string[]} domains - List of domains to backup
 * @param {object} config - Full config object
 * @param {object} options
 * @param {string} options.basePath
 * @param {boolean} options.fullDownload
 * @param {number} options.concurrency - Max parallel backups (default: 3)
 * @returns {object[]} Array of backup results
 */
export async function backupMultiple(domains, config, options = {}) {
    const { concurrency = 3, ...siteOptions } = options;
    const results = [];
    const queue = [...domains];

    async function worker() {
        while (queue.length > 0) {
            const domain = queue.shift();
            if (!domain) break;
            const result = await backupSite(domain, config, siteOptions);
            results.push(result);
        }
    }

    // Launch concurrent workers
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, domains.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    return results;
}

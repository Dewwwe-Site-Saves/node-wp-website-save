'use strict';

/************************
 *       Variables      *
 ************************/

let siteDomain;
if (process.argv[2] != undefined) {
    siteDomain = process.argv[2];
} else {
    siteDomain = 'lbi-3d.fr';
}
const fullDownload = process.argv.includes('--full');

const startTime = Date.now();
console.log(`\n=== Backup started: ${siteDomain} — ${new Date().toLocaleString()} ===\n`);

/************************
 *       Imports        *
 ************************/
import fs from 'fs';
import crypto from 'crypto';
import Sftp from './lib/sftp.js';
import Ftp from './lib/ftp.js';
import Sp from './lib/sp.js';
import Cleanup from './lib/cleanup.js';
import { exec } from 'child_process';
import util from "util";
import axios from 'axios';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(
    import.meta.url);

const __dirname = path.dirname(__filename);

const execPromise = util.promisify(exec);

/************************
 *      Load Config     *
 ************************/
let rawConfig = fs.readFileSync('config.json');
let config = JSON.parse(rawConfig);

let siteConfig = config.sites[siteDomain];

// Check config 
if (siteConfig == undefined) {
    let errorMessage = `No config found for this domain (${siteDomain})`;
    console.log(errorMessage);
    process.exit();
    throw new Error(errorMessage);
}

// Upgrade config
config.localPath = __dirname;
config.filesPath = __dirname + '/files/';
config.localSitePath = __dirname + '/files/' + siteConfig.repo + '/';



/************************
 *       Function       *
 ************************/
function ftpConfig() {
    if (siteConfig.ftp.sftp) {
        // console.log("Using sftp");

        return new Sftp(__dirname, siteConfig);
    } else {
        // console.log("Using ftp");
        // Ftp class
        return new Ftp(__dirname, siteConfig);
    }
}

/************************
 *       Exec           *
 ************************/

// Cleanup files (make sure /files/mysite/ exists)
let clean = new Cleanup(__dirname, siteConfig.repo);
let mySiteFolderExists = clean.setupFiles(); // Ensure the exitence of /files/ and /files/repo/.git if /files/repo/ exists

// Git pull / clone
let pullError = false;
if (mySiteFolderExists) {
    console.log('Pulling ' + siteConfig.repo + '...');
    try {
        const { stdout, stderr } = await execPromise('cd "' + config.localSitePath + '" && git pull', { maxBuffer: 1024 * 500000 });
    } catch (error) {
        console.error(error);
        pullError = true;
    }
}

if (mySiteFolderExists && pullError) {
    console.log('Pull failed, deleting folder and cloning again...');
    fs.rmSync(config.localSitePath, { recursive: true, force: true });
    mySiteFolderExists = false;
}

if (!mySiteFolderExists || pullError) {
    console.log('Cloning ' + siteConfig.repo + '...');
    try {
        const repoUrl = siteConfig.repoUrl;
        let requestUrl;
        if (repoUrl.indexOf('git@') === 0) {
            // SSH
            requestUrl = repoUrl;
        } else {
            // HTTPS
            requestUrl = repoUrl.replace('https://', 'https://' + config.github.user + ':' + config.github.appPass + '@');
        }
        const { stdout, stderr } = await execPromise('cd "' + config.filesPath + '" && git clone ' + requestUrl);
    } catch (error) {
        console.log(error);
        throw new Error(error);
    }
}

// Clean up any leftover dump files, tokens or backup scripts from previous runs
let connection = ftpConfig();
console.log('Cleaning up old backup artifacts...');
try {
    const remoteFiles = await connection.listFiles();
    const leftovers = remoteFiles.filter(f =>
        f.name.startsWith('db_') && f.name.endsWith('.sql') ||
        f.name === '.dewwwe-backup-token' ||
        f.name === 'dewwwe-backup.php'
    );
    for (const file of leftovers) {
        console.log('  Removing leftover: ' + file.name);
        await connection.deleteFile(file.name);
    }
    if (leftovers.length === 0) console.log('  No leftovers found');
} catch (error) {
    console.warn('Could not clean up leftovers:', error.message);
}

// Generate a secure token for backup authentication
const backupToken = crypto.randomBytes(32).toString('hex');
const tokenFilePath = config.localPath + '/helpers/.dewwwe-backup-token';
fs.writeFileSync(tokenFilePath, backupToken);

// Upload token file and backup script
console.log('Uploading backup token and script...');
await connection.uploadFile(tokenFilePath, '.dewwwe-backup-token');
await connection.uploadFile(config.localPath + '/helpers/backup-wp.php', 'dewwwe-backup.php');

// Clean up local token file
fs.unlinkSync(tokenFilePath);

// Trigger database dump with token authentication
console.log('Dumping database...');
let dumpFileName = null;
try {
    const backupResponse = await axios.get('https://' + siteDomain + '/dewwwe-backup.php?token=' + backupToken);
    const backupData = backupResponse.data;

    if (backupData.status !== 'ok' || !backupData.file) {
        throw new Error('Database dump failed: ' + JSON.stringify(backupData));
    }
    dumpFileName = backupData.file;
    console.log('Database dump successful: ' + dumpFileName);
} catch (error) {
    // Clean up remote files in case of failure
    try { await connection.deleteFile('dewwwe-backup.php'); } catch (e) { /* may have self-deleted */ }
    try { await connection.deleteFile('.dewwwe-backup-token'); } catch (e) { /* may have been deleted */ }
    console.error('Database dump failed:', error.message);
    throw error;
}


// Download files from ftp
let mustCommitGitignore = false;
if (fullDownload) {
    // Full mode: wipe and re-download everything
    console.log('Full download mode...');
    mustCommitGitignore = clean.cleanupSiteFolder();
    await connection.download();
} else {
    // Incremental mode: only download changed files
    console.log('Incremental download mode...');
    mustCommitGitignore = clean.ensureGitFiles();
    await connection.downloadChanged();
}

// Validate the downloaded dump file (dump is inside the webroot directory)
const expectedDumpPath = config.localSitePath + siteConfig.ftp.webRootPath + '/' + dumpFileName;
if (!fs.existsSync(expectedDumpPath) || fs.statSync(expectedDumpPath).size < 1024) {
    console.error('Downloaded dump file is missing or too small: ' + dumpFileName);
    throw new Error('Database dump validation failed');
}
const dumpHead = fs.readFileSync(expectedDumpPath, { encoding: 'utf8', flag: 'r' }).substring(0, 500);
if (!dumpHead.includes('CREATE TABLE') && !dumpHead.includes('INSERT INTO') && !dumpHead.includes('MySQL dump') && !dumpHead.includes('mysqldump')) {
    console.error('Downloaded dump file does not look like valid SQL');
    throw new Error('Database dump validation failed');
}
console.log('Dump file validated: ' + dumpFileName + ' (' + Math.round(fs.statSync(expectedDumpPath).size / 1024) + ' KB)');

// Clean up dump file from remote server
try {
    await connection.deleteFile(dumpFileName);
    console.log('Remote dump file cleaned up');
} catch (error) {
    console.warn('Could not delete remote dump file:', error.message);
}

// Git commit & push & tag
console.log('Commiting & pushing ' + siteConfig.repo + '...');
const date = new Date();
const mm = date.getMonth() + 1; // getMonth() is zero-based
const dd = date.getDate();
const HH = date.getHours();
const MM = date.getMinutes();

const dateString = [date.getFullYear() +
    (mm > 9 ? '' : '0') + mm,
    (dd > 9 ? '' : '0') + dd,
    (HH > 9 ? '' : '0') + HH +
    (MM > 9 ? '' : '0') + MM
].join('-');

// console.log(dateString);
try {
    const gitSetupcmd = 'git config --global user.email "' + config.github.mail + '" && git config --global user.name "Auto Site Save" && git config --global http.postBuffer 157286400';
    const cdCmd = " && cd " + '"' + config.localSitePath + '"';
    let commitGitignore = "";
    if(mustCommitGitignore) {
        commitGitignore = " && git add '.gitignore' && git commit -m 'adding gitignore' ";
    }
    const commitCmd = " && git add . && git commit -m 'Auto commit " + dateString + "'";
    const tagCmd = " && git tag " + dateString.replaceAll('-','.').replaceAll('.0','.') ;
    const pushCmd = " && git push";
    const pushTagCmd = " && git push origin " + dateString.replaceAll('-','.').replaceAll('.0','.');
    const { stdout, stderr } = await execPromise(gitSetupcmd + cdCmd + commitGitignore + commitCmd + tagCmd + pushCmd + pushTagCmd, { maxBuffer: 1024 * 500000 });
} catch (error) {
    console.log(error);
    throw new Error(error);
}

// Update SharePoint List
if (config.sharepoint && siteConfig.spListItemID) {
    const sp = new Sp(__dirname, config);
    sp.updateListItem(siteConfig.spListItemID);
}

const elapsed = Math.round((Date.now() - startTime) / 1000);
const mins = Math.floor(elapsed / 60);
const secs = elapsed % 60;
console.log(`\n=== Backup complete: ${siteDomain} — ${new Date().toLocaleString()} — ${mins}m ${secs}s ===\n`);
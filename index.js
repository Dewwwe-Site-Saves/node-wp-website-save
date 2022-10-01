'use strict';

/************************
 *       Variables      *
 ************************/

let siteDomain;
if (process.argv[0] != undefined) {
    siteDomain = process.argv[0];
} else {
    siteDomain = 'valensi-patrimoine.fr';
}

/************************
 *       Imports        *
 ************************/
import fs from 'fs';
import Sftp from './lib/sftp.js';
import Ftp from './lib/ftp.js';
import Cleanup from './lib/cleanup.js';
import { exec } from 'child_process';
import mysqldump from 'mysqldump';
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

config.localPath = __dirname;
config.filesPath = __dirname + '/files/';
config.localSitePath = __dirname + '/files/' + siteConfig.repo + '/';

// Check config 
if (siteConfig == undefined) {
    throw new Error(`No config found for this domain (${siteDomain})`);
}

/************************
 *       Function       *
 ************************/
function ftpConfig() {
    if (siteConfig.sftp) {
        // console.log("Using sftp");

        return new Sftp(__dirname, siteConfig);
    } else {
        // console.log("Using ftp");
        // Ftp class
        return new Ftp(__dirname, siteConfig);
    }
}

function getDataBaseDump() {
    mysqldump({
        connection: {
            host: siteConfig.db.host,
            user: siteConfig.db.user,
            password: siteConfig.db.password,
            database: siteConfig.db.database,
        },
        dumpToFile: __dirname + '/files/' + siteConfig.repo + '/dump.sql',
    });
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
        const { stdout, stderr } = execProcess('cd ' + config.localSitePath + ' && git pull');
    } catch (error) {
        console.error(error);
        pullError = true;
    }
}

if (mySiteFolderExists && pullError) {
    // TODO: Delete the folder and clone again
}

if (!mySiteFolderExists || pullError) {
    console.log('Cloning ' + siteConfig.repo + '...');
    try {
        const { stdout, stderr } = await execPromise('cd ' + config.filesPath + ' && git clone ' + siteConfig.repoUrl);
    } catch (error) {
        console.log(error);
    }
}

// Generate backup.php file
let backupFile = "<?php\n";
backupFile += `system("mysqldump --host=${siteConfig.db.host} --user=${siteConfig.db.user} --password=${siteConfig.db.password} ${siteConfig.db.database} > db_${siteConfig.db.database}.sql");`
backupFile += "\n?>";
fs.writeFileSync(config.localSitePath + 'backup.php', backupFile);

// Upload backup.php file
// Ftp Connect 
let connection = ftpConfig();
await connection.uploadFile(config.localSitePath + 'backup.php', 'backup.php');

// GET backup.php file (trigger database dump)
console.log('Dumping database...');
axios.get('https://valensi-patrimoine.fr/backup.php');

// Empty folder (exept .git and readme.md)
clean.cleanupSiteFolder();

// Download files from ftp
await connection.download();

// Git commit & push
console.log('Commiting & pushing ' + siteConfig.repo + '...');
const date = new Date();
const mm = this.getMonth() + 1; // getMonth() is zero-based
const dd = this.getDate();

const dateString = [this.getFullYear(),
    (mm > 9 ? '' : '0') + mm,
    (dd > 9 ? '' : '0') + dd
].join('');

console.log(dateString);
try {
    const cdCmd = "cd " + config.localSitePath;
    const commitCmd = " && git commit -m 'Auto commit " + dateString + "'";
    const pushCmd = " && git push";
    const { stdout, stderr } = await execPromise(cdCmd + commitCmd + pushCmd);
} catch (error) {
    console.log(error);
}
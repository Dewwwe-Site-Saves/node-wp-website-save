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
        const { stdout, stderr } = await execPromise('cd "' + config.localSitePath + '" && git pull');
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

// Upload backup.php file
// Ftp Connect 
let connection = ftpConfig();
await connection.uploadFile(config.localPath + '/helpers/backup-wp.php', 'dewwwe-backup.php');

// GET backup.php file (trigger database dump)
console.log('Dumping database...');
axios.get('https://' + siteDomain + '/dewwwe-backup.php');

// Empty folder (exept .git and readme.md)
// let mustCommitGitignore = 
clean.cleanupSiteFolder();


// Download files from ftp
await connection.download();

// Git commit & push & tag
console.log('Commiting & pushing ' + siteConfig.repo + '...');
const date = new Date();
const mm = date.getMonth() + 1; // getMonth() is zero-based
const dd = date.getDate();

const dateString = [date.getFullYear(),
    (mm > 9 ? '' : '0') + mm,
    (dd > 9 ? '' : '0') + dd
].join('-');

// console.log(dateString);
try {
    const gitSetupcmd = 'git config --global user.email "' + config.github.mail + '" && git config --global user.name "Auto Site Save" && git config --global http.postBuffer 157286400';
    const cdCmd = " && cd " + '"' + config.localSitePath + '"';
    let commitGitignore = "";
    let mustCommitGitignore= false;
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
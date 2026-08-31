// Modules
import ftp from "basic-ftp";
import fs from "fs";
import path from "path";
import { shouldDownload, deleteOrphans } from "./sync.js";

class Ftp {
    constructor(filesFolder = __dirname, siteConfig) {

        // Local Path
        this.localPath = filesFolder + '/files/' + siteConfig.repo + '/';

        // Remote Path
        this.remotePath = siteConfig.path;

        this.siteConfig = siteConfig;
        // console.log('siteConfig: ', this.siteConfig);
        // console.log('siteConfig: ', siteConfig);

    }

    disconnect(result, error) {
        const self = this;
        self.client.close();
        console.log('Connection closed');
        if (error) throw error;
    }

    async download() {
        const self = this;
        // console.log('To: ' + self.remotePathSASS);
        return self.connect().then(async(client) => {
            console.log('Downloading files...');
            return self.client.downloadToDir(self.localPath).then((result) => {
                console.log('Files downloaded');
                return self.disconnect(result);
            }); //.catch((error) => { return self.disconnect(null, error); });
            //}).catch((error) => {
            //return self.disconnect(null, error);
        });

    }

    async uploadFile(file, fileName) {
        const self = this;
        // console.log('Uploading files');
        return self.connect().then(async(client) => {
            console.log('Uploading files...');
            console.log('webRoot: ' + self.siteConfig.ftp.webRootPath);
            return self.client.uploadFrom(file, self.siteConfig.ftp.webRootPath + '/' + fileName).then((result) => {
                return self.disconnect(result);
            }).catch((error) => { return self.disconnect(null, error); });
        }).catch((error) => {
            return self.disconnect(null, error);
        });
    }

    connect() {
        const self = this;
        self.client = new ftp.Client();

        // force PASV mode
        self.client.prepareTransfer = ftp.enterPassiveModeIPv4;

        // logging
        self.client.ftp.verbose = false;

        // options
        let options = {
            host: self.siteConfig.ftp.host,
            //port: (self.config.port) ? connection.port : 21,
            user: self.siteConfig.ftp.user,
            password: self.siteConfig.ftp.password,
        };

        // Connection
        try {
            console.log('lets connect');
            // console.log('options: ', options);
            return self.client.access(options).then(() => {
                console.log("Connected to ftp with host: " + self.siteConfig.ftp.host);

                // Not able to get directory listing for regular FTP to an IBM i (or AS/400 or iSeries) #123
                // Force IBM i (or AS/400 or iSeries) returns information
                // for the LIST subcommand in the UNIX style list format.
                return self.client.sendIgnoringError('SITE LISTFMT 1').then(() => {
                    // catch connection timeout - code 421
                    self.client.ftp.socket.on("data", (chunk) => {
                        const code = parseInt(chunk.trim().substr(0, 3), 10)
                        if (code === 421) {
                            self.end();
                        }
                    });

                    return self;
                });
            }).catch((err) => {
                throw new Error('Failed to connect to ftp');
                return;
            });
        } catch (err) {
            throw new Error('Failed to connect to ftp');
            return;
        }

    }

    async _createClient() {
        const self = this;
        const client = new ftp.Client();
        client.prepareTransfer = ftp.enterPassiveModeIPv4;
        client.ftp.verbose = false;
        await client.access({
            host: self.siteConfig.ftp.host,
            user: self.siteConfig.ftp.user,
            password: self.siteConfig.ftp.password,
        });
        return client;
    }

    async downloadChanged() {
        const self = this;
        const POOL_SIZE = 5;
        const startDir = '/' + (self.siteConfig.ftp.webRootPath || '');

        console.log('Scanning remote files for changes in ' + startDir + '...');

        // Phase 1: Scan remote tree with parallel connections
        const remoteFiles = new Set();
        const allFiles = [];
        let scanned = 0;

        // Create a pool of FTP clients for parallel listing
        const pool = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            pool.push(await self._createClient());
        }

        // BFS with concurrent workers
        const dirQueue = [startDir];
        let activeWorkers = 0;
        let resolveAllDone;
        const allDone = new Promise(r => { resolveAllDone = r; });

        async function worker(client) {
            while (true) {
                const dir = dirQueue.shift();
                if (dir === undefined) {
                    if (activeWorkers === 0) { resolveAllDone(); return; }
                    // Wait for other workers to discover more dirs
                    await new Promise(r => setTimeout(r, 50));
                    if (dirQueue.length === 0 && activeWorkers === 0) { resolveAllDone(); return; }
                    continue;
                }

                activeWorkers++;
                try {
                    const items = await client.list(dir);
                    for (const item of items) {
                        const remotePath = dir === '/' ? '/' + item.name : dir + '/' + item.name;
                        const relPath = remotePath.startsWith('/') ? remotePath.substring(1) : remotePath;

                        if (item.type === ftp.FileType.Directory) {
                            dirQueue.push(remotePath);
                        } else {
                            remoteFiles.add(relPath);
                            allFiles.push({ remotePath, relPath, size: item.size, mtime: item.modifiedAt });
                            scanned++;
                            if (scanned % 500 === 0) console.log(`  ${scanned} files scanned...`);
                        }
                    }
                } catch (err) {
                    console.warn('  Could not list ' + dir + ': ' + err.message);
                }
                activeWorkers--;
            }
        }

        // Launch workers
        pool.map(client => worker(client));
        await allDone;

        // Close pool connections
        for (const client of pool) client.close();

        console.log(`  ${scanned} files found, comparing...`);

        // Phase 2: Filter to changed files only
        const toDownload = [];
        for (const file of allFiles) {
            const localFilePath = path.join(self.localPath, file.relPath);
            const localDir = path.dirname(localFilePath);
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }
            if (shouldDownload(localFilePath, file.size, file.mtime)) {
                toDownload.push(file);
            }
        }

        console.log(`  ${toDownload.length} files to download, ${scanned - toDownload.length} unchanged`);

        // Phase 3: Download changed files (single connection)
        if (toDownload.length > 0) {
            await self.connect();
            for (let i = 0; i < toDownload.length; i++) {
                const file = toDownload[i];
                await self.client.downloadTo(path.join(self.localPath, file.relPath), file.remotePath);
                if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${toDownload.length} downloaded...`);
            }
            self.disconnect();
        }

        // Phase 4: Delete orphans
        const deleted = deleteOrphans(self.localPath, remoteFiles);

        console.log(`Sync complete: ${toDownload.length} downloaded, ${scanned - toDownload.length} unchanged, ${deleted} deleted`);
    }

    async listFiles() {
        const self = this;
        return self.connect().then(async () => {
            const items = await self.client.list('/' + self.siteConfig.ftp.webRootPath);
            self.disconnect();
            return items;
        });
    }

    async deleteFile(fileName) {
        const self = this;
        return self.connect().then(async () => {
            const remotePath = self.siteConfig.ftp.webRootPath + '/' + fileName;
            console.log('Deleting remote file: ' + remotePath);
            return self.client.remove(remotePath).then((result) => {
                console.log('File deleted: ' + remotePath);
                return self.disconnect(result);
            }).catch((error) => { return self.disconnect(null, error); });
        }).catch((error) => {
            return self.disconnect(null, error);
        });
    }

    end() {
        const self = this;

        let promise = new Promise((resolve, reject) => {
            self.client.close();
            resolve(true);
        });

        return promise;
    }

}

// module.exports = Ftp;
export default Ftp;
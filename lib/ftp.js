// Modules
import ftp from "basic-ftp";
import fs from "fs";
import path from "path";
import { shouldDownload, deleteOrphans } from "./sync.js";

class Ftp {
    constructor(filesFolder = __dirname, siteConfig, logger = null) {
        this.localPath = filesFolder + '/files/' + siteConfig.repo + '/';
        this.remotePath = siteConfig.path;
        this.siteConfig = siteConfig;
        this.log = logger || { log: console.log, error: console.error, warn: console.warn };
    }

    disconnect(result, error) {
        this.client.close();
        if (error) throw error;
    }

    async download() {
        const self = this;
        return self.connect().then(async () => {
            self.log.log('Downloading all files...');
            return self.client.downloadToDir(self.localPath).then((result) => {
                self.log.log('Files downloaded');
                return self.disconnect(result);
            });
        });
    }

    async uploadFile(file, fileName) {
        const self = this;
        return self.connect().then(async () => {
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
        self.client.prepareTransfer = ftp.enterPassiveModeIPv4;
        self.client.ftp.verbose = false;

        const options = {
            host: self.siteConfig.ftp.host,
            user: self.siteConfig.ftp.user,
            password: self.siteConfig.ftp.password,
        };

        return self.client.access(options).then(() => {
            return self.client.sendIgnoringError('SITE LISTFMT 1').then(() => {
                self.client.ftp.socket.on("data", (chunk) => {
                    const code = parseInt(chunk.trim().substr(0, 3), 10);
                    if (code === 421) {
                        self.end();
                    }
                });
                return self;
            });
        }).catch(() => {
            throw new Error('Failed to connect to FTP: ' + self.siteConfig.ftp.host);
        });
    }

    async _createClient() {
        const client = new ftp.Client();
        client.prepareTransfer = ftp.enterPassiveModeIPv4;
        client.ftp.verbose = false;
        await client.access({
            host: this.siteConfig.ftp.host,
            user: this.siteConfig.ftp.user,
            password: this.siteConfig.ftp.password,
        });
        return client;
    }

    async downloadChanged() {
        const self = this;
        const POOL_SIZE = 5;
        const startDir = '/' + (self.siteConfig.ftp.webRootPath || '');

        self.log.log('Scanning remote files for changes...');

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
                            if (scanned % 500 === 0) self.log.log(`  ${scanned} files scanned...`);
                        }
                    }
                } catch (err) {
                    self.log.warn('  Could not list ' + dir + ': ' + err.message);
                }
                activeWorkers--;
            }
        }

        pool.map(client => worker(client));
        await allDone;
        for (const client of pool) client.close();

        self.log.log(`  ${scanned} files found, comparing...`);

        // Filter to changed files only
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

        self.log.log(`  ${toDownload.length} files to download, ${scanned - toDownload.length} unchanged`);

        // Download changed files with parallel connections
        let skippedDl = 0;
        if (toDownload.length > 0) {
            const dlPool = [];
            for (let i = 0; i < Math.min(POOL_SIZE, toDownload.length); i++) {
                dlPool.push(await self._createClient());
            }

            let dlIndex = 0;
            let completed = 0;

            async function dlWorker(client) {
                while (dlIndex < toDownload.length) {
                    const idx = dlIndex++;
                    const file = toDownload[idx];
                    try {
                        await client.downloadTo(path.join(self.localPath, file.relPath), file.remotePath);
                    } catch (err) {
                        self.log.warn('  Skipped (unavailable): ' + file.relPath);
                        skippedDl++;
                        continue;
                    }
                    completed++;
                    if (completed % 100 === 0) self.log.log(`  ${completed}/${toDownload.length} downloaded...`);
                }
            }

            await Promise.all(dlPool.map(client => dlWorker(client)));
            for (const client of dlPool) client.close();
        }

        const deleted = deleteOrphans(self.localPath, remoteFiles);
        const dlCount = toDownload.length - (skippedDl || 0);
        self.log.log(`Sync complete: ${dlCount} downloaded, ${scanned - toDownload.length} unchanged, ${deleted} deleted${skippedDl ? ', ' + skippedDl + ' skipped' : ''}`);
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
            return self.client.remove(remotePath).then((result) => {
                return self.disconnect(result);
            }).catch((error) => { return self.disconnect(null, error); });
        }).catch((error) => {
            return self.disconnect(null, error);
        });
    }

    end() {
        this.client.close();
        return Promise.resolve(true);
    }

}

export default Ftp;

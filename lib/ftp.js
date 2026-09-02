// Modules
import ftp from "basic-ftp";
import fs from "fs";
import path from "path";
import { shouldDownload, deleteOrphans, isSafePath } from "./sync.js";

class Ftp {
    constructor(filesFolder = __dirname, siteConfig, logger = null) {
        this.localPath = filesFolder + '/files/' + siteConfig.repo + '/';
        this.remotePath = siteConfig.path;
        this.siteConfig = siteConfig;
        this.log = logger || { log: console.log, error: console.error, warn: console.warn };
    }

    disconnect() {
        this.client.close();
    }

    async download() {
        await this.connect();
        this.log.log('Downloading all files...');
        await this.client.downloadToDir(this.localPath);
        this.log.log('Files downloaded');
        this.disconnect();
    }

    async uploadFile(file, fileName) {
        await this.connect();
        try {
            await this.client.uploadFrom(file, this.siteConfig.ftp.webRootPath + '/' + fileName);
        } finally {
            this.disconnect();
        }
    }

    async connect() {
        this.client = new ftp.Client();
        this.client.prepareTransfer = ftp.enterPassiveModeIPv4;
        this.client.ftp.verbose = false;

        try {
            await this.client.access({
                host: this.siteConfig.ftp.host,
                user: this.siteConfig.ftp.user,
                password: this.siteConfig.ftp.password,
            });
            await this.client.sendIgnoringError('SITE LISTFMT 1');
            this.client.ftp.socket.on("data", (chunk) => {
                const code = parseInt(chunk.trim().substr(0, 3), 10);
                if (code === 421) {
                    this.end();
                }
            });
        } catch {
            throw new Error('Failed to connect to FTP: ' + this.siteConfig.ftp.host);
        }
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

                        if (!isSafePath(relPath)) continue;

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
        const dlCount = toDownload.length - skippedDl;
        const unchanged = scanned - toDownload.length;
        self.log.log(`Sync complete: ${dlCount} downloaded, ${unchanged} unchanged, ${deleted} deleted${skippedDl ? ', ' + skippedDl + ' skipped' : ''}`);

        return { downloaded: dlCount, unchanged, deleted };
    }

    async listFiles() {
        await this.connect();
        try {
            return await this.client.list('/' + this.siteConfig.ftp.webRootPath);
        } finally {
            this.disconnect();
        }
    }

    async deleteFile(fileName) {
        await this.connect();
        try {
            const remotePath = this.siteConfig.ftp.webRootPath + '/' + fileName;
            await this.client.remove(remotePath);
        } finally {
            this.disconnect();
        }
    }

    end() {
        this.client.close();
    }

}

export default Ftp;

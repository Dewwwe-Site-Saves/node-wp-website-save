import Client from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';
import { shouldDownload, deleteOrphans, isSafePath } from './sync.js';

class Sftp {
    constructor(filesFolder = __dirname, siteConfig, logger = null) {
        this.localPath = filesFolder + '/files/' + siteConfig.repo;
        this.remotePath = siteConfig.path;
        this.siteConfig = siteConfig;
        this.log = logger || { log: console.log, error: console.error, warn: console.warn };

        this.options = {
            host: this.siteConfig.ftp.host,
            port: this.siteConfig.ftp.port ? this.siteConfig.ftp.port : 22,
            user: this.siteConfig.ftp.user,
            password: this.siteConfig.ftp.password,
            keepaliveInterval: 2000000,
            keepaliveCountMax: 2000
        };
    }

    async download() {
        const self = this;
        const sftp = new Client();

        try {
            await sftp.connect(self.options);
            self.log.log('Downloading all files...');
            self.sftp = sftp;
            await this.downloadFolder('/');
        } catch (err) {
            throw err;
        } finally {
            self.log.log('Files downloaded');
            return sftp.end();
        }
    }

    async downloadFolder(folder) {
        const self = this;
        let data;
        try {
            data = await this.sftp.list(folder);
        } catch (err) {
            self.log.warn('Could not list: ' + folder, err.message);
            return;
        }
        if (data && data.length > 0) {
            for (let index = 0; index < data.length; index++) {
                const item = data[index];
                if (folder[folder.length - 1] !== "/") {
                    folder = folder + '/';
                }
                if (item.type == 'd') {
                    self.checkOrCreate(self.localPath + folder + item.name);
                    await this.downloadFolder(folder + item.name);
                } else {
                    await this.downloadFile(folder + item.name);
                }
            }
            return data;
        }
    }

    async downloadFile(fileName) {
        await this.sftp.fastGet(fileName, this.localPath + fileName).catch((err) => {
            this.log.error('File download error:', err.message);
            throw new Error('Failed to download: ' + fileName);
        });
    }

    async uploadFile(file, fileName) {
        const self = this;
        const sftp = new Client();

        try {
            await sftp.connect(self.options);
            let rslt = await sftp.put(file, self.siteConfig.ftp.webRootPath + '/' + fileName);
            return rslt;
        } catch (err) {
            throw new Error('Failed to upload file to SFTP');
        } finally {
            sftp.end();
        }
    }

    async downloadChanged() {
        const self = this;
        const sftp = new Client();

        try {
            await sftp.connect(self.options);
            self.sftp = sftp;

            const remoteFiles = new Set();
            let downloaded = 0;
            let skipped = 0;
            let scanned = 0;
            const toDownload = [];

            async function walkRemote(folder) {
                let data;
                try {
                    data = await sftp.list(folder);
                } catch (err) {
                    self.log.warn('Could not list: ' + folder, err.message);
                    return;
                }
                if (!data || data.length === 0) return;

                for (const item of data) {
                    const remotePath = folder.endsWith('/') ? folder + item.name : folder + '/' + item.name;
                    const relPath = remotePath.startsWith('/') ? remotePath.substring(1) : remotePath;

                    if (!isSafePath(relPath)) continue;

                    if (item.type === 'd') {
                        const localDir = path.join(self.localPath, relPath);
                        if (!fs.existsSync(localDir)) {
                            fs.mkdirSync(localDir, { recursive: true });
                        }
                        await walkRemote(remotePath);
                    } else {
                        remoteFiles.add(relPath);
                        scanned++;
                        const localFilePath = path.join(self.localPath, relPath);
                        const remoteMtime = item.modifyTime ? new Date(item.modifyTime * 1000) : null;

                        if (shouldDownload(localFilePath, item.size, remoteMtime)) {
                            const localDir = path.dirname(localFilePath);
                            if (!fs.existsSync(localDir)) {
                                fs.mkdirSync(localDir, { recursive: true });
                            }
                            toDownload.push({ remotePath, localFilePath });
                            downloaded++;
                        } else {
                            skipped++;
                        }
                        if (scanned % 500 === 0) self.log.log(`  ${scanned} files scanned...`);
                    }
                }
            }

            const startDir = '/' + (self.siteConfig.ftp.webRootPath || '');
            self.log.log('Scanning remote files for changes...');
            await walkRemote(startDir);

            self.log.log(`  ${toDownload.length} files to download, ${skipped} unchanged`);

            // Download in parallel batches (SSH multiplexes on one connection)
            const BATCH_SIZE = 5;
            let completed = 0;
            let skippedDl = 0;
            for (let i = 0; i < toDownload.length; i += BATCH_SIZE) {
                const batch = toDownload.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(batch.map(f => sftp.fastGet(f.remotePath, f.localFilePath)));
                for (const r of results) {
                    if (r.status === 'fulfilled') {
                        completed++;
                    } else {
                        skippedDl++;
                        self.log.warn('  Skipped (unavailable): ' + batch[results.indexOf(r)]?.remotePath);
                    }
                }
                if (completed % 100 === 0 && completed > 0) self.log.log(`  ${completed}/${toDownload.length} downloaded...`);
            }

            const deleted = deleteOrphans(self.localPath, remoteFiles);
            const dlCount = toDownload.length - skippedDl;
            self.log.log(`Sync complete: ${dlCount} downloaded, ${skipped} unchanged, ${deleted} deleted${skippedDl ? ', ' + skippedDl + ' skipped' : ''}`);

            return { downloaded: dlCount, unchanged: skipped, deleted };
        } catch (err) {
            throw err;
        } finally {
            sftp.end();
        }
    }

    async listFiles() {
        const self = this;
        const sftp = new Client();
        try {
            await sftp.connect(self.options);
            const items = await sftp.list('/' + self.siteConfig.ftp.webRootPath);
            return items;
        } finally {
            sftp.end();
        }
    }

    async deleteFile(fileName) {
        const self = this;
        const sftp = new Client();

        try {
            await sftp.connect(self.options);
            const remotePath = self.siteConfig.ftp.webRootPath + '/' + fileName;
            await sftp.delete(remotePath);
        } catch (err) {
            self.log.warn('Could not delete remote file:', err.message);
        } finally {
            sftp.end();
        }
    }

    checkOrCreate(path) {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }

}

export default Sftp;

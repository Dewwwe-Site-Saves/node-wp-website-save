// https://www.npmjs.com/package/ssh2-sftp-client

import Client from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';
import { shouldDownload, deleteOrphans } from './sync.js';

class Sftp {
    constructor(filesFolder = __dirname, siteConfig) {
        // Local Path
        this.localPath = filesFolder + '/files/' + siteConfig.repo;

        // Remote Path
        this.remotePath = siteConfig.path;

        this.siteConfig = siteConfig;
        // console.log('siteConfig: ', this.siteConfig);
        // console.log('siteConfig: ', siteConfig);

        // SFTP
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

        // Connect
        try {
            console.log("Connecting...");
            await sftp.connect(self.options);
            console.log("Connected");
            // .then(async () => {
            //     let data = await sftp.list('/');
            //     // console.log(data, 'the data info');
            //     return data
            // })
            console.log('Downloading files...');

            self.sftp = sftp;
            await this.downloadFolder('/');

        } catch (err) {
            throw err;
        } finally {
            console.log('Files downloaded');

            return sftp.end();
        }
    }

    async downloadFolder(folder) {
        const self = this;
        // console.log("downloadFolder ", folder);
        let data;
        try {
            data = await this.sftp.list(folder);
            // console.log("folder content: ", data)
        } catch (err) {
            console.log("Something happened: ", err);
        }
        // console.log('data', data);
        if (data && data.length > 0) {

            for (let index = 0; index < data.length; index++) {
                const item = data[index];
                // console.log('---- item: ', item.type )
                if (folder[folder.length - 1] !== "/") {
                    folder = folder + '/'
                }
                if (item.type == 'd') {
                    self.checkOrCreate(self.localPath + folder + item.name);
                    await this.downloadFolder(folder + item.name);
                } else {
                    await this.downloadFile(folder + item.name);
                }
            }
            return data;
        } else {
            console.log("No data found in ", folder);
        }
    }

    async downloadFile(fileName) {
        const self = this;
        // console.log("> download file ", fileName);
        // console.log("----- to:  ", self.localPath + fileName);

        await this.sftp.fastGet(fileName, self.localPath + fileName).then(() => {
            // console.log("downloaded");
        }).catch((err) => {
            console.log('file download err', err)
            throw new Error
        })
        return
    }

    async uploadFile(file, fileName) {
        const self = this;

        const sftp = new Client();

        // Connect
        try {
            console.log('Connecting...');
            await sftp.connect(self.options);
            console.log('Connected');

            // Upload
            try {
                console.log('Uploading files...');
                sftp.on('upload', info => {
                    console.log(`Listener: Upload ${info.source}`);
                });
                console.log('webRoot: ' + self.siteConfig.ftp.webRootPath);
                let rslt = await sftp.put(file, self.siteConfig.ftp.webRootPath + '/' + fileName);
                return rslt;
            } catch (err) {
                throw new Error('Failed to upload file to sftp');
            }

        } catch (err) {
            throw new Error('Failed to connect to sftp');
        } finally {
            sftp.end();
        }
    }

    async downloadChanged() {
        const self = this;
        const sftp = new Client();

        try {
            console.log('Connecting...');
            await sftp.connect(self.options);
            console.log('Connected');

            self.sftp = sftp;
            const remoteFiles = new Set();
            let downloaded = 0;
            let skipped = 0;
            let scanned = 0;

            async function walkRemote(folder) {
                let data;
                try {
                    data = await sftp.list(folder);
                } catch (err) {
                    console.log('Could not list: ', folder, err.message);
                    return;
                }
                if (!data || data.length === 0) return;

                for (const item of data) {
                    const remotePath = folder.endsWith('/') ? folder + item.name : folder + '/' + item.name;
                    const relPath = remotePath.startsWith('/') ? remotePath.substring(1) : remotePath;

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
                            await sftp.fastGet(remotePath, localFilePath);
                            downloaded++;
                        } else {
                            skipped++;
                        }
                        if (scanned % 500 === 0) console.log(`  ${scanned} files scanned...`);
                    }
                }
            }

            const startDir = '/' + (self.siteConfig.ftp.webRootPath || '');
            console.log('Scanning remote files for changes in ' + startDir + '...');
            await walkRemote(startDir);

            // Delete local files that no longer exist on remote
            const deleted = deleteOrphans(self.localPath, remoteFiles);

            console.log(`Sync complete: ${downloaded} downloaded, ${skipped} unchanged, ${deleted} deleted`);
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
            console.log('Deleting remote file: ' + remotePath);
            await sftp.delete(remotePath);
            console.log('File deleted: ' + remotePath);
        } catch (err) {
            console.warn('Could not delete remote file:', err.message);
        } finally {
            sftp.end();
        }
    }

    checkOrCreate(path) {
        // console.log(` - - - Checking path:  ${path} - - - `);
        if (!fs.existsSync(path)) {
            // console.log(` - - - Creating ${path} - - - `);
            fs.mkdirSync(path);
            // console.log(`${path} created.`);
        }
    }

}

export default Sftp;
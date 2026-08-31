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

    async downloadChanged() {
        const self = this;
        return self.connect().then(async () => {
            const remoteFiles = new Set();
            let downloaded = 0;
            let skipped = 0;
            let scanned = 0;

            async function walkRemote(remoteDir) {
                const items = await self.client.list(remoteDir);
                for (const item of items) {
                    const remotePath = remoteDir === '/' ? '/' + item.name : remoteDir + '/' + item.name;
                    const relPath = remotePath.startsWith('/') ? remotePath.substring(1) : remotePath;

                    if (item.type === ftp.FileType.Directory) {
                        const localDir = path.join(self.localPath, relPath);
                        if (!fs.existsSync(localDir)) {
                            fs.mkdirSync(localDir, { recursive: true });
                        }
                        await walkRemote(remotePath);
                    } else {
                        remoteFiles.add(relPath);
                        scanned++;
                        const localFilePath = path.join(self.localPath, relPath);

                        if (shouldDownload(localFilePath, item.size, item.modifiedAt)) {
                            const localDir = path.dirname(localFilePath);
                            if (!fs.existsSync(localDir)) {
                                fs.mkdirSync(localDir, { recursive: true });
                            }
                            await self.client.downloadTo(localFilePath, remotePath);
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
            return self.disconnect();
        });
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
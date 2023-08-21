// https://www.npmjs.com/package/ssh2-sftp-client

import Client from 'ssh2-sftp-client';
import fs from 'fs';

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
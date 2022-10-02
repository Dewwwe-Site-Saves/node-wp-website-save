// https://www.npmjs.com/package/ssh2-sftp-client

import Client from 'ssh2-sftp-client';

class Sftp {
    constructor(filesFolder = __dirname, siteConfig) {
        // Local Path
        this.localPath = filesFolder + '/files/' + siteConfig.repo + '/';

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
            keepaliveInterval: 2000,
            keepaliveCountMax: 20
        };

    }

    async download() {
        const self = this;

        const sftp = new Client();

        // Connect
        try {
            console.log('Connecting...');
            await sftp.connect(self.options);
            console.log('Connected');

            // Download
            try {
                console.log('Downloading files...');
                sftp.on('download', info => {
                    console.log(`Listener: Download ${info.source}`);
                });
                let rslt = await sftp.downloadDir('/', self.localPath);
                console.log('Downloaded files');
                return rslt;
            } catch (err) {
                console.log(err);
                // throw new Error('Failed to download dir from sftp');
                let rslt = await sftp.downloadDir('/', self.localPath, { useFastGet: true });
                console.log('Downloaded files');
            }
        } catch (err) {
            if (err.message === 'Failed to download dir from sftp') {
                throw new Error('Failed to download dir from sftp');
            } else {
                console.log(err);
                throw err;
                throw new Error('Failed to connect to sftp');
            }
        } finally {
            sftp.end();
        }
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

}

export default Sftp;
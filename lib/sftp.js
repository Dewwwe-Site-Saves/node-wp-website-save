// https://www.npmjs.com/package/ssh2-sftp-client

// 'use strict';

const fs = require('fs');
let Client = require('ssh2-sftp-client');

class Sftp {
    constructor(filesFolder = __dirname) {
        // Config File
        this.configFile = filesFolder + '/config.txt';
        this.config = new Object();
        this.getCongig();

        // Local Paths
        this.localPath = filesFolder + '/files/';
        this.localPathCSS = this.localPath + "css/";
        this.localPathSASS = this.localPath + "sass/";

        // Remote Paths
        this.remotePath = this.config.remotePath;
        this.remotePathSASS = this.remotePath + "sass/";
        this.remotePathCSS = this.remotePath + "css/";

        // SFTP
        this.options = {
            host: this.config.host,
            port: 22,
            user: this.config.user,
            password: this.config.password,
        };

    }

    download() {
        const self = this;

        return self.executeDownload().then(msg => {
                console.log(msg);
            })
            .catch(err => {
                console.log(`main error: ${err.message}`);
            });

    }

    async executeDownload() {
        const self = this;

        const sftp = new Client();
        // const client = new SftpClient();

        try {
            console.log('Connecting...');
            await sftp.connect(self.options);
            console.log('Connected');

            sftp.on('download', info => {
                console.log(`Listener: Download ${info.source}`);
            });
            let rslt = await sftp.downloadDir(self.remotePathSASS, self.localPathSASS);
            return rslt;
        } catch (err) {
            throw new Error('Failed to connect to sftp');
            return;
        } finally {
            sftp.end();
        }

    }

    upload() {
        const self = this;

        self.executeUpload().then(msg => {
                console.log(msg);
            })
            .catch(err => {
                console.log(`main error: ${err.message}`);
            });

    }

    async executeUpload() {
        const self = this;

        const sftp = new Client();
        // const client = new SftpClient();

        try {
            console.log('Connecting...');
            await sftp.connect(self.options);
            console.log('Connected');

            sftp.on('upload', info => {
                console.log(`Listener: Upload ${info.source}`);
            });
            let rslt = await sftp.uploadDir(self.localPathCSS, self.remotePathCSS);
            return rslt;
        } catch (err) {
            throw new Error('Failed to connect to sftp');
            return;
        } finally {
            sftp.end();
        }

    }


    getCongig() {
        try {
            // read contents of the file
            this.data = fs.readFileSync(this.configFile, 'UTF-8');

            // split the contents by new line
            this.lines = this.data.split(/\r?\n/);

            // print all lines
            this.lines.forEach((line) => {
                if (line.includes('host: ')) {
                    this.config.host = line.replace('host: ', '');
                }
                if (line.includes('user: ')) {
                    this.config.user = line.replace('user: ', '');
                }
                if (line.includes('password: ')) {
                    this.config.password = line.replace('password: ', '');
                }
                if (line.includes('remotePath: ')) {
                    this.config.remotePath = line.replace('remotePath: ', '');
                }
            });
        } catch (err) {
            throw err;
        }
        return this.config;
    }
}

module.exports = Sftp;
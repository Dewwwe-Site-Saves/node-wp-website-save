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
            self.sftp = sftp;
            await this.downloadFolder('/');

        } catch (err) {
            throw err;
        } finally {
            return sftp.end();
        }
    }

    async downloadFolder(folder) {
        const self = this;
        console.log("downloadFolder ", folder);
        let data;
        try {
            data = await this.sftp.list(folder);
        } catch (err) {
            console.log("Something happened: ", err);
        }
        // console.log('data', data);
        if (data && data.length > 0) {
            return await data.forEach(async (item) => {
                if (item.type =='d') {
                    return await this.downloadFolder(folder + item.name);
                } else {
                    return await this.downloadFile(folder + item.name);
                }
            });
        } else {
            console.log("No data found in ", folder); 
        }
    }

    async downloadFile(fileName) {
        const self = this;
        console.log("> download file ", fileName);
        return await this.sftp.fastGet( fileName, self.localPath + fileName, function (err) {
            if (err) throw err
            // console.log("downloaded successfully")
        });
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
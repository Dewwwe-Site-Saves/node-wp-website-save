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
            // console.log('Connecting...');
            // await sftp.connect(self.options);
            // console.log('Connected');

            // // Download
            // console.log('Downloading files...');
            // sftp.on('download', info => {
            //     console.log(`Listener: Download ${info.source}`);
            // });
            // // let rslt = await sftp.downloadDir('/', self.localPath);
            // // console.log('Downloaded files');
            // // return rslt;

            // await sftp.list('/').then((data) => {
            //     console.log(data, 'the data info');
            //     if (data.length > 0) {
            //         // let remotepath = '/' + data.name;
            //         // var localpath = self.localPath + data.name;
            //         sftp.fastGet('/' + data.name, self.localPath + data.name, {
            //             concurrency: 640,
            //             Chunksize: 32768
            //         }, function(err) {
            //             if (err) throw err
            //             console.log("downloaded successfully")
            //         });
            //     }
            // });

            await sftp.connect(self.options)
                .then(async() => {
                    let data = await sftp.list('/');
                    console.log(data, 'the data info');
                    return data
                })
                .then(async(data) => {
                    if (data.length > 0) {
                        data.forEach(async(item) => {
                            console.log(item.name, 'item.name');
                            await sftp.fastGet('/' + item.name, self.localPath + item.name, {
                                concurrency: 640,
                                Chunksize: 32768
                            }, function(err) {
                                if (err) throw err
                                console.log("downloaded successfully")
                            });
                        });
                    }
                })
                .then((data) => { console.log('coucou') })
                .finally(() => sftp.end())


        } catch (err) {
            throw err;
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
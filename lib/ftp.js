// Modules
import ftp from "basic-ftp";

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
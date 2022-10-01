// Modules
const fs = require('fs');
const ftp = require("basic-ftp");

class Ftp {
    constructor(filesFolder = __dirname) {
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
    }

    disconnect(result, error) {
        const self = this;
        self.client.close();
        console.log('Connection closed');
        if (error) throw error;
    }

    show() {
        console.log('Local SASS: ' + this.localPathSASS);
        console.log('Remote CSS: ' + this.remotePathCSS);
    }

    upload() {
        const self = this;
        console.log('Uploading files');
        return self.connect().then((client) => {
            return self.client.uploadFromDir(self.localPathCSS, self.remotePathCSS).then((result) => {
                return self.disconnect(result);
            }).catch((error) => { return self.disconnect(null, error); });
        }).catch((error) => {
            return self.disconnect(null, error);
        });
    }

    download() {
        const self = this;
        console.log('Downloading files');
        console.log('To: ' + self.remotePathSASS);
        return self.connect().then((client) => {
            return self.client.downloadToDir(self.localPathSASS, self.remotePathSASS).then((result) => {
                console.log('Files downloaded');
                return self.disconnect(result);
            }); //.catch((error) => { return self.disconnect(null, error); });
            //}).catch((error) => {
            //return self.disconnect(null, error);
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
            host: self.config.host,
            //port: (self.config.port) ? connection.port : 21,
            user: self.config.user,
            password: self.config.password,
        };

        // Connection

        try {
            console.log('lets connect');
            return self.client.access(options).then(() => {
                console.log("Connected to ftp with host: " + self.config.host);

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

module.exports = Ftp;
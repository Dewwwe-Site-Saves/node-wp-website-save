// Cleanup class
const Cleanup = require('./lib/cleanup.js');
let clean = new Cleanup(__dirname);

// Convert class
const Convert = require('./lib/convert.js');
let sass = new Convert(__dirname);

// Ftp or Sftp 
function ftpConfig() {
    const fs = require('fs');

    try {
        data = fs.readFileSync('./config.txt', 'UTF-8');
        lines = data.split(/\r?\n/);

        // print all lines
        lines.forEach((line) => {
            if (line.includes('sftp: ')) {
                sftpConfig = line.replace('sftp: ', '') == 'true' ? true : false;
            }
        });
    } catch (err) {
        throw err;
    }

    if (sftpConfig) {
        console.log("Using sftp");

        const Sftp = require('./lib/sftp.js');
        return new Sftp(__dirname);
    } else {
        console.log("Using ftp");
        // Ftp class
        const Ftp = require('./lib/ftp.js');
        return new Ftp(__dirname);
    }

}
var connection = ftpConfig();


// Execution
clean.deleteFiles();
clean.createFiles();

// const Sftp = require('./lib/sftp.js');
// let test = new Sftp(__dirname);
// test.dowload();
connection.download().then(() => {
    sass.sassEncoding('compressed')
}).then(() => {
    sass.sassEncoding('expanded')
}).then(() => {
    connection.upload();
});
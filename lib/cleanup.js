// Modules
import fs from 'fs';
import rimraf from "rimraf";

class Cleanup {
    constructor(filesFolder = __dirname, folderName = 'mysite') {
        this.filesFolder = filesFolder;
        this.localPath = filesFolder + '/files/';
        this.localSitePath = this.localPath + folderName + '/';
        this.folderName = folderName;
        this.tempPath = this.localPath + folderName + '-temp/';
        this.mustCommitGitignore = false;
    }


    setupFiles() {
        // Checking and creating folder containing /files/
        this.checkOrCreate(this.filesFolder);

        // Checking and creating /files/
        this.checkOrCreate(this.localPath);

        // If mysite folder exists, delete everything except .git/ and README.md
        let exists = this.setupSiteFolder();

        return exists;
    }


    deleteFolder(path) {
        let noError = true;
        // Checks if path exists and deletes it
        console.log(` - - - Deleting ${path} - - - `);
        try {
            // Try to access /files/
            fs.accessSync(path, fs.F_OK);
            console.log(`${path} found`);

        } catch (err) {
            // Folder does not exist so ok
            console.log(`${path} does not exist`);
            //console.log(err);
            noError = false;

        } finally {
            if (noError) {
                // Folder exists so let's delete it
                try {
                    rimraf.sync(path);
                    console.log(`${path} deleted`);

                } catch (err) {
                    console.log(`Couldn't delete ${path}`);
                    throw err;
                }
            }
        }
    }

    moveFile(source, target) {
        fs.renameSync(source, target, (err) => {
            if (err) throw err;
            console.log(`${source} moved to ${target}`);
        });
    }

    copyFile(source, target) {
        fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL, (err) => {
            if (err) throw err;
            console.log(`${source} copied to ${target}`);
        });
    }

    setupSiteFolder() {
        let exists = false;
        if (fs.existsSync(this.localSitePath)) {
            exists = true;
            if (!fs.existsSync(this.localSitePath + '.git/')) {
                this.deleteFolder(this.localSitePath);
                exists = false;
            }
        }
        return exists;
    }

    cleanupSiteFolder() {
        if (fs.existsSync(this.localSitePath)) {
            // Check or create temp folder
            this.checkOrCreate(this.tempPath);

            // Copy .git/ and README.md  and '.github/workflows/auto-tagged-release.yml' to /files/
            this.moveFile(this.localSitePath + '.git/', this.tempPath + '.git/');
            try {
                this.moveFile(this.localSitePath + '.gitignore', this.tempPath + '.gitignore');
            } catch {
                console.log('No .gitignore found. Adding.');
                this.copyFile(this.filesFolder + '/helpers/.gitignore', this.tempPath + '.gitignore');
                this.mustCommitGitignore = true;
            }
            this.moveFile(this.localSitePath + 'README.md', this.tempPath + 'README.md');
            try {
                this.moveFile(this.localSitePath + '.github/workflows/auto-tagged-release.yml', this.tempPath + '.github/workflows/auto-tagged-release.yml');
            } catch {
                console.log('No Workflows found. Adding.');
                fs.mkdirSync(this.tempPath+'.github/');
                fs.mkdirSync(this.tempPath+'.github/workflows/');
                this.copyFile(this.filesFolder + '/helpers/auto-tagged-release.yml', this.tempPath + '.github/workflows/auto-tagged-release.yml');
            }

            // Delete /mysite/
            this.deleteFolder(this.localSitePath);

            // Create /mysite/
            this.checkOrCreate(this.localSitePath);

            // Copy .git/ and README.md back to /mysite/
            this.moveFile(this.tempPath + '.git/', this.localSitePath + '.git/');
            try {
                this.moveFile(this.tempPath + '.gitignore', this.localSitePath + '.gitignore');
            } catch {
                console.log('No .gitignore found');
            }
            this.moveFile(this.tempPath + 'README.md', this.localSitePath + 'README.md');
            this.moveFile(this.tempPath + '.github/', this.localSitePath + '.github/');

            // Delete /files/mysite-temp/
            this.deleteFolder(this.tempPath);
        }
    }

    getMustCommitGitignore(){
        return this.mustCommitGitignore
    }

    checkOrCreate(path) {
        if (!fs.existsSync(path)) {
            console.log(` - - - Creating ${path} - - - `);
            fs.mkdirSync(path);
            console.log(`${path} created.`);
        }
    }

}

// module.exports = Cleanup;
export default Cleanup;
// Modules
const ftp = require("basic-ftp");
const fs = require('fs');
var sass = require('sass');

class Convert {
    constructor(filesFolder = __dirname) {

        this.localPath = filesFolder + '/files/';
        this.localPathCSS = this.localPath + "css/";
        this.localPathSASS = this.localPath + "sass/";
    }

    sassEncoding(outputStyle) {
        let noError = true;

        // Dart SASS can be Expanded or Compressed.
        this.outputStyle = outputStyle;
        if (this.outputStyle == 'expanded') {
            this.pathCSS = this.localPathCSS + 'style.css';
        } else if (this.outputStyle == 'compressed') {
            this.pathCSS = this.localPathCSS + 'min/style.min.css';
        }

        // Rendering
        try {
            var result = sass.renderSync({
                file: this.localPathSASS + 'style.scss',
                outFile: this.pathCSS,
                outputStyle: this.outputStyle,
                sourceMap: true,
            });
            console.log('Converted to css');

        } catch (err) {
            console.log('Error while converting to SASS');
            noError = false;
            //throw err;
            return Promise.reject(err);
            throw new Error('Error while converting to SASS');
            return;

        } finally {
            if (noError) {
                // No errors during the compilation, write this result on the disk
                try {
                    fs.writeFileSync(this.pathCSS, result.css);
                    fs.writeFileSync(this.pathCSS + '.map', result.map);
                    console.log(`files '${this.pathCSS}' & '${this.pathCSS}.map' written on disk`);
                } catch (err) {
                    console.log('Error while writing file');
                    //throw err;
                    // return Promise.reject(err);
                    throw new Error('Error while converting to SASS');
                    return;
                }
            }
        }
    }

}

module.exports = Convert;
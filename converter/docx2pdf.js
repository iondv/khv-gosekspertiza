const {spawn} = require('child_process');
const path = require('path');

/**
 * @param {{}} options
 * @param {String} options.exePath
 * @constructor
 */
function Docx2pdf(options) {

  this.convert = function (readstream) {
    return new Promise((resolve, reject) => {
      if (!options.jrePath || !options.jarPath) {
        reject(new Error('converter path not found'));
      }
      try {
        let jre = path.isAbsolute(options.jrePath) ?
          options.jrePath :
          path.resolve(__dirname, '../../../', options.jrePath);
        let jar = path.isAbsolute(options.jarPath) ?
          options.jarPath :
          path.resolve(__dirname, '../../../', options.jarPath);
        const exe = spawn(jre, [
          '-jar', jar,
          '-f', path.resolve(__dirname, '../converter/fonts/', 'tnr.ttf')
        ]);
        readstream.pipe(exe.stdin);
        exe.stderr.on('data', (data) => {
          console.log(data);
        });
        resolve(exe.stdout);
      } catch (e) {
        reject(e);
      }
    });
  };

}

module.exports = Docx2pdf;

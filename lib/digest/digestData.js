/**
 * Created by kras on 26.09.16.
 */

const Preprocessor = require('core/interfaces/Preprocessor');
const base64 = require('base64-js');
const buf = require('core/buffer');

// jshint maxstatements: 50, maxcomplexity: 30
/**
 * @param {{}} poptions
 * @param {DataSource} poptions.dataSource
 * @param {String} [poptions.tplEncoding]
 * @param {Logger} [poptions.log]
 * @constructor
 */
function DigestData(poptions) {
  /**
   * @param {Item} item
   * @param {{}} [options]
   * @returns {Promise}
   */
  this._applicable = function (item, options) {
    return new Promise(((resolve) => {
      let result = false;
      switch (item.getMetaClass().getName()) {
        case 'gosEkspContract':
          if ([
            'gosEkspContract@khv-gosekspertiza.signSend',
            'gosEkspContract@khv-gosekspertiza.paperAgree',
            'gosEkspContract@khv-gosekspertiza.paperAgree_est',
            'gosEkspContract@khv-gosekspertiza.signSend_est'
          ].includes(options.action) && item.get('contFile')) {
            result = true;
          }
          break;
        case 'resolution':
          if (options.action === 'resolution@khv-gosekspertiza.sign_send') {
            if (item.get('remFile')) {
              resolve(true);
            }
          } else if (options.action === 'resolution@khv-gosekspertiza.sigHead') {
            if (item.get('remFile') && item.get('sigsExpEmpl')) {
              result = true;
            }
          }
          break;
        case 'gosEkspCancel':
          if ([
            'gosEkspCancel@khv-gosekspertiza.sendComment',
            'gosEkspCancel@khv-gosekspertiza.sendCancel',
            'gosEkspCancel@khv-gosekspertiza.excludeStat',
            'gosEkspCancel@khv-gosekspertiza.sendComment_est',
            'gosEkspCancel@khv-gosekspertiza.sendCancel_est',
            'gosEkspCancel@khv-gosekspertiza.excludeStat_est',
            'gosEkspCancel@khv-gosekspertiza.conf'
          ].includes(options.action) && item.get('fileSend')) {
            result = true;
          }
          break;
        case 'sigExpEmployee':
          if (options.action === 'sigExpEmployee@khv-gosekspertiza.sign') {
            if (item.get('result.fileResult') || item.get('result.files')) {
              result = true;
            }
          } else if (options.action === 'sigExpEmployee@khv-gosekspertiza.sign_res') {
            if (item.get('resolution.remFile')) {
              result = true;
            }
          }
          break;
        case 'result':
          if (options.action === 'result@khv-gosekspertiza.sigExp') {
            if (item.get('sigExpEmployee.sig')) {
              result = true;
            }
          } else if (options.action === 'result@khv-gosekspertiza.sigHead' ||
            options.action === 'result@khv-gosekspertiza.sigHead_est') {
            if (item.get('fileResult') || item.get('files')) {
              result = true;
            }
          }
          break;
        case 'expEmployee':
          if (options.action === 'expEmployee@khv-gosekspertiza.dva') {
            result = false;
          }
          break;
        case 'expertiseResult':
          if (options.action === 'expertiseResult@khv-gosekspertiza.signEGRZ') {
            if (item.get('printForm')) {
              result = true;
            }
          }
          break;
        default:
          result = false;
          break;
      }
      return resolve(result);
    }));
  };

  function _reader(f, data) {
    if (!f) {
      return Promise.reject(new Error('не передан файл'));
    }

    return f.getContents()
      .then((file) => {
        if (!file || !file.stream) {
          throw new Error('Не удалось прочитать файл договора!');
        }
        return new Promise((resolve, reject) => {
          file.stream
            .on('data', (d) => {
              data.push(buf(d));
            })
            .on('end', () => resolve())
            .on('error', reject);
        });
      });
  }

  function _processFile(file, data) {
    return _reader(file, data);
  }

  function _processFiles(files, data) {
    if (!Array.isArray(files) || !files.length) {
      return Promise.reject(new Error('файлы не найдены'));
    }

    let p = Promise.resolve();
    files.forEach((f) => {
      p = p.then(() => _reader(f, data));
    });

    return p;
  }

  function processFile(f, item, action) {
    if (!f) {
      return Promise.resolve([]);
    }

    const data = [];
    const reader = (Array.isArray(f)) ? _processFiles(f, data) : _processFile(f, data);

    return reader
      .then(() => {
        return {
          mimeType: 'text/plain',
          content: base64.fromByteArray(Buffer.concat(data)),
          attributes: {
            action: action || null,
            className: item.getMetaClass().getCanonicalName(),
            id: item.getItemId(),
            detached: true
          }
        };
      });
  }

  /**
   * @param {Item} item
     * @param {{}} [options]
     * @param {String} [options.action]
     * @returns {Promise}
     */
  this._process = function (item, options) {
    switch (item.getMetaClass().getName()) {
      case 'gosEkspContract':
        if ([
          'gosEkspContract@khv-gosekspertiza.signSend',
          'gosEkspContract@khv-gosekspertiza.paperAgree',
          'gosEkspContract.paperAgree_est',
          'gosEkspContract@khv-gosekspertiza.signSend_est'
        ].includes(options.action)) {
          return processFile(item.get('contFile'), item, options.action);
        }
        break;
      case 'resolution':
        if (options.action === 'resolution@khv-gosekspertiza.sign_send') {
          return processFile(item.get('remFile'), item, options.action);
        } else if (options.action === 'resolution@khv-gosekspertiza.sigHead') {
          return processFile([item.get('remFile'), item.get('sigsExpEmpl')], item, options.action);
        }
        break;
      case 'gosEkspCancel':
        if ([
          'gosEkspCancel@khv-gosekspertiza.sendComment',
          'gosEkspCancel@khv-gosekspertiza.sendCancel',
          'gosEkspCancel@khv-gosekspertiza.excludeStat',
          'gosEkspCancel@khv-gosekspertiza.sendComment_est',
          'gosEkspCancel@khv-gosekspertiza.sendCancel_est',
          'gosEkspCancel@khv-gosekspertiza.conf',
          'gosEkspCancel@khv-gosekspertiza.excludeStat_est'
        ].includes(options.action)) {
          return processFile(item.get('fileSend'), item, options.action);
        }
        break;
      case 'sigExpEmployee':
        if (options.action === 'sigExpEmployee@khv-gosekspertiza.sign') {
          return processFile(item.get('result.fileResult') || item.get('result.files'), item, options.action);
        } else if (options.action === 'sigExpEmployee@khv-gosekspertiza.sign_res') {
          return processFile(item.get('resolution.remFile'), item, options.action);
        }
        break;
      case 'result':
        if (options.action === 'result@khv-gosekspertiza.sigHead' ||
          options.action === 'result@khv-gosekspertiza.sigHead_est') {
          return processFile([item.get('fileResult') || item.get('files')], item, options.action);
        }
        break;
      case 'expertiseResult':
        if (options.action === 'expertiseResult@khv-gosekspertiza.signEGRZ') {
          return processFile(item.get('printForm'), item, options.action);
        }
        break;
      default: return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
}

DigestData.prototype = new Preprocessor();

module.exports = DigestData;

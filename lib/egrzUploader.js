const Background = require('core/impl/Background');
const LoggerProxy = require('core/impl/log/LoggerProxy');
const User = require('core/User');
const expertDirsToEgrz = require('applications/khv-gosekspertiza/paths_config/expertDirsToEgrz.json');
const {
  generateForceEnrichment,
  filterByExtension
} = require('./util');

const FE = generateForceEnrichment(expertDirsToEgrz);

/**
 * @param {{}} options
 * @param {Background} options.bg
 * @param {EgrzApi} options.egrzApi
 * @param {DataRepository} options.dataRepo
 * @param {ResourceStorage} options.storage
 * @param {String[]} [options.exclFormats]
 * @param {Logger} [options.log]
 */
module.exports = function EgrzFileUploader(options) {
  const egrzApi = options.egrzApi;
  const log = options.log || new LoggerProxy();
  const chunkSize = 1048576;

  this.exclFormats = options.exclFormats || [];

  this.init = () => {
    if (options.bg instanceof Background) {
      options.bg.register('egrzUploader');
    }
    return Promise.resolve();
  };

  function sendResult(msg) {
    if (process.send) {
      process.send(msg);
    }
  }

  function filesToUpload(dirs) {
    const ftu = [];
    Array.isArray(dirs) && dirs.forEach((dir) => {
      if (dir.get('SystemFolderID')) {
        const files = dir.getAggregates('files') || [];
        const filesMap = files
          .filter(file => filterByExtension(file.get('options.name'), options.exclFormats))
          .filter(file => file.get('state') !== 'upload')
          .map((file) => {
            return {file, dir};
          });
        ftu.push(...(filesMap));
      }
      ftu.push(...filesToUpload(dir.getAggregates('dirs')));
    });
    return ftu.sort(a => a.file.get('parentFile') ? 1 : -1);
  }

  function readStream(stream) {
    let missedErrors = [];

    const onMissedError = err => missedErrors.push(err);

    stream.on('error', onMissedError);

    let bufs = Buffer.from([]);

    function chunkSlice() {
      if (bufs.length >= chunkSize) {
        const result = bufs.slice(0, chunkSize);
        bufs = bufs.slice(chunkSize);
        return result;
      }
      return null;
    }

    return function readStreamFunc() {
      return new Promise((resolve, reject) => {
        let error = missedErrors.shift();
        if (error) {
          stream.removeListener('error', onMissedError);
          return reject(error);
        }

        if (!bufs) {
          return resolve();
        }

        const cs = chunkSlice();
        if (cs) {
          return resolve(cs);
        }

        stream.on('data', ondata);
        stream.on('error', onerror);
        stream.on('end', onend);
        stream.resume();

        function ondata(chunk) {
          bufs = Buffer.concat([bufs, chunk]);
          const csl = chunkSlice();
          if (csl) {
            stream.pause();
            cleanup();
            resolve(csl);
          }
        }

        function onend() {
          cleanup();
          resolve(bufs);
          bufs = null;
        }

        function onerror(err) {
          stream.removeListener('error', onMissedError);
          cleanup();
          reject(err);
        }

        function cleanup() {
          stream.removeListener('data', ondata);
          stream.removeListener('error', onerror);
          stream.removeListener('end', onend);
        }
      });
    };
  }

  function uploadToEgrz(chunk, token, options) {
    /*const {
      resumableChunkNumber,
      resumableIdentifier,
      systemFolderId,
      userFolderId
    } = options;*/
    return egrzApi.fileUpload(token, options, chunk)
      /*.then(() => true);
      .then(() => egrzApi.fileUploadCheck(
        token, resumableChunkNumber, resumableIdentifier, systemFolderId, userFolderId
      ))*/
      .then(() => true);
  }

  function uploadWorker(reader, token, options, index) {
    index = index || 1;
    return reader()
      .then((data) => {
        if (!data) {
          return true;
        }
        const opts = Object.assign(
          options,
          {
            resumableChunkNumber: index,
            resumableChunkSize: data.length,
            resumableCurrentChunkSize: data.length
          }
        );
        log.info(`Оправка ${index}/${options.resumableTotalChunks} "${options.resumableFilename}" в ЕГРЗ`);
        return uploadToEgrz(data, token, opts)
          .then(() => uploadWorker(reader, token, options, ++index));
      });
  }

  function changeFileState(file, state, user, message) {
    sendResult({file: file.get('id'), state});
    const upd = {state, message};
    return options.dataRepo.editItem(file.getClassName(), file.getItemId(), upd, null, {user});
  }

  function uploader(expertise, dir, file, fileData, params) {
    log.info(`Загрузка "${file}" в ЕГРЗ`);
    const {token, user} = params;
    const totalSize = parseInt(fileData.options.getcontentlength);
    const opts = {
      resumableTotalSize: totalSize,
      resumableType: fileData.options.getcontenttype,
      resumableIdentifier: file.get('resumableIdentifier'),
      resumableFilename: fileData.options.name,
      resumableRelativePath: fileData.options.name,
      resumableTotalChunks: Math.ceil(totalSize / chunkSize),
      entityId: expertise.get('incidentId'),
      SystemFolderID: dir.get('SystemFolderID') || 'null',
      UserFolderID: 'null',
      entityName: dir.get('entityName') || 'iteco_expertise_results',
      parentFile: file.get('parentFile.resumableIdentifier') || 'null'
    };
    if (file.get('isConclusionDocument')) {
      opts.isConclusionDocument = 'true';
    }
    let reader = readStream(fileData.stream);
    return changeFileState(file, 'wait', user)
      .then(() => uploadWorker(reader, token, opts))
      .then(() => {
        log.info(`Файл "${file}" загружен`);
        return changeFileState(file, 'upload', user);
      })
      .catch((err) => {
        const message = `[Status:${err.statusCode || ''}] ${err.message}`;
        log.warn(`Ошибка загрузки "${file}" в ЕГРЗ: ${message}`);
        return changeFileState(file, 'cancel', user, message);
      });
  }

  function fetchFile(id) {
    log.info(`Получение ${id} из хранилища`);
    return options.storage.fetch([id], {fetchInfo: true})
      .then((storedFile) => {
        if (storedFile && storedFile[0] && storedFile[0].getContents) {
          return storedFile[0].getContents();
        }
      })
      .then((obj) => {
        if (!obj || !obj.stream) {
          log.warn(`Не удалось получить ${id} из хранилища`);
          return null;
        }
        return obj;
      });
  }

  this.run = (params) => {
    log.info(`Начало выполнения загрузки файлов ${params.class}@${params.id} в ЕГРЗ`);
    params.user = new User({id: params.user});
    const opts = {
      forceEnrichment: FE,
      user: params.user
    };
    return options.dataRepo.getItem(params.class, params.id, opts)
      .then((item) => {
        const dir = item.getAggregate('dir');
        if (!dir) {
          return {};
        }
        const files = filesToUpload([dir]);
        log.info(`Файлов для загрузки: ${files.length}`);
        let promise = Promise.resolve();
        files.forEach(({file, dir}) => {
          log.info(`Начало загрузки файла ${file}`);
          const link = file.get('link');
          if (link) {
            promise = promise
              .then(() => fetchFile(link))
              .then(fileParams => fileParams && uploader(item, dir, file, fileParams, params));
          } else {
            log.warn(`Не найдена ссылка для файла ${file}`);
          }
        });
        return promise
          .then(() => {
            log.info(`Загрузка файлов ${params.class}@${params.id} в ЕГРЗ выполнена`);
            return true;
          });
      });
  };

  /**
   * @param {{}} opts
   * @param {String} opts.class
   * @param {String} opts.id
   * @returns {Promise}
   */
  this.result = function (opts) {
    if (options.bg instanceof Background) {
      return options.bg.results(opts.id, 'egrzUploader', opts.class);
    }
    return Promise.resolve(null);
  };

  this.upload = (opts) => {
    if (options.bg instanceof Background) {
      return this.result(opts)
        .then(() => options.bg.start(opts.id, 'egrzUploader', opts.class, opts));
    }
    throw new Error('Invalid configuration!');
  };

  /**
   * @param {{}} opts
   * @param {String} opts.class
   * @param {String} opts.id
   * @returns {Promise.<Boolean>}
   */
  this.status = function (opts) {
    if (options.bg instanceof Background) {
      return options.bg.status(opts.id, 'egrzUploader', opts.class).then(status => status === Background.RUNNING);
    }
    return Promise.resolve(false);
  };

};

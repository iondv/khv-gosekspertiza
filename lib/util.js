const StoredFile = require('core/interfaces/ResourceStorage/lib/StoredFile');
const _ = require('lodash');
const path = require('path');
const moment = require('moment-timezone');

function path2name(dir) {
  if (dir[0] === '/') {
    dir = dir.substr(1);
  }
  if (dir.substr(-1) === '/') {
    dir = dir.slice(0, -1);
  }
  return dir.split('/').pop();
}

function filterByExtension(fileName, exclude) {
  if (!fileName) {
    return false;
  }
  if (!Array.isArray(exclude)) {
    return true;
  }
  const name = path.basename(fileName);
  const formats = exclude
    .map(f => f[0] === '.' ? f : `.${f}`)
    .filter(f => name.slice(name.length - f.length) === f);
  return !(formats.length);
}

function loadCloudDirStructure(link, storage, exclude) {
  return storage.getDir(link)
    .then((dir) => {
      if (!dir) {
        return null;
      }
      let result = {
        name: path2name(dir.name),
        files: dir.files.filter(f => filterByExtension(f.name, exclude)),
        dirs: []
      };
      let promise = Promise.resolve();
      if (Array.isArray(dir.dirs)) {
        dir.dirs.forEach((subDir) => {
          promise = promise
            .then(() => loadCloudDirStructure(subDir.link, storage, exclude))
            .then(subDirStruct => result.dirs.push(subDirStruct));
        });
      }
      return promise.then(() => result);
    });
}

function loadRef(container, className, metaRepo, dataRepo, options) {
  return new Promise((resolve, reject) => {
    const objId = container.get(className);
    if (!objId) {
      return reject(new Error(`не найден объект ${className}`));
    }
    const obj = container.getAggregate(className);
    const cm = obj ? obj.getMetaClass() : metaRepo.getMeta(className, null, container.getMetaClass().getNamespace());
    if (!cm) {
      return reject(new Error(`не найдена мета для ${className}`));
    }
    dataRepo.getItem(obj || cm.getCanonicalName(), obj ? null : objId, options)
      .then((item) => {
        if (!item) {
          return reject(new Error(`не найден объект ${className}`));
        }
        return resolve(item);
      })
      .catch(reject);
  });
}

function loadCollection(container, className, dataRepo, options) {
  return new Promise((resolve, reject) => {
    const list = container.getAggregates(className);
    if (Array.isArray(list)) {
      return resolve(list);
    }
    return dataRepo.getAssociationsList(container, className, options)
      .then((collection) => {
        if (!Array.isArray(collection)) {
          return reject(new Error(`не найдена коллекция ${className}`));
        }
        return resolve(collection);
      });
  });
}

function difference(object, base) {
  function changes(object, base) {
    return _.transform(object, (result, value, key) => {
      if (!_.isEqual(value, base[key])) {
        result[key] = (_.isObject(value) && _.isObject(base[key])) ? changes(value, base[key]) : value;
      }
    });
  }
  return changes(object, base);
}

function readStreamData(stream) {
  return new Promise(((resolve, reject) => {
    if (!stream) {
      reject(new Error('Файл не найден!'));
    }

    let d = Buffer.from([]);
    stream
      .on('data',
        (sd) => {
          d = Buffer.concat([d, sd]);
        })
      .on('end',
        () => {
          resolve(d);
        })
      .on('error', reject);
  }));
}

function getFileContents(file) {
  if (!file || !(file instanceof StoredFile)) {
    throw new Error('Файл не найден!');
  }

  return file.getContents()
    .then((content) => {
      if (!content) {
        throw new Error('ошибка чтения файла');
      }
      return readStreamData(content.stream);
    });
}

function createDir(dirName, dirs, parentDir, storage) {
  let promise = storage.createDir(dirName, parentDir);
  if (dirs[dirName]) {
    promise = promise.then(() => createDirs(dirs[dirName], parentDir + '/' + dirName, storage));
  }
  return promise;
}

function createDirs(dir, parentDir, storage) {
  if (!dir) {
    return Promise.resolve();
  }
  let promise = Promise.resolve();
  Object.keys(dir).forEach((name) => {
    promise = promise.then(() => createDir(name, dir, parentDir, storage));
  });
  return promise;
}

function getFolderDepth(dir) {
  let depth = 1;
  if (!dir || !dir.dirs) {
    return depth;
  }
  const flat = dirs => Object.keys(dirs).map(d => dirs[d]);
  let dirs = flat(dir.dirs);
  while (dirs.length) {
    depth++;
    let tmp = [];
    dirs.map((d) => {
      if (d && d.dirs) {
        tmp.push(...flat(d.dirs));
      }
    });
    dirs = tmp;
  }
  return depth;
}

function generateForceEnrichment(expertDirsToEgrz, pre) {
  let depth = 0;
  pre = Array.isArray(pre) ? pre : [];
  Object.keys(expertDirsToEgrz).forEach((docTypeObj) => {
    Object.keys(expertDirsToEgrz[docTypeObj]).forEach((typeObj) => {
      const d = getFolderDepth(expertDirsToEgrz[docTypeObj][typeObj]);
      if (d > depth) {
        depth = d;
      }
    });
  });
  const fe = [];
  const dirs = [];
  for (let i = 0; i < depth; i++) {
    fe.push(
      [...pre, 'dir', ...dirs, 'files'],
      [...pre, 'dir', ...dirs, 'files', 'options'],
      [...pre, 'dir', ...dirs, 'files', 'parentFile']
    );
    dirs.push('dirs');
  }
  return fe;
}

function enrichCloudDirStructure(className, id, user, dataRepo, ownCloud, exclude) {
  exclude = exclude || [];
  let petitionProperty;
  let petition;
  switch (className) {
    case 'inspection@khv-gosekspertiza':
      petitionProperty = 'petitionExpert'; break;
    case 'inspectionEstimate@khv-gosekspertiza':
      petitionProperty = 'petitionEstimated'; break;
    case 'expertiseResult@khv-gosekspertiza': 
      petitionProperty = 'result.petitionExpert'; break;
    default: 
      throw new Error('wrong item');
  }

  const properties = petitionProperty.split('.');

  const opts = {
    user,
    forceEnrichment: [properties]
  };

  return dataRepo.getItem(className, id, opts)
    .then((item) => {
      let tmp = item;
      for (let i = 0; i < properties.length; i++) {
        tmp = tmp && tmp.getAggregate(properties[i]);
        if (i === properties.length - 1) {
          petition = tmp;
        }
      }
      if (!petition) {
        return {};
      }
      const cloudObj = petition.get('cloudObj');
      if (!cloudObj) {
        return {};
      }
      return loadCloudDirStructure(cloudObj, ownCloud, exclude);
    })
    .then((dirStruct) => {
      const cloudObjText = JSON.stringify(dirStruct);
      if (petition.get('cloudObjText') !== cloudObjText) {
        return dataRepo.editItem(
          petition.getMetaClass().getCanonicalName(),
          petition.getItemId(),
          {cloudObjText}
        ).then(() => dirStruct);
      }
      return dirStruct;
    });
}

function dateWithTimezone(date, tz) {
  const originalDate = date || new Date();
  const tzDate = tz && moment(originalDate).tz(tz) || moment(originalDate);
  return tzDate;
}

module.exports = {
  path2name,
  filterByExtension,
  loadCloudDirStructure,
  loadRef,
  loadCollection,
  difference,
  readStreamData,
  getFileContents,
  createDirs,
  generateForceEnrichment,
  enrichCloudDirStructure,
  dateWithTimezone
};

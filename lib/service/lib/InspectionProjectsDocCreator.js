/**
 * Created by Vasiliy Ermilov (ermilov.work@yandex.ru) on 10/18/16.
 */
function getPetition(target, dataRepo) {
  if (['petitionExpert', 'petitionEstimated'].indexOf(target.getMetaClass().getName()) > -1) {
    return Promise.resolve(target);
  } else if (['inspection','inspectionEstimate'].indexOf(target.getMetaClass().getName()) > -1) {
    var property = target.getMetaClass().getName() === 'inspection' ? 'petitionExpert' : 'petitionEstimated';
    var p = target.property(property);
    var result = p.evaluate();
    if (result) {
      return Promise.resolve(result);
    } else {
      return dataRepo.getItem(p.meta._refClass.getCanonicalName(), target.get(property));
    }
  }
  return Promise.reject(new Error('Не удалось определить исходные данные'));
}

function getCloudInfo(target, options) {
  let cloud = {};
  return getPetition(target, options.dataRepository)
    .then((petition) => {
      if (!petition) {
        throw new Error('Не найден объект заявления');
      }
      cloud.cloudObj = petition.get('cloudObj');
      if (!cloud.cloudObj) {
        return new Error('Для заявления не сформировано хранилище документов');
      }
      return options.dirHelper.getPetitionCloudDir(petition);
    })
    .then((c) => {
      if (!c || !c.dir) {
        throw new Error('не найдена директория в OwnCloud');
      }
      cloud.dir = c.dir;
      return cloud;
    });
}

function getInspection(target, forcedInsp, dataRepo) {
  if (['inspection','inspectionEstimate'].indexOf(target.getMetaClass().getName()) > -1) {
    return Promise.resolve(target);
  } else if (['petitionExpert', 'petitionEstimated'].indexOf(target.getMetaClass().getName()) > -1) {
    var property = target.getMetaClass().getName() === 'petitionExpert' ? 'inspection' : 'inspectionEstimate';
    var p = target.property(property);
    var result = p.evaluate();
    if (result) {
      return Promise.resolve(result);
    } else {
      return dataRepo.getItem(
        p.meta._refClass.getCanonicalName(),
        forcedInsp || target.get(property)
      );
    }
  }
  throw new Error('Не удалось определить исходные данные.');
}

function saveDocFolder(dir, inspectionId, backRef, projectsDocId, options) {
  let data = {
    name: dir.id,
    link: dir.link
  };
  data[backRef] = projectsDocId;
  let projectsDocFolder = options.metaRepository.getMeta('projectsDocFolder', null, options.namespace);
  return options.dataRepository.createItem(projectsDocFolder.getCanonicalName(), data)
    .then(pdf => createProjectDocs(dir.id, pdf, 'docs', inspectionId, options));
}

/**
 *
 * @returns {Promise}
 */
function createProjectsDocFolder(dirPath, projectsDocId, inspectionId, backRef, options) {
  return new Promise(function (resolve, reject) {
    options.ownCloudStorage.getDir(dirPath)
      .then(function (dirObject) {
        if (dirObject) {
          let p;
          dirObject.dirs.forEach((d) => {
            if (p) {
              p = p.then(() => saveDocFolder(d, inspectionId, backRef, projectsDocId, options));
            } else {
              p = saveDocFolder(d, inspectionId, backRef, projectsDocId, options);
            }
          });
          if (p) {
            p.then(resolve).catch(reject);
          } else {
            resolve();
          }
        } else {
          reject(new Error('directory not found'));
        }
      }).catch(reject);
  });
}

function createProjectDocs(dirId, master, collection, inspection, options) {
  return new Promise(function (resolve, reject) {
    options.ownCloudStorage.getDir(dirId)
      .then(function (dirObject) {
        if (dirObject) {
          let projectDoc = options.metaRepository.getMeta('projectDoc', null, options.namespace).getCanonicalName();
          let promises = [];
          for (let i = 0; i < dirObject.files.length; i++) {
            promises.push(options.dataRepository.createItem(projectDoc, {inspection,link: dirObject.files[i].link}));
          }
          Promise.all(promises)
            .then(function (items) {
              return options.dataRepository.put(master, collection, items);
            }).then(resolve).catch(reject);
        } else {
          reject(new Error('directory not found'));
        }
      }).catch(reject);
  });
}

/**
 * @param {Item} target
 * @param {{dataRepository: DataRepository}} options
 * @param {String} forcedInsp
 * @returns {Promise}
 */
module.exports = function (target, options, forcedInsp) {
  return Promise.all([
      getCloudInfo(target, options),
      getInspection(target, forcedInsp, options.dataRepository)
    ])
    .then(([{link,dir}, insp]) => {
      let projectsDoc = options.metaRepository.getMeta('projectsDoc', null, options.namespace).getCanonicalName();
      return options.dataRepository.createItem(projectsDoc, {inspection: insp.getItemId(), link})
        .then(pd => {
          return options.dataRepository.editItem(insp.getClassName(), insp.getItemId(), {projectDoc: pd.getItemId()});
        })
        .then(insp => {
          let p, p1;
          let pd = insp.get('projectDoc');
          let inspId = insp.getItemId();
          for (let i = 0; i < dir.dirs.length; i++) {
            if (dir.dirs[i].id.indexOf('Проектная документация') > -1) {
              p1 = createProjectsDocFolder(dir.dirs[i].id, pd, inspId, 'projectsDoc', options);
            } else if (dir.dirs[i].id.indexOf('Исходно-разрешительная документация') > -1) {
              p1 = createProjectsDocFolder(dir.dirs[i].id, pd, inspId, 'irdDoc', options);
            } else if (dir.dirs[i].id.indexOf('Результаты инженерных изысканий') > -1) {
              p1 = createProjectsDocFolder(dir.dirs[i].id, pd, inspId, 'riiDoc', options);
            } else if (dir.dirs[i].id.indexOf('Сметная документация') > -1) {
              p1 = createProjectsDocFolder(dir.dirs[i].id, pd, inspId, 'sdDoc', options);
            }

            p = p ? p.then(p1) : p1;
          }
          return p;
        });
    });
};

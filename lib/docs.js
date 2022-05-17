/**
 * Created by kras on 21.11.16.
 */

const petitionExpertDirCreator = require('./service/lib/PetitionExpertDirCreator');
const inspectionProjectsDocCreator = require('./service/lib/InspectionProjectsDocCreator');
const ShareAccessLevel = require('core/interfaces/ResourceStorage/lib/ShareAccessLevel');
const moment = require('moment-business-days');
const {loadCloudDirStructure} = require('./util');

/**
 * @param {{}} options
 * @param {DataRepository} options.dataRepository
 * @param {MetaRepository} options.metaRepository
 * @param {OwnCloudStorage} options.ownCloudStorage
 * @param {SoapClient} options.soap
 * @param {String} options.namespace
 * @param {{}} options.dirHelper
 * @param {Logger} [options.log]
 * @constructor
 */
function DocPublisher(options) {
  if (!options.dataRepository) {
    throw new Error('Не указан dataRepository!');
  }

  if (!options.ownCloudStorage) {
    throw new Error('Не указан ownCloudStorage!');
  }

  if (!options.metaRepository) {
    throw new Error('Не указан metaRepository!');
  }

  if (!options.namespace) {
    throw new Error('Не указан namespace');
  }

  if (!options.soap) {
    throw new Error('Не указан soap');
  }

  options.dataRepository.on([
    `inspection@${options.namespace}.edit`,
    `inspectionEstimate@${options.namespace}.edit`
  ], e => new Promise((resolve, reject) => {
    let property;
    if (e.item && e.item.getMetaClass().getName() === 'inspection') {
      property = 'petitionExpert';
    } else if (e.item && e.item.getMetaClass().getName() === 'inspectionEstimate') {
      property = 'petitionEstimated';
    }

    if (property && e.updates && e.updates[property] && e.item.get(property)) {
      inspectionProjectsDocCreator(e.item, options)
        .then(() => resolve())
        .catch(reject);
    } else {
      resolve();
    }
  }));

  options.dataRepository.on([
    `inspection@${options.namespace}.edit`,
    `inspectionEstimate@${options.namespace}.edit`
  ], e => new Promise((resolve) => {
    if (e.item
      && e.updates
      && ((e.item.getMetaClass().getName() === 'inspection' && e.updates.state === 'concl' && e.item.get('repeatedly'))
        || (e.item.getMetaClass().getName() === 'inspectionEstimate'
          && e.updates.status === 'concl'
          && e.item.get('repeatedly')))
    ) {
      options.ownCloudStorage.deleteShare(e.item.get('repeatedly'))
        .then(() => resolve())
        .catch((err) => {
          if (options.log) {
            const warn = 'Ошибка выполнения ownCloudStorage.deleteShare';
            options.log.warn(`${e.type}: ${warn}: ${err.message}`);
          }
          return resolve();
        });
    } else {
      return resolve();
    }
  }));

  options.dataRepository.on([
    `inspection@${options.namespace}.edit`,
    `inspection@${options.namespace}.edit`,
    `inspectionEstimate@${options.namespace}.save`,
    `inspectionEstimate@${options.namespace}.save`
  ], e => new Promise((resolve) => {
    if (e.item && e.updates && e.updates.planDate) {
      try {
        const planDate = moment(e.updates.planDate);
        const next5 = moment().businessAdd(5);
        const isAfter = moment(planDate).isAfter(next5);
        if (!isAfter) {
          return resolve();
        }

        const resolutions = e.item.getAggregates('resolution');
        let promise = Promise.resolve();
        if (Array.isArray(resolutions)) {
          resolutions.forEach((resolution) => {
            const shareLink = resolution && resolution.get('repeatedly');
            if (shareLink) {
              promise = promise.then(() => options.ownCloudStorage.setShareAccess(shareLink, ShareAccessLevel.READ));
            }

            if (resolution) {
              promise = promise.then(() => options.dataRepository.editItem(resolution.getClassName(),
                resolution.getItemId(),
                {stateRemPet: 'end'}));
            }
          });
        }
        promise
          .then(() => resolve())
          .catch((err) => {
            if (options.log) {
              const warn = 'Ошибка выполнения';
              options.log.warn(`${e.type}: ${warn}: ${err.message}`);
            }
            return resolve();
          });
      } catch (err) {
        if (options.log) {
          const warn = 'Ошибка выполнения';
          options.log.warn(`${e.type}: ${warn}: ${err.message}`);
        }
        return resolve();
      }
    } else {
      return resolve();
    }
  }));

  options.dataRepository.on([
    `inspection@${options.namespace}.create`,
    `inspectionEstimate@${options.namespace}.create`
  ], e => new Promise(((resolve, reject) => {
    let property;
    if (e.item && e.item.getMetaClass().getName() === 'inspection') {
      property = 'petitionExpert';
    } else if (e.item && e.item.getMetaClass().getName() === 'inspectionEstimate') {
      property = 'petitionEstimated';
    }

    if (property && e.item.get(property)) {
      inspectionProjectsDocCreator(e.item, options)
        .then(() => resolve())
        .catch(reject);
    } else {
      resolve();
    }
  })));

  if (options.createDirsOnPetionEdit) {
    options.dataRepository.on([
      `petitionExpert@${options.namespace}.edit`,
      `petitionEstimated@${options.namespace}.edit`
    ], e => new Promise(((resolve, reject) => {
      if (e.updates && e.updates.inspection) {
        inspectionProjectsDocCreator(e.item, options, e.updates.inspection)
          .then(() => resolve())
          .catch(reject);
      } else {
        resolve();
      }
    })));
  }

  options.dataRepository.on([
    `petitionExpert@${options.namespace}.create`,
    `petitionEstimated@${options.namespace}.create`
  ], e => new Promise(((resolve, reject) => {
    if (e.data.status == 37 && e.data.petBase) { // jshint ignore:line
      options.dataRepository.getItem(e.item.getClassName(), e.data.petBase)
        .then((petBase) => {
          if (!petBase) {
            return reject(new Error('не найден petBase'));
          }

          const updates = {
            cloudObj: petBase.get('cloudObj'),
            cloudObjShare: petBase.get('cloudObjShare')
          };
          return resolve(updates);
        })
        .catch(reject);
    } else {
      petitionExpertDirCreator(e.item, options)
        .then((dirInfo) => {
          if (!dirInfo) {
            throw new Error('не удалось получить share');
          }

          let promise = Promise.resolve();
          if ([23, 24].indexOf(parseInt(e.data.status)) > -1) {
            promise = options.ownCloudStorage.share(dirInfo.cloudObj, null, {shareWith: ['user']})
              .catch((err) => {
                options.log && options.log.warn(err.message);
                return dirInfo;
              });
          }

          return promise.then(() => dirInfo);
        })
        .then((dirInfo) => {
          if (e.data && e.data.inspection) {
            return options.dataRepository.editItem(e.item.getClassName(), e.item.getItemId(), dirInfo)
              .then(item => inspectionProjectsDocCreator(item, options, e.data.inspection))
              .then(() => {
                return {};
              });
          }
          return dirInfo;
        })
        .then(resolve)
        .catch(reject);
    }
  })));

  options.dataRepository.on([
    `petitionExpert@${options.namespace}.edit`,
    `petitionEstimated@${options.namespace}.edit`,
    `petitionExpert@${options.namespace}.save`,
    `petitionEstimated@${options.namespace}.save`
  ], e => new Promise(((resolve) => {
    if (e.updates && (['24', '26', '27'].indexOf(e.updates.status) > -1)) {
      const cloudObj = e.item.get('cloudObj');
      if (!cloudObj) {
        return resolve();
      }

      const access = e.updates.status === '24' ? ShareAccessLevel.READ : ShareAccessLevel.WRITE;
      options.ownCloudStorage.setShareAccess(cloudObj, access)
        .then(() => {
          if (e.updates.status === '24') {
            return options.ownCloudStorage.share(cloudObj, null, {shareWith: ['user']})
              .then(() => loadCloudDirStructure(cloudObj, options.ownCloudStorage));
          }
          return null;
        })
        .then((dir) => {
          let upd = null;
          if (dir) {
            try {
              upd = {cloudObjText: JSON.stringify(dir)};
            } catch (e) {
              upd = null;
            }
          }
          resolve(upd);
        })
        .catch((err) => {
          if (options.log) {
            const warn = 'Ошибка выполнения ownCloudStorage.setShareAccess';
            options.log.warn(`${e.type}: ${warn}: ${err.message}`);
          }
          return resolve();
        });
    } else {
      resolve();
    }
  })));

  options.dataRepository.on([
    `petitionExpert@${options.namespace}.edit`,
    `petitionEstimated@${options.namespace}.edit`,
    `petitionExpert@${options.namespace}.save`,
    `petitionEstimated@${options.namespace}.save`
  ], e => new Promise((resolve, reject) => {
    if (e.updates && e.updates.status) {
      const isPetitionExpert = e.item.getMetaClass().getName() === 'petitionExpert';
      const serviceName = isPetitionExpert ? 'servicePetition' : 'servicePetitionEstimated';
      const soapReq = isPetitionExpert ? 'updateSmvKhvGosEksp' : 'updateSmvKhvGosEstimated';
      const propName = isPetitionExpert ? 'smvKhvGosEksp' : 'smvKhvGosEstimated';
      const service = options.soap.service(options[serviceName]);
      if (service) {
        const data = {
          guid: e.item.get('guid'),
          state: {code: e.updates.status},
          cloudObjtrue: e.item.get('cloudObjtrue')
        };
        service[soapReq]({[propName]: data})
          .catch((err) => {
            if (options.log) {
              const warn = `Ошибка запроса к сервису ${soapReq}[${propName}]`;
              options.log.warn(`${e.type}: ${warn}: ${err.message}`);
            }
          })
          .then(() => resolve());
      } else {
        reject(new Error('Не настроен компонент обмена данными с внешней системой!'));
      }
    } else {
      return resolve();
    }
  }));

  options.dataRepository.on([
    `resolution@${options.namespace}.edit`,
    `resolution@${options.namespace}.save`
  ], e => new Promise((resolve) => {
    if (e.updates && e.updates.stateRemPet === 'resp') {
      const shareLink = e.item.get('repeatedly');
      if (!shareLink) {
        return resolve();
      }

      options.ownCloudStorage.setShareAccess(shareLink, ShareAccessLevel.READ)
        .then(() => resolve())
        .catch((err) => {
          if (options.log) {
            const warn = 'Ошибка выполнения ownCloudStorage.setShareAccess';
            options.log.warn(`${e.type}: ${warn}: ${err.message}`);
          }
          resolve();
        });
    } else {
      return resolve();
    }
  }));
}

module.exports = DocPublisher;

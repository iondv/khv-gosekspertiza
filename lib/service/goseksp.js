/**
 * Created by Vasiliy Ermilov (ermilov.work@yandex.ru) on 10/14/16.
 */

const Service = require('modules/rest/lib/interfaces/Service');
const petitionExpertDirCreator = require('./lib/PetitionExpertDirCreator');
const PetitionExpertCloudObject = require('./lib/PetitionExpertCloudObject');
const InspectionProjectsDocCreator = require('./lib/InspectionProjectsDocCreator');

function GosekspService(options) {

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

  function inspectionProjectsDocHandler(values) {
    return new Promise(function (resolve,reject) {
      if (values && values.master && values.details) {
        var promises = [];
        if (Array.isArray(values.details)) {
          values.details.forEach(function (detail) {
            promises.push(InspectionProjectsDocCreator(values.master, detail, options));
          });
        }
        Promise.all(promises).then(resolve).catch(reject);
      } else {
        reject();
      }
    });
  }

  options.dataRepository.on('petitionExpert.inspection.put', inspectionProjectsDocHandler);
  options.dataRepository.on('petitionEstimated.inspectionEstimate.put', inspectionProjectsDocHandler);

  this._handle = function (req) {
    return new Promise(function (resolve, reject) {
      var method = req.get('goseksp-method');
      if (method) {
        if (method === 'PetitionExpertDirCreate') {
          petitionExpertDirCreator(req.body, options)
            .then((shareObj) => {
              if (shareObj) {
                resolve({data: shareObj});
              } else {
                reject(new Error('не удалось получить share'));
              }
            })
            .catch(reject);
        } else if (method === 'PetitionExpertCloudObject') {
          PetitionExpertCloudObject(req.body, options, function (err, result) {
            if (!err && result) {
              resolve({data: result});
            } else {
              reject(err || new Error('не удалось получить ответ'));
            }
          });
        } else {
          resolve({data: 'указан не правильный метод'});
        }
      } else {
        resolve({data: 'не указан метод'});
      }
    });
  };
}

GosekspService.prototype = new Service();

module.exports = GosekspService;

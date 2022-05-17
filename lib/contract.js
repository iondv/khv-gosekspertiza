/**
 * Created by krasilneg on 26.11.16.
 */

const path = require('path');
const normalize = require('core/util/normalize');
const StoredFile = require('core/interfaces/ResourceStorage/lib/StoredFile');
const ShareAccessLevel = require('core/interfaces/ResourceStorage/lib/ShareAccessLevel');
const JSZip = require('jszip');
const moment = require('moment-timezone');
const {
  loadRef, readStreamData, getFileContents, createDirs, dateWithTimezone
} = require('./util');
const dirStructures = require('applications/khv-gosekspertiza/paths_config/petitionExpertDirs.json');
const ItemToDocx = require('modules/registry/export/itemToDocx');

/**
 * @param {{service: String}} options
 * @param {WorkflowProvider} options.workflows
 * @param {SoapClient} options.soap
 * @param {DataRepository} options.dataRepo
 * @param {MetaRepository} options.metaRepo
 * @param {OwnCloudStorage} options.ownCloudStorage
 * @param {{}} options.docx2pdf
 * @param {{}} options.dirHelper
 * @param {Logger} [options.log]
 * @constructor
 */
function Contract(options) {
  function resolveOnError(event, msg) {
    return err => options.log && options.log.warn(`${event.type}: ${msg}: ${err.message}`);
  }

  function fileLoader(data, nm) {
    const f = data[nm];
    return getFileContents(f).then((d) => {data[nm] = d;});
  }

  function formFileLoaders(data, loaders) {
    for (const nm in data) {
      if (data.hasOwnProperty(nm)) {
        if (data[nm] instanceof StoredFile) {
          data[`${nm}Name`] = data[nm].name;
          if (data[nm].options.mimeType) {
            data[`${nm}Mime`] = data[nm].options.mimeType;
          }
          loaders.push(fileLoader(data, nm));
        } else if (typeof data[nm] === 'object' && data[nm]) {
          formFileLoaders(data[nm], loaders);
        }
      }
    }
  }

  function processFiles(data) {
    return new Promise(((resolve, reject) => {
      const loaders = [];
      formFileLoaders(data, loaders);
      Promise.all(loaders).then(resolve)
        .catch(reject);
    }));
  }

  options.workflows.on(
    'gosEkspContract@khv-gosekspertiza.sndApp',
    e => new Promise((resolve, reject) => {
      const service = options.soap.service(options.service);
      if (!service) {
        return reject(new Error('Не настроен компонент обмена данными с внешней системой!'));
      }
      const contract = service._parse(e.item, 'gosEkspContract');
      contract.khvGosEksp = contract.petitionExpert || contract.petitionEstimated;
      if (contract.khvGosEksp && typeof contract.khvGosEksp === 'object') {
        contract.khvGosEksp = contract.khvGosEksp.guid;
      }
      processFiles(contract)
        .then(() => service.createGosEkspContract({gosEkspContract: contract})
          .catch(resolveOnError(e, 'Ошибка запроса к сервису createGosEkspContract[gosEkspContract]'))
        )
        .then(() => resolve())
        .catch(reject);
    })
  );

  function soapServiceAction(serviceName, actionName, soapProperty, data, event) {
    return new Promise((resolve, reject) => {
      const service = options.soap.service(serviceName);
      if (!service) {
        return reject(new Error('Не настроен компонент обмена данными с внешней системой!'));
      }
      service[actionName]({[soapProperty]: data})
        .catch(resolveOnError(event, `Ошибка запроса к сервису ${actionName}[${soapProperty}]`))
        .then(() => resolve());
    });
  }

  options.workflows.on(
    'resolution@khv-gosekspertiza.send',
    e => new Promise((resolve, reject) => {
      let property;
      if (e.item.get('inspection')) {
        property = 'inspection';
      } else if (e.item.get('inspectionEstimate')) {
        property = 'inspectionEstimate';
      }
      if (!property) {
        return reject(new Error('не найден inspection или inspectionEstimate'));
      }
      const isInspection = property === 'inspection';
      const petProperty = isInspection ? 'petitionExpert' : 'petitionEstimated';
      const soapProperty = isInspection ? 'smvKhvGosEksp' : 'smvKhvGosEstimated';
      const serviceName = isInspection ? options.servicePetition : options.servicePetitionEstimated;
      const actionName = isInspection ? 'updateSmvKhvGosEksp' : 'updateSmvKhvGosEstimated';
      const aliasPath = 'expObject.objectType.alias';

      let petitionData = {};
      let folderPath;
      let inspection;
      const updates = {};
      const forceEnrichment = [
        aliasPath.split('.'),
        [petProperty]
      ];

      loadRef(e.item, property, options.metaRepo, options.dataRepo, {forceEnrichment})
        .then((insp) => {
          inspection = insp;
          const petition = inspection.getAggregate(petProperty);
          petitionData = {
            guid: petition.get('guid'),
            login: petition.get('login'),
            petNumber: petition.get('ouid')
          };
          return options.dirHelper.getPetitionCloudDir(petition);
        })
        .then(({dir, dirName}) => {
          if (!dirName) {
            throw new Error('Отсутствует директория ownCloud');
          }
          const containerDirPath = path.join(dirName, '/5. Изменения, внесенные в проектную документацию/');
          let containerDir;
          if (dir && Array.isArray(dir.dirs)) {
            containerDir = dir.dirs.filter(d => d.id === containerDirPath)[0];
          }
          if (typeof containerDir === 'undefined') {
            throw new Error('Не найдена директория');
          }
          return options.ownCloudStorage.getDir(containerDir.id);
        })
        .then((containerDir) => {
          let count = 1;
          const folderName = 'отв.на замечание';
          if (Array.isArray(containerDir.dirs)) {
            count = containerDir.dirs.filter(d => d.id.includes(`/${folderName}`)).length + 1;
          }
          folderPath = `${containerDir.id}${folderName} ${count}`;
          return options.ownCloudStorage.createDir(folderPath);
        })
        .then(() => {
          const alias = inspection.get(aliasPath);
          const dirStruct = dirStructures[alias];
          return dirStruct && createDirs(dirStruct, folderPath, options.ownCloudStorage);
        })
        .then(() => options.ownCloudStorage.share(folderPath, ShareAccessLevel.WRITE, {shareWith: 'user'}))
        .then(() => options.ownCloudStorage.share(folderPath, ShareAccessLevel.WRITE))
        .then(share => share.getLink())
        .then((shareLink) => {
          updates.repeatedly = shareLink;
          const service = options.soap.service(options.service);
          if (!service) {
            throw new Error('Не настроен компонент обмена данными с внешней системой!');
          }
          const gosEkspRemPetNew = service._parse(e.item, 'gosEkspRemPetNew');
          gosEkspRemPetNew.khvGosEksp = petitionData.guid;
          gosEkspRemPetNew.login = petitionData.login;
          gosEkspRemPetNew.petNumber = petitionData.petNumber;
          gosEkspRemPetNew.repeatedly = shareLink;
          return processFiles(gosEkspRemPetNew)
            .then(() => service.createGosEkspRemPetNew({gosEkspRemPetNew})
              .then(() => soapServiceAction(serviceName, actionName, soapProperty, petitionData, e))
              .catch(resolveOnError(e, 'Ошибка запроса к сервису createGosEkspRemPetNew[gosEkspRemPetNew]')));
        })
        .then(() => resolve(updates))
        .catch(reject);
    })
  );

  options.workflows.on(
    'gosEkspContract@khv-gosekspertiza.work',
    e => new Promise((resolve, reject) => {
      const inspectionCm = options.metaRepo.getMeta('inspection', null, e.item.getMetaClass().getNamespace());
      const petexpCm = options.metaRepo.getMeta('petitionExpert', null, e.item.getMetaClass().getNamespace());
      let inspection;
      const inspectionData = {
        contract: e.item.getItemId(),
        petitionExpert: e.item.get('petitionExpert'),
        expObject: e.item.get('expObject')
      };
      options.dataRepo.createItem(inspectionCm.getCanonicalName(), inspectionData)
        .then((inspectionItem) => {
          inspection = inspectionItem;
          const upd = {inspect: inspection.getItemId()};
          return options.dataRepo.editItem(e.item.getClassName(), e.item.getItemId(), upd);
        })
        .then(() => {
          const petexpId = e.item.get('petitionExpert');
          if (!petexpId) {
            return Promise.resolve(null);
          }
          const petexpData = {
            inspection: inspection.getItemId(),
            status: '32'
          };
          return options.dataRepo.editItem(petexpCm.getCanonicalName(), petexpId, petexpData);
        })
        .then((petexpItem) => {
          if (!petexpItem) {
            return Promise.resolve(null);
          }
          const data = {expObject: petexpItem.get('expObject')};
          return options.dataRepo.editItem(inspectionCm.getCanonicalName(), inspection.getItemId(), data);
        })
        .then(() => resolve())
        .catch(reject);
    })
  );

  options.workflows.on(
    'gosEkspContract@khv-gosekspertiza.work_est',
    e => new Promise(((resolve, reject) => {
      const inspectionCm = options.metaRepo.getMeta('inspectionEstimate', null, e.item.getMetaClass().getNamespace());
      const petexpCm = options.metaRepo.getMeta('petitionEstimated', null, e.item.getMetaClass().getNamespace());
      let inspection;
      const inspectionData = {
        contract: e.item.getItemId(),
        petitionEstimated: e.item.get('petitionEstimated'),
        expObject: e.item.get('expObject')
      };
      options.dataRepo.createItem(inspectionCm.getCanonicalName(), inspectionData)
        .then((inspectionItem) => {
          inspection = inspectionItem;
          const data = {inspectEst: inspection.getItemId()};
          return options.dataRepo.editItem(e.item.getClassName(), e.item.getItemId(), data);
        })
        .then(() => {
          const petexpId = e.item.get('petitionEstimated');
          if (!petexpId) {
            return Promise.resolve(null);
          }
          const petexpData = {
            inspection: inspection.getItemId(),
            status: '32'
          };
          return options.dataRepo.editItem(petexpCm.getCanonicalName(), petexpId, petexpData);
        })
        .then((petexpItem) => {
          if (!petexpItem) {
            return Promise.resolve(null);
          }
          const data = {expObject: petexpItem.get('expObject')};
          return options.dataRepo.editItem(inspectionCm.getCanonicalName(), inspection.getItemId(), data);
        })
        .then(() => resolve())
        .catch(reject);
    }))
  );

  options.workflows.on(
    'gosEkspCancel@khv-gosekspertiza.send',
    e => new Promise((resolve, reject) => {
      const service = options.soap.service(options.service);
      if (!service) {
        reject(new Error('Не настроен компонент обмена данными с внешней системой!'));
      }
      const update = {dataSend: new Date()};
      let gosEkspCancel;
      options.dataRepo.editItem(e.item.getMetaClass().getCanonicalName(), e.item.getItemId(), update)
        .then(item => options.dataRepo.getItem(item.getMetaClass().getCanonicalName(),
          item.getItemId(),
          {forceEnrichment: [['pet'], ['petEst']]}))
        .then((item) => {
          gosEkspCancel = service._parse(item, 'gosEkspCancel');
          return processFiles(gosEkspCancel);
        })
        .then(() => {
          if (gosEkspCancel.pet && gosEkspCancel.pet._id) {
            gosEkspCancel.pet = gosEkspCancel.pet._id;
          }
          return service.createGosEkspCancel({gosEkspCancel})
            .catch(resolveOnError(e, 'Ошибка запроса к сервису createGosEkspCancel[gosEkspCancel]'));
        })
        .then(() => resolve())
        .catch(reject);
    })
  );

  options.workflows.on(
    'gosEkspCancel@khv-gosekspertiza.conf',
    e => new Promise((resolve, reject) => {
      const item = normalize(e.item);
      if (!item.fileSend || !(item.fileSend instanceof StoredFile)) {
        return reject(new Error('не найден файл для конвертации'));
      }
      const fileName = item.fileSend.name || item.__string;
      if (path.extname(fileName) === '.pdf') {
        return resolve();
      }
      const pdfFile = `${path.basename(fileName, path.extname(fileName))}.pdf`;
      item.fileSend.getContents()
        .then((content) => {
          if (!content || !content.stream) {
            throw new Error('ошибка чтения файла');
          }
          return options.docx2pdf.convert(content.stream);
        })
        .then(pdfStream => resolve({fileSend: {stream: pdfStream, name: pdfFile}}))
        .catch(err => reject(err));
    })
  );

  options.workflows.on(
    'gosEkspCancel@khv-gosekspertiza.send_est',
    e => new Promise((resolve, reject) => {
      const service = options.soap.service(options.service);
      if (service) {
        const update = {dataSend: new Date()};
        let gosEkspCancel;
        options.dataRepo.editItem(e.item.getMetaClass().getCanonicalName(), e.item.getItemId(), update)
          .then(item => options.dataRepo.getItem(item.getMetaClass().getCanonicalName(),
            item.getItemId(),
            {forceEnrichment: [['pet'], ['petEst']]}))
          .then((item) => {
            gosEkspCancel = service._parse(item, 'gosEkspCancel');
            return processFiles(gosEkspCancel);
          })
          .then(() => {
            if (gosEkspCancel.petEst && gosEkspCancel.petEst._id) {
              gosEkspCancel.petEst = gosEkspCancel.petEst._id;
            }
            return service.createGosEkspCancel({gosEkspCancel})
              .catch(resolveOnError(e, 'Ошибка запроса к сервису createGosEkspCancel[gosEkspCancel]'));
          })
          .then(() => resolve(null))
          .catch(reject);
      } else {
        reject(new Error('Не настроен компонент обмена данными с внешней системой!'));
      }
    })
  );

  options.workflows.on([
    'result@khv-gosekspertiza.needSigHead',
    'resolution@khv-gosekspertiza.needSigHead'
  ], e => new Promise((resolve, reject) => {
    const cn = e.item.getMetaClass().getName();
    const num = e.item.get('num');
    let date = cn === 'result' ? e.item.get('date') : new Date();
    if (!num || !date) {
      return reject(new Error('не достаточно данных'));
    }
    const promises = [];
    const zip = new JSZip();
    date = dateWithTimezone(date, e.user && e.user.timeZone());
    const archiveName = `${num}_${date.format('DD.MM.YYYY')}.zip`;
    const employees = e.item.getAggregates('sigExpEmployee');
    if (!employees) {
      return reject(new Error('не достаточно данных'));
    }
    employees.forEach((employee) => {
      const sig = employee.get('sig');
      promises.push(new Promise(((resolve, reject) => {
        getFileContents(sig)
          .then(data => resolve({
            data, name: sig.name
          }))
          .catch(reject);
      })));
    });
    Promise.all(promises)
      .then((results) => {
        results.forEach(r => zip.file(r.name, r.data));
        return readStreamData(zip.generateNodeStream({}));
      })
      .then(data => resolve({sigsExpEmpl: {buffer: data, name: archiveName}}))
      .catch(reject);
  }));

  function ensureFileName(name, dir, index) {
    let curName = name;
    if (dir && Array.isArray(dir.files) && dir.files.length) {
      if (index) {
        const ext = path.extname(name);
        const baseName = path.basename(name, ext);
        curName = `${baseName}(${index})${ext}`;
      }
      const equalName = dir.files.filter(f => f.name === curName)[0];
      if (equalName) {
        index = index ? index + 1 : 1;
        return ensureFileName(name, dir, index);
      }
    }
    return curName;
  }

  options.workflows.on('result@khv-gosekspertiza.sendEGRZ',
    e => new Promise((resolve, reject) => {
      let property;
      if (e.item.get('petitionExpert')) {
        property = 'petitionExpert';
      } else if (e.item.get('petitionEstimated')) {
        property = 'petitionEstimated';
      }
      if (!property) {
        return reject(new Error('не найден petitionExpert или petitionEstimated'));
      }
      const dirs = [
        'Заключение государственной экспертизы',
        'Заявление о проведении государственной экспертизы'
      ];
      const forceEnrichment = [
        [property],
        [property, 'customerOrg'],
        [property, 'customerOrg', 'bankAccount'],
        [property, 'customerOrg', 'staff'],
        [property, 'customerOrg', 'legalAdr'],
        [property, 'docFormCont'],
        [property, 'expObject'],
        [property, 'expObject', 'address'],
        [property, 'executorIzA', 'izOrgExecutor'],
        [property, 'executorIzA', 'izOrgExecutor', 'legalAdr'],
        [property, 'executorPdA', 'pdOrgExecutor'],
        [property, 'executorPdA', 'pdOrgExecutor', 'legalAdr'],
        [property, 'developOrg'],
        [property, 'developOrg', 'legalAdr'],
        [property, 'customerOrgObj'],
        [property, 'customerOrgObj', 'legalAdr'],
        [property, 'developOrg'],
        [property, 'executorPdA', 'pdOrgExecutor'],
        [property, 'contractEstimated'],
        [property, 'contractEstimated', 'bankAccount'],
        [property, 'inspectionEstimate'],
        [property, 'inspectionEstimate', 'expEmployee'],
        [property, 'inspectionEstimate', 'result'],
        [property, 'represent'],
        [property, 'contract'],
        [property, 'financingA'],
        ['sigExpEmployee'],
        ['sigExpEmployee', 'expEmployee']
      ];
      options.dataRepo.getItem(e.item.getClassName(), e.item.getItemId(), {forceEnrichment, user: e.user})
        .then((item) => {
          const petitionExpert = item.getAggregate(property);
          if (!petitionExpert) {
            throw new Error('Не достаточно данных');
          }
          const cloudObj = petitionExpert.get('cloudObj');
          const promises = [];
          if (cloudObj) {
            dirs.forEach(dir => promises.push(
              options.ownCloudStorage.getDir(`${cloudObj}${dir}`)
                .then(cDir => cDir ? cDir : options.ownCloudStorage.createDir(dir, cloudObj, true))
            ));
          }
          const cloudDirs = [];
          return Promise.all(promises)
            .then((createDirsResult) => {
              cloudDirs.push(...createDirsResult);
              const files = [
                item.get('fileResult') || item.get('files'),
                item.get('sigHead')
              ];
              const sigExpEmployee = item.getAggregates('sigExpEmployee');
              if (Array.isArray(sigExpEmployee)) {
                sigExpEmployee.forEach((see) => {
                  if (!see.get('expEmployee.head')) {
                    files.push(see.get('sig'));
                  }
                });
              }
              return Promise.all(
                files
                  .filter(file => file instanceof StoredFile)
                  .filter((file, i, arr) => arr.map(f => f.id).indexOf(file.id) === i)
                  .map((file) => {
                    const ops = {name: ensureFileName(file.name, cloudDirs[0])};
                    return file
                      .getContents()
                      .then(stream => options.ownCloudStorage.accept(stream, `${cloudObj}${dirs[0]}`, ops));
                  })
              );
            })
            .then(() => {
              const itemToDocx = new ItemToDocx({
                tplDir: 'applications/khv-gosekspertiza/export/item',
                calc: options.calc
              });
              const exportParams = {
                classMeta: petitionExpert.getMetaClass(),
                params: {
                  name: 'expertItemToDocx',
                  caption: 'Заявление',
                  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  extension: 'docx'
                },
                user: e.user,
                lang: 'ru',
                tz: e.user && e.user.timeZone()
              };
              const name = ensureFileName(`Заявление ${petitionExpert.get('contract.num') || ''}.docx`, cloudDirs[1]);
              return itemToDocx
                .init()
                .then(() => itemToDocx.process(petitionExpert, exportParams))
                .then(buf => options.ownCloudStorage.accept(buf, `${cloudObj}${dirs[1]}`, {name}));
            });
        })
        .then(() => resolve())
        .catch(err => reject(err));
    })
  );

  options.workflows.on([
    'result@khv-gosekspertiza.send',
    'result@khv-gosekspertiza.sendEGRZapp'
  ], e => new Promise((resolve, reject) => {
    const service = options.soap.service(options.service);
    if (!service) {
      return reject(new Error('Не настроен компонент обмена данными с внешней системой!'));
    }
    let getItemPromise = Promise.resolve(e.item);
    if (!e.item.getAggregate('petitionEstimated') && !e.item.getAggregate('petitionExpert')) {
      getItemPromise = options.dataRepo.getItem(
        e.item.getClassName(),
        e.item.getItemId(),
        {forceEnrichment: [['petitionEstimated'], ['petitionExpert']]}
      );
    }
    getItemPromise
      .then((item) => {
        const gosEkspResult = service._parse(item, 'gosEkspResult');
        if (gosEkspResult.petitionEstimated) {
          delete gosEkspResult.petitionExpert;
        } else if (gosEkspResult.petitionExpert) {
          delete gosEkspResult.petitionEstimated;
        }
        if (gosEkspResult.petitionExpert && gosEkspResult.petitionExpert.guid) {
          gosEkspResult.petitionExpert = gosEkspResult.petitionExpert.guid;
        }
        if (gosEkspResult.petitionEstimated && gosEkspResult.petitionEstimated.guid) {
          gosEkspResult.petitionEstimated = gosEkspResult.petitionEstimated.guid;
        }
        return processFiles(gosEkspResult)
          .then(() => service.createGosEkspResult({gosEkspResult})
            .catch(resolveOnError(e, 'Ошибка запроса к сервису createGosEkspResult[gosEkspResult]')));
      })
      .then(() => resolve())
      .catch(reject);
  }));

  options.workflows.on([
    'inspection@khv-gosekspertiza.concl',
    'inspectionEstimate@khv-gosekspertiza.concl'
  ], e => new Promise((resolve, reject) => {
    const cn = e.item.getMetaClass().getName();
    const resProperty = cn === 'inspection' ? 'resolution' : 'resolutions';
    const resolutionCm = options.metaRepo.getMeta('resolution', null, e.item.getMetaClass().getNamespace());
    const resolutions = e.item.getAggregates(resProperty);
    const promises = [];
    if (Array.isArray(resolutions) && resolutions.length) {
      resolutions.forEach((r) => {
        promises.push(options.dataRepo.editItem(resolutionCm.getCanonicalName(), r.getItemId(), {stateRemPet: 'end'}));
      });
    }
    Promise.all(promises).then(() => resolve()).catch(reject);
  }));
}

module.exports = Contract;

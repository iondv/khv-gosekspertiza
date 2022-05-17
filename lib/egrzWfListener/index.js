const F = require('core/FunctionCodes');
const _ = require('lodash');
const {
  loadRef,
  difference,
  getFileContents
} = require('../util');
const expertiseResultSave = require('./lib/expertiseResultSave');

// jscs:disable requireCamelCaseOrUpperCaseIdentifiers

/**
 * @param {{service: String}} options
 * @param {WorkflowProvider} options.workflows
 * @param {DataRepository} options.dataRepo
 * @param {MetaRepository} options.metaRepo
 * @param {EgrzApi} options.egrzApi
 * @constructor
 */
function EgrzWfListener(options) {
  const wf = options.workflows;
  const egrz = options.egrzApi;
  const {dataRepo} = options;

  /*
   * БП expertiseResult переход register
   * Пользователь создает Обращение о создании нового раздела реестра
   */
  wf.on('expertiseResult@khv-gosekspertiza.register',
    e => new Promise((resolve, reject) => {
      try {
        const {egrzMarker} = e.user.properties();
        if (!egrzMarker)
          throw new Error('Неавторизованный запрос к ЕГРЗ');
        const newExpertise = {};
        let upd;
        let buildId;
        egrz.expertiseCreate(egrzMarker.access_token, newExpertise)
          .then(uuid => egrz.expertiseGet(egrzMarker.access_token, uuid))
          .then((expertise) => {
            buildId = _.get(expertise, 'buildingObject.id');
            if (!expertise.id || !expertise.incidentId || !buildId)
              throw new Error('Нет данных экспертного заключения');
            upd = {
              id: expertise.id,
              incidentId: expertise.incidentId,
              register: true
            };
            const ops = {
              user: e.user, needed: {expObject: true}
            };
            return loadRef(e.item, 'result', options.metaRepo, dataRepo, ops);
          })
          .then((result) => {
            const exp = result.get('expObject');
            if (!exp)
              throw new Error('Нет данных');

            const expClass = _.get(result.getMetaClass().getPropertyMeta('expObject'), 'refClass');
            const expCm = options.metaRepo.getMeta(expClass, null, result.getMetaClass().getNamespace());
            return dataRepo.editItem(expCm.getCanonicalName(), exp, {id: buildId});
          })
          .then(() => resolve(upd))
          .catch(err => reject(err));
      } catch (err) {
        reject(err);
      }
    }));

  /*
   * БП expertiseResult переход edit
   * Пользователь получает данные справочников и формы и заполняет заключение для регистрации
   */
  wf.on('expertiseResult@khv-gosekspertiza.edit',
    e => new Promise((resolve, reject) => {
      const {egrzMarker} = e.user.properties();
      if (!egrzMarker)
        return reject(new Error('Неавторизованный запрос к ЕГРЗ'));
      let inputSettings;
      egrz.expertiseInputSettings(egrzMarker.access_token)
        .then((is) => {
          if (!is)
            throw new Error('Нет данных');
          const keys = [
            'expertCertificateAreas', 'expertiseResults', 'expertiseForms',
            'documentTypes', 'objectTypes', 'expertiseObjectParameterGroups',
            'riiTypes', 'budgetLevels', 'financingTypes', 'subjectRfes'
          ];
          inputSettings = {};
          keys.forEach((key) => {
            inputSettings[key] = Array.isArray(is[key]) ? is[key] : [];
          });
          return dataRepo.getList('input-settings@khv-gosekspertiza', {
            count: 1, sort: {date: 1}
          });
        })
        .then((list) => {
          const item = list && list[0];
          const isettings = item && JSON.parse(item.get('input-settings'));
          if (isettings) {
            const diff = difference(inputSettings, isettings);
            if (!Object.keys(diff).length)
              return false;
          }
          return true;
        })
        .then((needUpdate) => {
          if (!needUpdate)
            return;

          let promise = Promise.resolve();
          const updates = Object.assign({}, inputSettings);
          if (Array.isArray(updates.riiTypes))
            updates.riiTypes = _.flatMap(updates.riiTypes, type => type.items);
          if (Array.isArray(updates.expertiseObjectParameterGroups)) {
            const tmp = [];
            updates.egrzSprNaturalCond = [];
            updates.expertiseObjectParameterGroups.forEach(group => tmp.push(...group.parameters));
            tmp.forEach(params => updates.egrzSprNaturalCond.push(...params.parameterValues));
            delete updates.expertiseObjectParameterGroups;
          }
          Object.keys(updates).forEach((setting) => {
            updates[setting].forEach((upd) => {
              promise = promise
                .then(() => dataRepo.saveItem(`${setting}@khv-gosekspertiza`, null, upd, null, null, {
                  autoAssign: true, skipResult: true
                }));
            });
          });
          promise = promise.then(() => dataRepo.createItem('input-settings@khv-gosekspertiza',
            {'input-settings': JSON.stringify(inputSettings)}));
          return promise;
        })
        .then(() => resolve())
        .catch(err => reject(err));
    }));

  function cloneItem(item) {
    const base = Object.assign({}, item.base);
    const keys = item.getMetaClass().getKeyProperties();
    if (Array.isArray(keys))
      keys.forEach(key => delete base[key]);
    else if (keys)
      delete base[keys];
    return dataRepo.createItem(item.getClassName(), base)
      .then(ci => ci.getItemId());
  }

  function cloneCollection(collection) {
    const result = [];
    let promise = Promise.resolve();
    collection.forEach((item) => {
      promise = promise
        .then(() => cloneItem(item))
        .then(ci => result.push(ci));
    });
    return promise.then(() => result);
  }

  /*
   * БП expertiseResult переход edit
   * Заполняем данные обращения ЕГРЗ на основании данных хранящихся у нас
   */
  wf.on('expertiseResult@khv-gosekspertiza.edit',
    async (e) => {
      const upd = {};
      const forceEnrichment = [
        ['documentationType'],
        ['sigExpEmployee'],
        ['tepA'],
        ['buildObjectA'],
        ['expObject'],
        ['expObject', 'address'],
        ['petitionExpert']
      ];
      const docType = e.item.get('documentationType');
      const result = await loadRef(e.item, 'result', options.metaRepo, dataRepo, {forceEnrichment, user: e.user});

      const sigExpEmployee = result.getAggregates('sigExpEmployee');
      const petitionExpertId = result.get('petitionExpert');
      const petitionExpert = await dataRepo.getItem(
        'petitionExpert@khv-gosekspertiza',
        petitionExpertId,
        {
          forceEnrichment: [
            ['developOrg'],
            ['customerOrgObj'],
            ['executorPdA'],
            ['povtorDockA'],
            ['executorIzA'],
            ['financingA']
          ]
        }
      );

      const expObject = result.getAggregate('expObject');
      upd.expert = sigExpEmployee.map(n => n.get('expEmployee')).filter(n => Boolean(n));

      const headFilter = {[F.EQUAL]: ['$head', true]};
      const headEmployee = dataRepo.getList('expEmployee@khv-gosekspertiza', {count: 1, filter: headFilter});
      if (Array.isArray(headEmployee) && headEmployee.length)
        upd.approver = headEmployee[0].getItemId();

      upd.budgetSources = await cloneCollection(petitionExpert.getAggregates('financingA'));
      upd.povtorDockA = await cloneCollection(petitionExpert.getAggregates('povtorDockA'));
      // Если 'docType' не равен `Результаты инженерных изысканий`
      if (String(docType) !== '0fdef354-2457-e711-80cb-00155d01c726') {
        upd.tepA = result.get('tepA');
        upd.buildingObject = await cloneItem(expObject);
        upd.projectDocumentation_developers = await cloneItem(petitionExpert.getAggregate('developOrg'));
        upd.projectDocumentation__technicalEmployers = await cloneItem(petitionExpert.getAggregate('customerOrgObj'));
        upd.executors = await cloneCollection(petitionExpert.getAggregates('executorPdA'));
      }

      // Если 'docType' не равен `Проектная документация`
      if (String(docType) !== '958a7f49-2457-e711-80cb-00155d01c726') {
        upd.riiLocations = expObject.getAggregate('address').toString();
        upd.engineeringSurvey_developers = await cloneItem(petitionExpert.getAggregate('developOrg'));
        upd.engineeringSurvey_technicalEmployers = await cloneItem(petitionExpert.getAggregate('customerOrgObj'));
        upd.results = await cloneCollection(petitionExpert.getAggregates('executorIzA'));
      }

      const savedItem = await dataRepo.saveItem(e.item.getClassName(), e.item.getItemId(), upd, null, null);

      const buildObjects = result.getAggregates('buildObjectA');
      if (Array.isArray(buildObjects) && buildObjects.length) {
        await dataRepo.put(savedItem, 'buildObjectA', buildObjects);
      }
      return null;
    });

  /*
   * БП expertiseResult переход saveEGRZ
   * Передаем данные сформированного обращения в ЕГРЗ
   */
  wf.on('expertiseResult@khv-gosekspertiza.save', e => expertiseResultSave(e.item, e.user, egrz, dataRepo));

  function signToString(sign) {
    const parts = sign.toString('utf8').split('\n');
    return parts.slice(1, -1).join('');
  }

  /*
   * БП expertiseResult переход signEGRZ
   * Подписываем ПФ и направляем файл подписи
   */
  wf.on('expertiseResult@khv-gosekspertiza.sign',
    e => new Promise((resolve, reject) => {
      const {egrzMarker} = e.user.properties();
      if (!egrzMarker)
        return reject(new Error('Неавторизованный запрос к ЕГРЗ'));

      const incidentId = e.item.get('incidentId');
      const sign = e.item.get('sig');
      if (!incidentId || !sign)
        return reject(new Error('Не достаточно данных'));

      getFileContents(sign)
        .then(data => egrz.fileFromString(egrzMarker.access_token, signToString(data), 'iteco_expertise_results', incidentId))
        .then(() => resolve(null))
        .catch(err => reject(err));
    }));

  /*
   * БП expertiseResult переход sendToProces
   * Направляем обращение на обработку операторам ЕГРЗ
   */
  wf.on('expertiseResult@khv-gosekspertiza.sendToProces',
    e => new Promise((resolve, reject) => {
      const {egrzMarker} = e.user.properties();
      if (!egrzMarker)
        return reject(new Error('Неавторизованный запрос к ЕГРЗ'));

      const incidentId = e.item.get('incidentId');
      if (!incidentId)
        return reject(new Error('Не достаточно данных'));
      egrz.expertiseSend(egrzMarker.access_token, incidentId)
        .then(() => resolve(null))
        .catch((err) => {
          let msg;
          try {
            msg = JSON.parse(err.message);
            if (Array.isArray(msg)) {
              msg = msg.filter(m => m && m.Value).map(m => m.Value)
                .join(', ');
            }
          } catch (err) {
            // Do nothing
          }
          reject(msg ? new Error(msg) : err);
        });
    }));
}

module.exports = EgrzWfListener;

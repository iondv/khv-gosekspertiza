const normalize = require('core/util/normalize');
const _ = require('lodash');

const forceEnrichment = [
  ['expertiseResult'],
  ['expertiseType'],
  ['documentationType'],
  ['objectType'],
  ['subjectRf'],
  ['expert'],
  ['expert', 'activityAnew'],
  ['expert', 'activityAnew', 'name'],
  ['buildingObject'],
  ['buildingObject', 'address'],
  ['budgetSources'],
  ['budgetSources', 'financingType'],
  ['budgetSources', 'budgetLevel'],
  ['budgetSources', 'account'],
  ['budgetSources', 'account', 'actualAdr'],
  ['budgetSources', 'account', 'legalAdr'],
  ['riiLocations'],
  ['approver'],
  ['approver', 'activity'],
  ['approver', 'activityAnew'],
  ['approver', 'activityAnew', 'name'],
  ['result'],
  ['result', 'typeEksResult'],
  ['validation'],
  ['validation', 'result'],
  ['validation', 'result', 'typeEksResult'],
  ['projectDocumentation_developers'],
  ['projectDocumentation_developers', 'actualAdr'],
  ['projectDocumentation_developers', 'legalAdr'],
  ['projectDocumentation__technicalEmployers'],
  ['projectDocumentation__technicalEmployers', 'actualAdr'],
  ['projectDocumentation__technicalEmployers', 'legalAdr'],
  ['executors'],
  ['executors', 'pdOrgExecutor'],
  ['executors', 'pdOrgExecutor', 'actualAdr'],
  ['executors', 'pdOrgExecutor', 'legalAdr'],
  ['engineeringSurvey_developers'],
  ['engineeringSurvey_developers', 'actualAdr'],
  ['engineeringSurvey_developers', 'legalAdr'],
  ['engineeringSurvey_technicalEmployers'],
  ['engineeringSurvey_technicalEmployers', 'actualAdr'],
  ['engineeringSurvey_technicalEmployers', 'legalAdr'],
  ['climaticRegion'],
  ['engGeoCond'],
  ['windDistr'],
  ['snowDistr'],
  ['seismicAct'],
  ['seismicAct', 'name'],
  ['buildObjectA'],
  ['buildObjectA', 'tepA'],
  ['buildObjectA', 'tepA', 'typeTEP'],
  ['buildObjectA', 'expObject'],
  ['buildObjectA', 'expObject', 'address'],
  ['tepA'],
  ['tepA', 'typeTEP'],
  ['povtorDockA'],
  ['results'],
  ['results', 'researchAnew'],
  ['results', 'researchAnew', 'name'],
  ['results', 'izOrgExecutor'],
  ['results', 'izOrgExecutor', 'actualAdr'],
  ['results', 'izOrgExecutor', 'legalAdr'],
  ['results', 'izPersExecutor'],
  ['results', 'izPersExecutor', 'mailingAdr'],
  ['results', 'izPersExecutor', 'actualAdr'],
  ['expEmployee', 'activity'],
  ['expEmployee', 'activityAnew'],
  ['expEmployee', 'activityAnew', 'name']
];

// Добавление новых организаций для объекта экспертизы
async function updateOrganizations(exp, egrzMarker, egrz, dataRepo) {
  const orgUpdates = {};
  const types = {
    DeveloperPD: 'projectDocumentation_developers',
    TechnicalCustomerPD: 'projectDocumentation__technicalEmployers',
    PlannerPD: 'executors[0].pdOrgExecutor',
    DeveloperRII: 'engineeringSurvey_developers',
    TechnicalCustomerRII: 'engineeringSurvey_technicalEmployers'
  };
  await Promise.all(
    Object.keys(types).map((type) => {
      const prop = types[type];
      const phoneNotAvailable = _.get(exp, `${prop}.phoneNotAvailable`, false);
      const org = {
        phoneNotAvailable,
        phone: phoneNotAvailable ? null : _.get(exp, `${prop}.phone`, null),
        accountLegalType: 'Legal',
        actualAddress: _.get(exp, `${prop}.actualAdr.__string`, null),
        email: _.get(exp, `${prop}.mail`, null),
        fullName: _.get(exp, `${prop}.fullName`, null),
        inn: _.get(exp, `${prop}.inn`, null),
        kpp: _.get(exp, `${prop}.kpp`, null),
        legalAddress: _.get(exp, `${prop}.legalAdr.__string`, null),
        ogrn: _.get(exp, `${prop}.ogrn`, null),
        firstName: null,
        lastName: null,
        middleName: null,
        name: null,
        innNotAvailable: null,
        kppNotAvailable: null,
        ogrnNotAvailable: null,
        legalAddressNotAvailable: null,
        actualAddressNotAvailable: null,
        emailNotAvailable: null,
        middleNameNotAvailable: null,
        id: '00000000-0000-0000-0000-000000000000'
      };
      return egrz.expertiseOrganizationCreate(egrzMarker.access_token, exp.incidentId, type, org)
        .then((uuid) => {
          orgUpdates[type] = uuid;
        });
    })
  );

  const updPromise = Promise.resolve();
  Object.keys(orgUpdates).forEach((type) => {
    const prop = types[type];
    const id = _.get(exp, `${prop}._id`);
    const cn = _.get(exp, `${prop}.__class`);
    if (!id || !cn) {
      return;
    }
    updPromise.then(() => dataRepo.saveItem(cn, id, {ouid: orgUpdates[type]}, null, null, {skipResult: true}));
  });
  await updPromise;
}

async function updateObjectParameters(exp, egrzMarker, egrz) {
  const objParams = [];
  ['climaticRegion', 'engGeoCond', 'windDistr', 'snowDistr', 'seismicAct'].forEach((paramName) => {
    const op = exp[paramName];
    if (Array.isArray(op)) {
      op.length && objParams.push({
        parameterID: _.get(op, '[0].name.parameterID'),
        listParameterValueID: op.map(p => _.get(p, 'name.parameterValueID'))
      });
    } else if (op) {
      objParams.push({
        parameterID: op.parameterID,
        listParameterValueID: [op.parameterValueID]
      });
    }
  });

  [
    'valueNotAvailable_409954c0-3f57-e711-80cb-00155d01c726',
    'valueNotAvailable_71e292cd-3f57-e711-80cb-00155d01c726',
    'valueNotAvailable_0fc2a78b-aa7d-e711-80dc-00155d01c726',
    'valueNotAvailable_55288c67-ab7d-e711-80dc-00155d01c726'
  ].forEach((valueNotAvailable) => {
    const parameterID = valueNotAvailable.split('_')[1];
    if (exp[valueNotAvailable]) {
      objParams.push({
        parameterID,
        value: null,
        valueNotAvailable: true
      });
    } else if (exp[parameterID]) {
      objParams.push({
        parameterID,
        value: exp[parameterID],
        valueNotAvailable: false
      });
    }
  });

  if (objParams.length > 0) {
    await egrz.expertiseObjectParametersCreate(egrzMarker.access_token, exp.incidentId, objParams);
  }
}

async function updateBuildObjectTepas(bo, boId, exp, egrzMarker, egrz, dataRepo, buildObjectParams) {
  if (!Array.isArray(bo.tepA)) {
    return;
  }

  const buildObjectTepaUpdates = {};
  let ts = await Promise.all(
    bo.tepA.map((tepa) => {
      if (!tepa || !tepa.typeTEP) {
        return;
      }
      const boTepaUpd = {
        parameterName: tepa.typeTEP.name,
        isSystem: false,
        isExpertiseObject: true,
        isBuildingObject: true,
        allowedValueType: tepa.typeTEP.type
      };

      const [op] = buildObjectParams.filter(p => p.expertiseResultsPdID === tepa.id);

      if (!op) {
        return egrz.objectParameterCreate(egrzMarker.access_token, boTepaUpd)
          .then((tepaUid) => {
            buildObjectTepaUpdates[tepa._id] = tepaUid;
            return {buildingObjectsOpID: tepaUid, value: tepa.value};
          });
      } else if (op.value !== tepa.value) {
        return {buildingObjectsOpID: op.expertiseResultsPdID, value: tepa.value};
      }
    })
  );

  if (Array.isArray(ts) && ts.length) {
    ts = ts.filter(t => Boolean(t));
    await egrz.buildObjectsObjectParameterCreate(egrzMarker.access_token, boId, ts);
  }

  const promises = Promise.resolve();

  Object.keys(buildObjectTepaUpdates).forEach((guid) => {
    const id = buildObjectTepaUpdates[guid];
    promises.then(() => dataRepo.saveItem('tep@khv-gosekspertiza', guid, {id}, null, null, {skipResult: true}));
  });

  return promises;
}

async function updateBuildObjects(exp, egrzMarker, egrz, dataRepo, buildObjectParams) {
  if (!Array.isArray(exp.buildObjectA)) {
    return;
  }

  const buildObjectAUpdates = {};

  await Promise.all(
    exp.buildObjectA.map((bo) => {
      const boUpd = {
        name: _.get(bo, 'expObject.name', null),
        customFunction: _.get(bo, 'expObject.customFunction', null),
        postAddress: _.get(bo, 'expObject.address.__string', null)
      };
      if (_.get(bo, 'expObject.customFunctionNotAvailable')) {
        boUpd.customFunctionNotAvailable = true;
      }
      return egrz.expertiseBuildObjectCreate(egrzMarker.access_token, exp.incidentId, boUpd)
        .then((boId) => {
          if (!boId) {
            return false;
          }
          buildObjectAUpdates[bo._id] = boId;
          return updateBuildObjectTepas(bo, boId, exp, egrzMarker, egrz, dataRepo, buildObjectParams);
        });
    })
  );

  const promises = Promise.resolve();

  Object.keys(buildObjectAUpdates).forEach((guid) => {
    const id = buildObjectAUpdates[guid];
    promises.then(
      dataRepo.saveItem('buildObject@khv-gosekspertiza', guid, {id}, null, null, {skipResult: true})
    );
  });

  await promises;
}

async function updateTepas(exp, egrzMarker, egrz, dataRepo, objectParams) {
  if (!Array.isArray(exp.tepA)) {
    return;
  }
  const tepUpdates = {};
  let ts = await Promise.all(
    exp.tepA.map((tep) => {
      const tepUpd = {
        parameterName: _.get(tep, 'typeTEP.name', null),
        isSystem: false,
        isExpertiseObject: true,
        isBuildingObject: true,
        allowedValueType: _.get(tep, 'typeTEP.type', null)
      };

      const [op] = objectParams.filter(p => p.expertiseResultsPdID === tep.id);
      if (!op) {
        return egrz.objectParameterIncidentCreate(egrzMarker.access_token, exp.incidentId, tepUpd)
          .then((uuid) => {
            tepUpdates[tep._id] = uuid;
            return {expertiseResultsPdID: uuid, value: tep.value};
          });
      } else if (op.value !== tep.value) {
        return {expertiseResultsPdID: op.expertiseResultsPdID, value: tep.value};
      }
    })
  );
  ts = ts.filter(t => Boolean(t));
  if (ts.length) {
    await egrz.expertiseObjectParametersCreate(egrzMarker.access_token, exp.incidentId, ts);
  }
  const promises = Promise.resolve();
  Object.keys(tepUpdates).forEach((guid) => {
    const id = tepUpdates[guid];
    promises.then(() => dataRepo.saveItem('tep@khv-gosekspertiza', guid, {id}, null, null, {skipResult: true}));
  });
  await promises;
}

async function updatePovtors(exp, egrzMarker, egrz, dataRepo) {
  if (!Array.isArray(exp.povtorDockA)) {
    return;
  }

  const povtorUpdates = {};

  await Promise.all(
    exp.povtorDockA.map((povtor) => {
      if (!povtor.num) {
        return;
      }
      return egrz.expertiseSuggestions(egrzMarker.access_token, povtor.num)
        .then((suggestions) => {
          const sug = suggestions && Array.isArray(suggestions.items) && suggestions.items[0];
          if (!sug) {
            return;
          }
          povtorUpdates[povtor._id] = sug.Key;
          const povtorUpd = {
            id: sug.Key,
            number: povtor.num,
            dateOfIssue: povtor.date && povtor.date.toISOString()
          };
          return egrz.expertiseLinkedUpsert(egrzMarker.access_token, exp.incidentId, sug.Key, povtorUpd);
        });
    })
  );
  
  const promises = Promise.resolve();

  Object.keys(povtorUpdates).forEach((guid) => {
    const id = povtorUpdates[guid];
    promises.then(() => dataRepo.saveItem('povtorDock@khv-gosekspertiza', guid, {id}, null, null, {skipResult: true}));
  });

  await promises;
}

async function updateRiiTypesLinks(exp, egrzMarker, egrz, dataRepo, riiParams) {
  if (!Array.isArray(exp.results)) {
    return;
  }

  const resaUpdates = {};
  const promises = [];
  exp.results.forEach((result) => {
    Array.isArray(result.researchAnew) && result.researchAnew.forEach((resa) => {
      const [op] = riiParams.filter(p => p.id === resa.idEgrz);
      if (!op) {
        const resaUpd = {
          riiTypeId: _.get(resa, 'name.id'),
          performed: true,
          completedAt: null,
          researchAccounts: []
        };
        promises.push(
          egrz.expertiseRiiCreate(egrzMarker.access_token, exp.incidentId, resaUpd)
            .then((riiUid) => {
              resaUpdates[resa._id] = riiUid;
              const researchAccounts = [];
              if (_.get(result, 'izPersExecutor', false)) {
                const phoneNotAvailable = _.get(result, 'izPersExecutor.phone', false);
                const lastName = _.get(result, 'izPersExecutor.surname', '');
                const middleName = _.get(result, 'izPersExecutor.patronymic', '');
                researchAccounts.push({
                  lastName,
                  middleName,
                  firstName: _.get(result, 'izPersExecutor.name'),
                  accountLegalType: 'Individual',
                  innNotAvailable: true,
                  kppNotAvailable: true,
                  ogrnNotAvailable: true,
                  legalAddressNotAvailable: null,
                  actualAddressNotAvailable: true,
                  phoneNotAvailable: true,
                  emailNotAvailable: true,
                  middleNameNotAvailable: null,
                  fullName: `ИП ${lastName} ${middleName}`,
                  inn: _.get(result, 'izPersExecutor.inn'),
                  kpp: 'Нет данных',
                  ogrn: 'Нет данных',
                  legalAddress: _.get(result, 'izPersExecutor.mailingAdr.__string'),
                  actualAddress: _.get(result, 'izPersExecutor.actualAdr.__string'),
                  phone: phoneNotAvailable ? null : _.get(result, 'izPersExecutor.phone'),
                  email: _.get(result, 'izPersExecutor.mail'),
                  id: resa.id,
                  name: null
                });
              } else {
                const phoneNotAvailable = _.get(result, 'izOrgExecutor.phone', false);
                researchAccounts.push({
                  phoneNotAvailable,
                  phone: phoneNotAvailable ? null : _.get(result, 'izOrgExecutor.phone'),
                  accountLegalType: 'Legal',
                  actualAddress: _.get(result, 'izOrgExecutor.actualAdr.__string'),
                  email: _.get(result, 'izOrgExecutor.mail'),
                  fullName: _.get(result, 'izOrgExecutor.fullName'),
                  inn: _.get(result, 'izOrgExecutor.inn'),
                  kpp: _.get(result, 'izOrgExecutor.kpp'),
                  legalAddress: _.get(result, 'izOrgExecutor.legalAdr.__string'),
                  ogrn: _.get(result, 'izOrgExecutor.ogrn'),
                  id: resa.id
                });
              }
              const riiUpd = {
                riiTypeId: _.get(resa, 'name.id'),
                performed: true,
                completedAt: null,
                completedAtNotAvailable: true,
                researchAccounts
              };
              return egrz.expertiseRiiUpdate(egrzMarker.access_token, exp.incidentId, riiUid, riiUpd);
            })
        );
      }
    });
  });

  await Promise.all(promises);
  const resaPromises = Promise.resolve();

  Object.keys(resaUpdates).forEach((guid) => {
    const idEgrz = resaUpdates[guid];
    resaPromises.then(
      () => dataRepo.saveItem('riiTypesLink@khv-gosekspertiza', guid, {idEgrz}, null, null, {skipResult: true})
    );
  });

  await resaPromises;
}

/**
 * @param {Item} expertiseItem
 * @param {User} user
 * @param {EgrzApi} egrz
 * @param {dataRepo} dataRepo
 * @returns {Promise}
 */
module.exports = async function expertiseResultSave(expertiseItem, user, egrz, dataRepo) {
  if (!expertiseItem || !user || !egrz || !dataRepo) {
    throw new Error('Не переданы аргументы для expertiseResultSave');
  }

  const {egrzMarker} = user.properties();
  if (!egrzMarker) {
    throw new Error('Неавторизованный запрос к ЕГРЗ');
  }

  const json = {};

  const item = await dataRepo.getItem(expertiseItem.getClassName(), expertiseItem.getItemId(), {forceEnrichment, user});
  const exp = normalize(item, null, {byRef: true});
  const egrzData = await Promise.all([
    egrz.expertiseObjectParameters(egrzMarker.access_token, exp.incidentId),
    egrz.buildObjectsObjectParameters(egrzMarker.access_token, exp.incidentId),
    egrz.expertiseRii(egrzMarker.access_token, exp.incidentId)
  ]);

  // экспертиза из ЕГРЗ
  const objectParams = _.get(egrzData[0], 'items', []);
  const buildObjectParams = _.get(egrzData[1], 'items', []);
  const riiParams = _.get(egrzData[2], 'items', []);

  const {expert, buildingObject, budgetSources, approver} = exp;
  
  json.id = exp.id || null;
  json.expertiseNotAvailable = exp.expertiseNotAvailable || false;
  json.expertiseResult = _.get(exp, 'expertiseResult.id', null);
  json.incidentId = exp.incidentId || null;
  json.isEconomyEfficiency = false;
  json.expertiseType = _.get(exp, 'expertiseType.id', null);
  json.documentationType = _.get(exp, 'documentationType.id', null);
  json.objectType = _.get(exp, 'objectType.id', null);
  json.subjectRf = _.get(exp, 'subjectRf.id', null);
  json.documentationName = _.get(exp, 'documentationName', null);
  json.expertiseConclusionsDate = exp && exp.expertiseConclusionsDate
    ? exp.expertiseConclusionsDate.toISOString()
    : null;
  json.budgetSources = [];
  json.approver = {
    id: _.get(approver, 'guid'),
    position: _.get(approver, 'position'),
    lastName: _.get(approver, 'surname'),
    firstName: _.get(approver, 'name'),
    middleName: _.get(approver, 'patronymic')
  };
  json.riiLocations = [{
    name: _.get(exp, 'riiLocations')
  }];
  json.validation = {
    isValidatedString: _.get(exp, 'isValidatedString')
  };

  if (exp.subObjectNotAvailable === true) {
    json.subObjectNotAvailable = exp.subObjectNotAvailable;
  }

  if (json.validation.isValidatedString === 'Performed') {
    json.validation.validationDate = _.get(exp, 'validation.result.date', null);
    json.validation.validationNumber = _.get(exp, 'validation.result.num', null);
    if (_.get(exp, 'validation.result.typeEksResult.alias') === 'PositiveСonclusion') {
      json.validation.validationResult = true;
    } else if (_.get(exp, 'validation.result.typeEksResult.alias') === 'NegativeConclusion') {
      json.validation.validationResult = false;
    }
  }

  if (Array.isArray(expert) && expert.length > 0) {
    json.expert = [];
    expert.forEach((expertObj) => {
      Array.isArray(expertObj.activityAnew) && expertObj.activityAnew.forEach((act) => {
        const expertData = {
          lastName: expertObj.surname,
          firstName: expertObj.name,
          middleName: expertObj.patronymic,
          snils: expertObj.snils,
          lineOfActivity: _.get(act, 'name.сertificateAreaID', null),
          lineOfActivityName: _.get(act, 'name.__string', null),
          position: expertObj.position
        };
        if (expertObj.certificateNumberNotAvailable) {
          expertData.certificateNumberNotAvailable = true;
        } else {
          expertData.certificateNumber = expertObj.certificateNumber;
        }
        if (expertObj.issueDateNotAvailable) {
          expertData.issueDateNotAvailable = true;
        } else {
          expertData.issueDate = expertObj.issueDate;
        }
        if (expertObj.validBeforeNotAvailable) {
          expertData.validBeforeNotAvailable = true;
        } else {
          expertData.validBefore = expertObj.validBefore;
        }
        json.expert.push(expertData);
      });
    });
  }

  if (buildingObject) {
    json.buildingObject = {
      customFunctionNotAvailable: buildingObject.customFunctionNotAvailable || false,
      customFunction: buildingObject.customFunction || null,
      postAddress: _.get(buildingObject, 'address.__string', null),
      type: '1',
      id: buildingObject.id || null,
      name: buildingObject.name || null
    };
  }

  if (Array.isArray(budgetSources)) {
    budgetSources.forEach((bs) => {
      const bsData = {
        budgetLevelNotAvailable: _.get(bs, 'budgetLevelNotAvailable', false),
        percentNotAvailable: _.get(bs, 'percentNotAvailable', true),
        financingType: _.get(bs, 'financingType.id', null),
        budgetLevel: _.get(bs, 'budgetLevel.id', null),
        percent: _.get(bs, 'percent', 0)
      };
      const {account} = bs;
      if (account) {
        bsData.account = {
          id: account.guid,
          accountLegalType: 'Legal',
          phoneNotAvailable: account.phoneNotAvailable || false,
          phone: !account.phoneNotAvailable ? account.phone : null,
          actualAddress: _.get(account, 'actualAdr.__string'),
          email: account.mail,
          fullName: account.fullName,
          inn: account.inn,
          kpp: account.kpp,
          legalAddress: _.get(account, 'legalAdr.__string'),
          ogrn: account.ogrn
        };
      }
      json.budgetSources.push(bsData);
    });
  }

  await updateOrganizations(exp, egrzMarker, egrz, dataRepo);
  await updateObjectParameters(exp, egrzMarker, egrz);
  await updateBuildObjects(exp, egrzMarker, egrz, dataRepo, buildObjectParams);
  await updateTepas(exp, egrzMarker, egrz, dataRepo, objectParams);
  await updatePovtors(exp, egrzMarker, egrz, dataRepo);
  await updateRiiTypesLinks(exp, egrzMarker, egrz, dataRepo, riiParams);
  await egrz.expertiseUpdate(egrzMarker.access_token, exp.incidentId, json);
  return null;
};

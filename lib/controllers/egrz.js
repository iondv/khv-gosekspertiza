const respond = require('modules/registry/backend/respond');
const onError = require('modules/registry/backend/error');
const moduleName = require('modules/registry/module-name');
const normalize = require('core/util/normalize');
const lastVisit = require('lib/last-visit');
const url = require('url');
const path = require('path');
const expertDirsToEgrz = require('applications/khv-gosekspertiza/paths_config/expertDirsToEgrz.json');
const {
  generateForceEnrichment,
  enrichCloudDirStructure
} = require('../util');
const EgrzApiError = require('../egrz-api/EgrzApiError');

// jscs:disable requireCamelCaseOrUpperCaseIdentifiers

const onEgrzError = (scope, err, req, res) => {
  if (err instanceof EgrzApiError && parseInt(err.statusCode) === 401) {
    delete req.session.egrzMarker;
    delete req.session.esiaMarker;
  }
  return onError(scope, err, res);
};

/**
 * @param {{}} options
 * @param {{}} options.module
 * @param {EgrzApi} options.egrzApi
 * @param {EgrzFileUploader} options.egrzUploader
 * @constructor
 */
function EgrzController(options) {

  this.init = () => {

    if (!options.egrzApi) {
      throw new Error('EgrzApi module not found');
    }

    const egrz = options.egrzApi;

    options.module.get('/goseksp/egrz-check', (req, res) => respond(['auth'],
      () => {
        const {egrzMarker} = req.session;
        if (egrzMarker && egrzMarker.access_token) {
          res.send({auth: true});
        } else {
          res.send({auth: false});
        }
      }, res)
    );

    options.module.get('/goseksp/egrz/esia-login', (req, res) => respond([],
      () => {
        const host = req.protocol + '://' + req.get('host');
        const callbackUrl = url.resolve(host, '/goseksp/egrz/esia-login/callback');
        const uri = url.resolve(egrz.authUrl, 'api/esia/login');
        return res.redirect(`${uri}?redirectUrl=${callbackUrl}`);
      }, res)
    );

    options.module.get('/goseksp/egrz/esia-login/callback', (req, res) => respond([],
      (scope) => {
        if (!req.query.marker) {
          return onError(scope, new Error('Wrong request'), res);
        }
        req.session.esiaMarker = req.query.marker;
        const marker = egrz.decodeMarker(req.session.esiaMarker);
        if (!marker || !marker.access_token) {
          return onError(scope, new Error('Wrong marker'), res);
        }
        const tplData = {
          authUrl: egrz.authUrl,
          baseUrl: req.app.locals.baseUrl,
          module: moduleName,
          backUrl: lastVisit.get(req) || '/'
        };
        return res.render('egrz-login', tplData);
      }, res)
    );

    options.module.get('/goseksp/egrz/login/success', (req, res) => respond([],
      (scope) => {
        const marker = req.query.marker && egrz.decodeMarker(req.query.marker);
        if (!marker) {
          return onError(scope, new Error('Wrong request'), res);
        }
        req.session.egrzMarker = marker;
        const tplData = {
          baseUrl: req.app.locals.baseUrl,
          module: moduleName,
          backUrl: lastVisit.get(req) || '/'
        };
        return res.render('egrz-login-success', tplData);
      }, res)
    );

    options.module.get('/goseksp/egrz/logout', (req, res) => respond([],
      (scope) => {
        try {
          delete req.session.egrzMarker;
          delete req.session.esiaMarker;
          res.send(true);
        } catch (err) {
          onError(scope, err, res);
        }
      }, res)
    );

    options.module.get('/goseksp/egrz/incidents', (req, res) => respond(['auth'],
      (scope) => {
        const {egrzMarker} = req.session;
        if (!egrzMarker) {
          return onError(scope, new Error('Wrong request'), res);
        }
        egrz.incidents(egrzMarker.access_token)
          .then(result => res.send(result))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );

    options.module.get('/goseksp/egrz/input-settings', (req, res) => respond(['auth'],
      (scope) => {
        const {egrzMarker} = req.session;
        if (!egrzMarker) {
          return onError(scope, new Error('Wrong request'), res);
        }
        egrz.expertiseInputSettings(egrzMarker.access_token)
          .then(result => res.send(result))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );

    options.module.get('/goseksp/egrz/cloud-dir/:class/:id', (req, res) => respond(['auth', 'securedDataRepo', 'ownCloud'],
      (scope) => {
        enrichCloudDirStructure(req.params.class,
          req.params.id,
          scope.auth.getUser(req),
          scope.securedDataRepo,
          scope.ownCloud,
          options.egrzUploader.exclFormats)
          .then(result => res.send(result))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );

    function collectionsToStructure(dir) {
      return {
        _id: dir._id,
        __class: dir.__class,
        name: dir.name,
        files: Array.isArray(dir.files) ? dir.files : [],
        dirs: Array.isArray(dir.dirs) ? dir.dirs.map(d => collectionsToStructure(d)) : []
      };
    }

    function normalizeDirStructure(dirItem) {
      if (!dirItem) {
        return {dirs: [], files: []};
      }
      const dirObj = normalize(dirItem, null, {byRef: true});
      return collectionsToStructure(dirObj);
    }

    function structDiff(left, right, map) {
      map = map || {};
      left = left || {files: [], dirs: []};
      right = right || {files: [], dirs: []};
      const creates = [];
      const updates = [];
      const deletes = [];
      const fileCreates = [];
      const fileDeletes = [];

      left.dirs.forEach((ld) => {
        const rd = right.dirs.filter(r => r.name === ld.name)[0];
        const inMap = map.dirs && map.dirs[ld.name] || {};
        const inner = structDiff(ld, rd, inMap);
        if (rd) {
          if (inner.creates.length
            || inner.updates.length
            || inner.deletes.length
            || inner.fileCreates.length
            || inner.fileDeletes.length
            || inner.egrzOpts.name !== inMap.name) {
            updates.push(inner);
          }
        } else {
          creates.push(inner);
        }
      });

      right.dirs.forEach((rd) => {
        const ld = left.dirs.filter(l => l.name === rd.name)[0];
        if (!ld) {
          deletes.push(rd);
        }
      });

      left.files.forEach((lf) => {
        const rf = right.files.filter(r => r.link === lf.link)[0];
        if (!rf) {
          fileCreates.push(lf);
        }
      });

      right.files.forEach((rf) => {
        const lf = left.files.filter(l => l.link === rf.link)[0];
        if (!lf) {
          fileDeletes.push(rf);
        }
      });

      return {
        name: right.name || left.name,
        _id: right._id,
        __class: right.__class,
        egrzOpts: map.egrzOpts || {},
        isConclusionDocument: Boolean(map.isConclusionDocument),
        creates,
        updates,
        deletes,
        fileCreates,
        fileDeletes
      };
    }

    function sysFilter(map) {
      return (folder) => {
        if (map.id) {
          return folder.id === map.id;
        }
        return folder.name === map.name;
      };
    }

    function egrzOptionsMap(systemFolders, map) {
      map = map || {};
      const egrzMap = {};
      map.dirs && Object.keys(map.dirs).forEach((cloudName) => {
        const sysFolder = Array.isArray(systemFolders) && systemFolders.filter(sysFilter(map.dirs[cloudName]))[0] || {};
        egrzMap[cloudName] = {
          name: map.dirs[cloudName].name || cloudName,
          id: map.dirs[cloudName].id,
          isConclusionDocument: map.dirs[cloudName].isConclusionDocument,
          dirs: map.dirs[cloudName].dirs && egrzOptionsMap(sysFolder.items, map.dirs[cloudName]) || {},
          egrzOpts: {
            entityName: sysFolder.entityName,
            SystemFolderID: sysFolder.id || map.dirs[cloudName].id,
            name: sysFolder.name
          }
        };
      });
      return egrzMap;
    }

    function getStructDiff(left, right, systemFolders, map) {
      const egrzMap = {dirs: egrzOptionsMap(systemFolders, map)};
      return structDiff(left, right, egrzMap);
    }

    function updateDirStructure(cloudStruct, item, dataRepo, params) {
      const {
        creates, updates, deletes, fileCreates, fileDeletes, isConclusionDocument
      } = cloudStruct;
      let promise = Promise.resolve();
      if (Array.isArray(creates) && creates.length) {
        const dirItems = [];
        creates.forEach((create) => {
          const data = {
            name: create.name,
            SystemFolderID: create.egrzOpts && create.egrzOpts.SystemFolderID,
            nameEgrz: create.egrzOpts && create.egrzOpts.name,
            entityName: create.egrzOpts && create.egrzOpts.entityName
          };
          promise = promise
            .then(() => dataRepo.createItem('dir@khv-gosekspertiza', data, params))
            .then((dir) => {
              dirItems.push(dir);
              return updateDirStructure(create, dir, dataRepo, params);
            });
        });
        promise.then(() => dataRepo.put(item, 'dirs', dirItems, params));
      }
      if (Array.isArray(deletes) && deletes.length) {
        deletes.forEach((del) => {
          if (!del._id || !del.__class) {
            return;
          }
          promise = promise.then(() => dataRepo.deleteItem(del.__class, del._id, null, params));
        });
      }
      if (Array.isArray(fileCreates) && fileCreates.length) {
        const fileItems = [];
        fileCreates.forEach((create) => {
          promise = promise
            .then(() => dataRepo.createItem('fileOpt@khv-gosekspertiza', {name: path.basename(create.id)}, params))
            .then((ops) => {
              const data = {
                id: create.id,
                link: create.link,
                options: ops.getItemId(),
                isConclusionDocument
              };
              return dataRepo.createItem('file@khv-gosekspertiza', data, params);
            })
            .then(file => fileItems.push(file));
        });
        promise = promise.then(() => dataRepo.put(item, 'files', fileItems, params));
      }
      if (Array.isArray(fileDeletes) && fileDeletes.length) {
        fileDeletes.forEach((del) => {
          if (!del._id || !del.__class) {
            return;
          }
          promise = promise.then(() => dataRepo.deleteItem(del.__class, del._id, null, params));
        });
      }
      if (Array.isArray(updates) && updates.length) {
        const dirs = item.getAggregates('dirs') || [];
        updates.forEach((upd) => {
          const dir = dirs.filter(d => d.getItemId() === upd._id)[0];
          if (dir) {
            promise = promise.then(() => updateDirStructure(upd, dir, dataRepo, params));
          }
          if (upd.egrzOpts.name !== dir.get('nameEgrz')
            || upd.egrzOpts.SystemFolderID !== dir.get('SystemFolderID')) {
            promise = promise
              .then(() => dataRepo.editItem(
                dir.getClassName(),
                dir.getItemId(),
                {
                  nameEgrz: upd.egrzOpts.name,
                  SystemFolderID: upd.egrzOpts.SystemFolderID,
                  entityName: upd.egrzOpts.entityName
                },
                null, null, Object.assign({skipResult: true}, params)
              ));
          }
        });
      }
      const forceEnrichment = [
        ['files'],
        ['files', 'options']
      ];
      promise = promise
        .then(() => dataRepo.getItem(item.getClassName(), item.getItemId(), Object.assign({forceEnrichment}, params)))
        .then((cItem) => {
          const files = cItem && cItem.getAggregates('files');
          let p = Promise.resolve();
          if (Array.isArray(files) && files.length) {
            const signs = files.filter((f) => {
              const name = f.get('options.name');
              return name && (path.extname(name) === '.sig' || path.extname(name) === '.sign' || path.extname(name) === '.sgn');
            });
            const parentFiles = files.filter((f) => {
              const name = f.get('options.name');
              return name && path.extname(name) !== '.sig' && path.extname(name) !== '.sign' && path.extname(name) !== '.sgn';
            });
            if (parentFiles.length === 1 && signs.length) {
              signs.forEach((s) => {
                p = p.then(() => dataRepo.editItem(
                  s.getClassName(),
                  s.getItemId(),
                  {parentFile: parentFiles[0].getItemId()},
                  null, null, Object.assign({skipResult: true}, params)
                ));
              });
            } else if (parentFiles.length && signs.length) {
              signs.forEach((s) => {
                const name = s.get('options.name');
                const ext = path.extname(name);
                const pName = path.basename(name, ext);
                const match = parentFiles.filter(f => f.get('options.name') === pName)[0];
                if (match) {
                  p = p.then(() => dataRepo.editItem(
                    s.getClassName(),
                    s.getItemId(),
                    {parentFile: match.getItemId()},
                    null, null, Object.assign({skipResult: true}, params)
                  ));
                }
              });
            }
          }
          return p;
        });
      return promise;
    }

    options.module.get([
      '/goseksp/egrz/cloud-dir-update/:class/:id'
    ], (req, res) => respond(['auth', 'ownCloud'],
      (scope) => {
        const user = scope.auth.getUser(req);
        const {egrzMarker} = req.session;
        if (!egrzMarker) {
          return onError(scope, new Error('Wrong request'), res);
        }
        const cloudProperty = 'result.petitionExpert.cloudObjText';
        const dirProperty = 'dir';
        const fe = generateForceEnrichment(expertDirsToEgrz);
        const opts = {
          forceEnrichment: [
            ...fe,
            ['objectType'],
            ['documentationType'],
            ['result', 'petitionExpert', 'cloudObjText'],
            ['result', 'petitionExpert', 'expObject']
          ],
          user
        };
        let cloudObj;
        let petition;
        let dirStruct;
        let savedStruct;
        let map;
        let container;
        scope.securedDataRepo.getItem(req.params.class, req.params.id, opts)
          .then((item) => {
            const properties = cloudProperty.split('.');
            const target = properties.pop();
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
            cloudObj = petition.get(target);
            if (!cloudObj) {
              return {};
            }
            dirStruct = JSON.parse(cloudObj);

            const dir = item.getAggregate(dirProperty);
            const docType = item.getAggregate('documentationType');
            const docTypeObj = docType && docType.get('alias');
            const objectType = item.getAggregate('objectType');
            const typeObj = objectType && objectType.get('alias');
            map = expertDirsToEgrz[docTypeObj] && expertDirsToEgrz[docTypeObj][typeObj];
            if (!dir || dir.get('name') !== dirStruct.name) {
              return scope.securedDataRepo.createItem('dir@khv-gosekspertiza', {name: dirStruct.name}, {user})
                .then(refDir => scope.securedDataRepo.editItem(
                  item.getClassName(),
                  item.getItemId(),
                  {dir: refDir.getItemId()},
                  null, null, {skipResult: true, user}
                ).then(() => refDir));
            }
            return dir;
          })
          .then((cont) => {
            container = cont;
            savedStruct = normalizeDirStructure(container);
            return egrz.expertiseInputSettings(egrzMarker.access_token);
          })
          .then((is) => {
            const allFolders = is && Array.isArray(is.allSystemFolders) ? is.allSystemFolders : [];
            const systemFolders = allFolders.filter(af => af.isActive);
            return getStructDiff(dirStruct, savedStruct, systemFolders, map);
          })
          .then(upd => updateDirStructure(upd, container, scope.securedDataRepo, {user}))
          .then(() => res.send({result: true}))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );

    function filesState(dirs) {
      const ftu = [];
      Array.isArray(dirs) && dirs.forEach((dir) => {
        if (dir.get('SystemFolderID')) {
          const files = dir.getAggregates('files') || [];
          const filesMap = files.map((file) => {
            return {
              file: file.get('id'),
              state: file.get('state')
            };
          });
          ftu.push(...(filesMap));
        }
        ftu.push(...filesState(dir.getAggregates('dirs')));
      });
      return ftu;
    }

    options.module.get([
      '/goseksp/egrz/files-state/:class/:id/'
    ], (req, res) => respond(['auth'],
      (scope) => {
        const user = scope.auth.getUser(req);
        const dirProperty = 'dir';
        const forceEnrichment = generateForceEnrichment(expertDirsToEgrz);
        const opts = {
          forceEnrichment,
          user
        };
        return scope.securedDataRepo.getItem(req.params.class, req.params.id, opts)
          .then((item) => {
            const dir = item && item.getAggregate(dirProperty);
            if (!dir) {
              return [];
            }
            return filesState([dir]);
          })
          .then(state => res.send(state))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );

    options.module.get([
      '/goseksp/egrz/upload-files/:class/:id/start'
    ], (req, res) => respond(['auth'],
      (scope) => {
        const user = scope.auth.getUser(req);
        const {egrzMarker} = req.session;
        if (!egrzMarker) {
          return onError(scope, new Error('Wrong request'), res);
        }
        const params = {
          class: req.params.class,
          id: req.params.id,
          token: egrzMarker.access_token,
          user: user.id()
        };
        scope.egrzUploader.upload(params)
          .then(() => res.send(true))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );

    options.module.get([
      '/goseksp/egrz/upload-files/:class/:id/check'
    ], (req, res) => respond(['auth'],
      (scope) => {
        const params = {
          class: req.params.class,
          id: req.params.id
        };
        let data;
        scope.egrzUploader.result(params)
          .then((results) => {
            data = Array.isArray(results) ? results : [];
            return scope.egrzUploader.status(params);
          })
          .then(status => res.send({data, status}))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );

    function downloadPrintForm(token, incidentId, storage) {
      return egrz.expertisePrintForm(token, incidentId)
        .then(buffer => storage.accept({buffer, name: `printForm${incidentId}.pdf`}));
    }

    options.module.get([
      '/goseksp/egrz/validate/:class/:id'
    ], (req, res) => respond(['auth', 'fileStorage'],
      (scope) => {
        const user = scope.auth.getUser(req);
        const {egrzMarker} = req.session;
        if (!egrzMarker) {
          return onError(scope, new Error('Wrong request'), res);
        }
        const errorList = [];
        let incidentId;
        return scope.securedDataRepo.getItem(req.params.class, req.params.id, {user})
          .then((item) => {
            incidentId = item && item.get('incidentId');
            if (!incidentId) {
              throw new Error('Wrong request');
            }
            return egrz.expertiseValidate(egrzMarker.access_token, incidentId);
          })
          .then((result) => {
            const upd = {};
            if (result && Array.isArray(result.ErrorList)) {
              errorList.push(...result.ErrorList);
            }
            if (errorList.length > 0) {
              upd.errorList = errorList.map(el => `[${el.Key}] ${el.Value}`).join('\n');
            } else {
              upd.validate = true;
              return downloadPrintForm(egrzMarker.access_token, incidentId, scope.fileStorage)
                .then((file) => {
                  upd.printForm = file.id;
                  return upd;
                });
            }
            return upd;
          })
          .then(upd => scope.securedDataRepo.editItem(
            req.params.class,
            req.params.id,
            upd,
            null,
            null,
            {user}
          ))
          .then(() => res.send({errorList}))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );


    options.module.get([
      '/goseksp/egrz/test'
    ], (req, res) => respond(['auth', 'fileStorage'],
      (scope) => {
        const {egrzMarker} = req.session;
        if (!egrzMarker) {
          return onError(scope, new Error('Wrong request'), res);
        }
        return egrz.incidents(egrzMarker.access_token)
          .then(result => res.send(result))
          .catch(err => onEgrzError(scope, err, req, res));
      }, res)
    );

    return Promise.resolve();
  };

}

module.exports = EgrzController;

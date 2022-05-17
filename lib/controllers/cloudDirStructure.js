const respond = require('modules/registry/backend/respond');
const onError = require('modules/registry/backend/error');
const {enrichCloudDirStructure} = require('../util');

/**
 * @param {{}} options
 * @param {{}} options.module
 * @constructor
 */
function CloudDirStructureController(options) {
  this.init = () => {
    options.module.get('/goseksp/cloud-dir-struct/:class/:id', (req, res) => respond(['auth', 'securedDataRepo', 'ownCloud'],
      (scope) => {
        enrichCloudDirStructure(req.params.class,
          req.params.id,
          scope.auth.getUser(req),
          scope.securedDataRepo,
          scope.ownCloud)
          .then(result => res.send(result))
          .catch(err => onError(scope, err, res));
      }, res));

    return Promise.resolve();
  };
}

module.exports = CloudDirStructureController;

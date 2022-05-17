module.exports = CloudDocumentsImporter;

const ActionHandler = require('modules/registry/backend/ActionHandler');

CloudDocumentsImporter.prototype = new ActionHandler();
function CloudDocumentsImporter(options) {
  this.init = async function(scope) {
    return true;
  }

  this._exec = async function(scope, req) {
    return true;
  }
}

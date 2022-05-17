'use strict';
const request = require('request');

/**
 * @param {{}} options
 * @param {{}} options.module
 * @param {Array.<String>} options.wsdls
 * @constructor
 */
function WsdlCheckController(options) {

  this.init = function () {
    options.module.get('/goseksp/wsdl-check', function (req, res) {
      if (Array.isArray(options.wsdls)) {
        let promises = [];
        options.wsdls.forEach(wsdl => {
          if (wsdl) {
            promises.push(new Promise(function (resolve, reject) {
              request.get({uri: wsdl}, function (err, res) {
                if (!err && res.statusCode === 200) {
                  resolve();
                } else {
                  reject();
                }
              });
            }));
          }
        });
        Promise.all(promises)
          .then(() => res.sendStatus(200))
          .catch(err => res.sendStatus(503));
      } else {
        res.sendStatus();
      }
    });
    return Promise.resolve();
  };

}

module.exports = WsdlCheckController;

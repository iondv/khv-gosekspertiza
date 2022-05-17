const request = require('request');

class ProxyRequester {
  constructor(options) {
    this.debugMode = options ? Boolean(options.debug) : false;
  }

  init() {
    return Promise.resolve();
  }

  request(reqParams) {
    return new Promise((resolve, reject) => {
      if (this.debugMode)
        request.debug = true;

      try {
        request(reqParams, (err, res, body) => {
          request.debug = false;
          if (err)
            return reject(err);

          return resolve({
            res, body
          });
        });
      } catch (err) {
        request.debug = false;
        reject(err);
      }
    });
  }
}

module.exports = ProxyRequester;

const sslConfig = require('./util/openssl-config');
const {fork} = require('child_process');
const {resolve} = require('path');
const cuid = require('cuid');

class EgrzRequester {

  constructor(options) {
    this.childRequest = null;
    this.debugMode = options ? Boolean(options.debug) : false;
  }

  init() {
    return sslConfig()
      .then((sslConfigPath) => {
        const args = [];
        const opts = {
          env: Object.assign({}, process.env),
          execArgv: [],
          stdio: [process.stdin, process.stdout, process.stderr, 'ipc']
        };
        opts.env.OPENSSL_CONF = sslConfigPath;
        if (this.debugMode) {
          opts.env.NODE_DEBUG = 'request';
        }
        this.childRequest = fork(resolve(__dirname, 'request-child.js'), args, opts);
        this.childRequest.on('exit', () => {
          this.childRequest = null;
        });
      });
  }

  request(options) {
    const requestId = cuid();
    let init = Promise.resolve();
    if (!this.childRequest) {
      init = this.init();
    }
    return init.then(() => new Promise(
      (resolve, reject) => {
        const removeListeners = () => {
          this.childRequest.removeListener('message', onMessage);
          this.childRequest.removeListener('error', onError);
        };

        function onMessage(message) {
          if (message && message.id === requestId) {
            removeListeners();
            if (message.err) {
              return reject(new Error(message.err.message, message.err.fileName, message.err.lineNumber));
            }
            return resolve(message.result);
          }
        }

        function onError(err) {
          removeListeners();
          reject(err);
        }

        this.childRequest.on('message', onMessage);
        this.childRequest.on('error', onError);

        this.childRequest.send({
          id: requestId,
          options
        });

      }
    ));
  }

}

module.exports = EgrzRequester;

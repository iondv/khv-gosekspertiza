const {resolve} = require('path');
const {writeFile, access, constants} = require('fs');
const {fork} = require('child_process');

const confPath = resolve(__dirname, '../../config/egrz/openssl.cnf');
const libPath = resolve(__dirname, '../../config/egrz/libgost.so');
const conf = `
openssl_conf = openssl_def

[openssl_def]
engines = engine_section

[engine_section]
gost = gost_section

[gost_section]
engine_id = gost
dynamic_path = ${libPath}
default_algorithms = ALL
CRYPT_PARAMS = id-Gost28147-89-CryptoPro-A-ParamSet
`;

function createOpensslConf() {
  return new Promise((resolve, reject) => {
    writeFile(confPath, conf, (err) => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

/**
 * @param {{}} options
 * @param {{}} options.module
 * @constructor
 */
function EgrzTestController(options) {

  const opts = {
    env: Object.assign({}, process.env)
  };

  opts.env.OPENSSL_CONF = confPath;

  const args = [
    '--host', 'lk.egrz.ru',
    '--unauth', 'false',
    '--cert', resolve(__dirname, '../../config/egrz/certs/root.cer'),
    '--path', '/assets/img/foto.jpg'
  ];

  this.init = () => {

    options.module.get('/egrz/test', (req, res) => {

      access(libPath, constants.F_OK | constants.R_OK, (err) => {
        if (err) {
          res.status(500).send(err);
          return;
        }

        const childRequest = fork(resolve(__dirname, 'request.js'), args, opts);
        const buffers = [];
        let bufLength = 0;

        childRequest.on('message', (message) => {
          if (message && message.type === 'Buffer') {
            const buf = Buffer.from(message.data);
            buffers.push(buf);
            bufLength += buf.length;
          }
        });

        childRequest.on('close', () => {
          try {
            const resultBuf = Buffer.concat(buffers, bufLength);
            res.contentType('image/jpeg');
            res.send(resultBuf);
          } catch (err) {
            res.status(503).send(err);
          }
        });

        childRequest.on('error', (err) => {
          res.status(503).send(err);
        });
      });
    });

    return createOpensslConf();
  };

}

module.exports = EgrzTestController;

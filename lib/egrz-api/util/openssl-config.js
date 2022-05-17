const {writeFile, access, constants} = require('fs');
const {resolve} = require('path');

const confPath = resolve(__dirname, '../../../config/egrz/openssl.cnf');
const libPath = resolve(__dirname, '../../../config/egrz/libgost.so');

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

module.exports = function () {
  return new Promise((resolve, reject) => {
    access(libPath, constants.F_OK | constants.R_OK, (err) => {
      if (err) {
        return reject(err);
      }
      writeFile(confPath, conf, (err) => {
        if (err) {
          return reject(err);
        }
        return resolve(confPath);
      });
    });
  });
};

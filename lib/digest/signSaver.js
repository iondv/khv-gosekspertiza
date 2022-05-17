/**
 * Created by kras on 27.10.16.
 */

const buf = require('core/buffer');
const moment = require('moment-timezone');
const sanitize = require('sanitize-filename');
const F = require('core/FunctionCodes');
const {dateWithTimezone} = require('../util');

// jshint maxstatements: 30
/**
 * @param {{dataRepo: DataRepository, metaRepo: MetaRepository}} options
 * @constructor
 */
function SignSaver(options) {

  function chunkBase64(s) {
    const numChunks = Math.ceil(s.length / 64);
    const chunks = new Array(numChunks);

    for (let i = 0, o = 0; i < numChunks; ++i, o += 64) {
      chunks[i] = s.substr(o, 64);
    }

    return chunks.join('\n');
  }

  this.processSignature = function(attributes, signature, data) {
    return new Promise(((resolve, reject) => {
      let s = Array.isArray(signature) ? signature[0] : signature;

      const d = Array.isArray(data) ? data[0] : data;
      const user = attributes.user;
      const signedFile = {
        name: `${d.attributes.className}@${d.attributes.id}.sig`,
        buffer: buf('-----BEGIN CMS-----\n' + chunkBase64(s) + '\n-----END CMS-----')
      };
      let propertyName = 'sigEkspFile';
      let prepare = Promise.resolve();
      if (attributes.className === 'gosEkspCancel') {
        propertyName = 'sigFileSend';
      } else if (attributes.className === 'sigExpEmployee') {
        let enrich = 'result';
        if (attributes.action === 'sigExpEmployee@khv-gosekspertiza.sign_res') {
          enrich = 'resolution';
        }

        const ro = {forceEnrichment: [[enrich], ['expEmployee']]};
        prepare = options.dataRepo.getItem(d.attributes.className, d.attributes.id, ro)
          .then((item) => {
            if (!item) {
              throw new Error('объект не найден');
            }

            let num = item.get(`${enrich}.num`);
            let date = enrich === 'result' ? item.get(`${enrich}.date`) : new Date();
            let expEmployee = item.getAggregate('expEmployee');
            if (num && date && expEmployee) {
              num = sanitize(String(num));
              date = dateWithTimezone(date, user && user.timeZone());
              expEmployee = sanitize(expEmployee.toString().trim());
              // signedFile.name = `${num}_${date.format('DD.MM.YYYY')}_${expEmployee}.sig`;
              signedFile.name = `conclusion_${item.base.result}_${expEmployee}.sig`;
              propertyName = 'sig';
            } else {
              throw new Error('не достаточно данных');
            }
          });
      } else if (
        attributes.className === 'result' ||
          (attributes.className === 'resolution' && attributes.action === 'resolution@khv-gosekspertiza.sigHead')
      ) {
        prepare = options.dataRepo.getItem(d.attributes.className, d.attributes.id, {})
          .then((item) => {
            if (!item) {
              throw new Error('объект не найден');
            }

            const cn = item.getMetaClass().getName();
            const expEmployee = options.metaRepo.getMeta('expEmployee', null, item.getMetaClass().getNamespace());
            let headPromise;
            if (attributes.className === 'result') {
              headPromise = options.dataRepo.getItem(expEmployee.getCanonicalName(), item.base.personGosExp)
                .then(head => [head]);
            } else
             headPromise = options.dataRepo.getList(expEmployee.getCanonicalName(), {filter: {[F.EQUAL]: ['$head', true]}});

            return headPromise
              .then((heads) => {
                let num = item.get('num');
                let date = cn === 'result' ? item.get('date') : new Date();
                let head = heads && heads.length ? heads[0] : null;
                if (num && date && head) {
                  num = sanitize(String(num));
                  date = dateWithTimezone(date, user && user.timeZone());
                  head = sanitize(head.toString().trim());
                  if (attributes.className === 'result')
                    signedFile.name = `conclusion_${item.base.guid}_${head}.sig`;
                  else
                    signedFile.name = `${num}_${date.format('DD.MM.YYYY')}_${head}.sig`;
                  propertyName = 'sigHead';
                } else {
                  throw new Error('не достаточно данных');
                }
              });
          });
      } else if (attributes.action === 'expertiseResult@khv-gosekspertiza.signEGRZ') {
        propertyName = 'sig';
        prepare = options.dataRepo.getItem(d.attributes.className, d.attributes.id, {})
          .then((item) => {
            const incidentId = item && item.get('incidentId');
            if (!incidentId) {
              throw new Error('не достаточно данных');
            }
            signedFile.name = `printForm${incidentId}.pdf.sig`;
          });
      }
      prepare
        .then(() => options.dataRepo.editItem(d.attributes.className, d.attributes.id, {[propertyName]: signedFile}))
        .then(() => resolve(signature))
        .catch(reject);
    }));
  };

}

module.exports = SignSaver;

const formResult = require('./xml/formResult');
const buildXml = require('./xml/exportXml');

const TIMEZONE_OFFSET = 10;

function workflowEvents(options) {
  this.init = function (scope) {

    // result
    options.workflows.on(
      ['result@khv-gosekspertiza.formResult'],
      (ev) => {
        if (ev.transition === 'projInForm') {
          return new Promise(async (resolve, reject) => {
            const resultItem = ev.item;
            const namespace = resultItem.classMeta.namespace || resultItem.classMeta.plain.namespace;
            const dataToConvert = await getProps(resultItem);
            
            async function getProps(item) {
              const props = await item.getProperties();
              const namespace = item.classMeta.plain.namespace;
              const out = {};
              for (const propName of Object.keys(item.base)) {
                if (!props[propName])
                  continue;
                let value = undefined;
                if (props[propName].meta.refClass) {
                  if (!item.base[propName])
                    continue;
                  const innerItem = await options.dataRepo.getItem(`${props[propName].meta.refClass}@${namespace}`, item.base[propName]);
                  if (innerItem && innerItem.base)
                    value = await getProps(innerItem);
                } else if (props[propName].meta.itemsClass) {
                  value = [];
                  for (const id of item.base[propName]) {
                    const innerItem = await options.dataRepo.getItem(`${props[propName].meta.itemsClass}@${namespace}`, id);
                    if (innerItem && innerItem.base)
                      value.push(await getProps(innerItem));
                  }
                } else {
                  // ставит для выпадающих списков отображаемое значение вместо ключа
                  if (props[propName].meta.selectionProvider && props[propName].meta.selectionProvider.list) {
                    const selectedOption = props[propName].meta.selectionProvider.list.filter(choice => choice.key === item.base[propName])[0];
                    if (selectedOption)
                      value = selectedOption.value;
                    else
                      value = item.base[propName];
                  } else
                    value = item.base[propName];
                }
                if (value instanceof Date) {
                  const timezoneDateValue = new Date(value);
                  timezoneDateValue.setHours(timezoneDateValue.getHours() + TIMEZONE_OFFSET);
                  value = timezoneDateValue.toISOString().split('T')[0];
                }
                if (
                  // (value || (typeof value === 'string'))
                  value
                  && (!Array.isArray(value) || (value.length > 0))
                )
                  out[propName] = value;
              }
              return out;
            }

            let xmlResultSchema;
            try {
              if (dataToConvert.petitionEstimated)
                xmlResultSchema = require('./xml/conclusionSchema_sm.json');
              else
                xmlResultSchema = require('./xml/conclusionSchema_pd.json');
            } catch (err) {
              console.error(err);
              return reject('Не найден json файл со схемой xml.');
            }

            // const testData = {
            //   orgGosExp: [
            //     {
            //       fullName: 'testOrg',
            //       ogrn: 'testOgrn',
            //       inn: 'testInn'
            //     },
            //     {
            //       fullName: 'testOrg2',
            //       ogrn: 'testOgrn2',
            //       inn: 'testInn2',
            //       legalAdr: [
            //         {
            //           country: 'testcountry2',
            //           subjectFederation: 'testSubject'
            //         },
            //         {
            //           federationBorough: 'testBorough1',
            //           subjectFederation: 'testSubject1'
            //         },
            //       ]
            //     }
            //   ]
            // };
            // const testData = {
            //   orgGosExp: [
            //     {
            //       fullName: 'testOrg',
            //       ogrn: 'testOgrn',
            //       inn: 'testInn'
            //     },
            //     {
            //       fullName: 'testOrg2',
            //       ogrn: 'testOgrn2',
            //       inn: 'testInn2',
            //       legalAdr: [
            //         {
            //           country: 'testcountry2',
            //           subjectFederation: 'testSubject'
            //         },
            //         {
            //           federationBorough: 'testBorough1',
            //           subjectFederation: 'testSubject1'
            //         },
            //       ]
            //     }
            //   ],
            //   document: [
            //     {issueAuthor: 'test',
            //       fullIssueAuthor: {
            //         person: {
            //           firstName: 'myname'
            //         }
            //       }}
            //   ]
            // };
            // console.log(dataToConvert);
            // console.log(require('util').inspect(formResult({result: testData}, xmlResultSchema), {depth: 15}))
            // const xml = buildXml(formResult({result: testData}, xmlResultSchema));
            const xml = buildXml(formResult(dataToConvert, xmlResultSchema));
            // console.log(xml);
            // require('fs').writeFileSync('./resultXML.xml', xml);
            // console.log(resultItem)
            try {
              const file = await options.dataRepo.fileStorage.accept(Buffer.from(xml, 'utf-8'), undefined, {name: `conclusion_${resultItem.base.guid}.xml`});
              await options.dataRepo.editItem(`${resultItem.base._class}@${namespace}`, resultItem.id, {fileResult: file.id});
            } catch (err) {
              return reject(err);
            }
            return resolve(true);
          });
        } else {
          return Promise.resolve();
        }
      }
    );
  }
}

module.exports = workflowEvents;

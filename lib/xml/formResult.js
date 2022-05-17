module.exports = form;

// const data = {
//   orgGosExp: {
//     fullName: 'testOrg2',
//     ogrn: 'testOgrn2',
//     inn: 'testInn2',
//     legalAdr: [
//       {
//         country: 'testcountry2',
//         subjectFederation: 'testSubject'
//       },
//       {
//         federationBorough: 'testBorough1',
//         subjectFederation: 'testSubject1'
//       }
//     ]
//   }
// };
// const data2 = {
//   guid: 515,
//   schemaVersion: 515,
//   schemaLink: 'test',
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
//     fullIssueAuthor: {
//       person: {
//         firstName: 'myname'
//       }
//       }}
//   ],
//   summary: {
//     engineeringSurveyType: {
//       name: {
//         name: 'engSurveyType'
//       }
//     }
//   }
// };
//
// console.log(require('util').inspect(assignTrails(data2), {depth: 15}))
// console.log(require('util').inspect(form(data2, require('./conclusionSchema_pd.json')), {depth: 15}))
// console.log(require('./exportXml.js')(form(data2, require('./conclusionSchema_pd.json'))));

// data === result
function form(data, schema) {
  const trails = assignTrails(data);
  return {Conclusion: substituteData(trails, schema)[0]};
}

function substituteData(trails, schema, previous) {
  if (!schema)
    return null;
  if (!schema.fields) {
    if (!schema._mapping)
      return [];
    else
      return mapData(trails, schema._mapping, previous);
  }

  const out = [];
  if (schema._mapping === '')
    return out;
  if (schema._mapping) {
    const sourceObjects = mapData(trails, schema._mapping, previous);
    for (const sourceObject of sourceObjects) {
      const object = collectObject(trails, schema.fields, sourceObject);
      if (object.length > 0)
        out.push(object)
    }
  } else {
    const object = collectObject(trails, schema.fields);
    if (object.length > 0)
      out.push(object);
  }
  return out;
}

function collectObject(trails, fields, sourceObject) {
  const out = [];
  if (Array.isArray(fields)) {
    for (const value of fields) {
      let field = Object.keys(value)[0];
      let element = value[field];
      let fieldData;
      if (field === 'choice') {
        if (Array.isArray(value[field])) {
          for (const possibility of value[field]) {
            const innerField = Object.keys(possibility)[0];
            fieldData = substituteData(trails, possibility[innerField], sourceObject);
            if (fieldData.length > 0) {
              element = value[field][innerField];
              field = innerField;
              break;
            }
          }
        } else {
          for (const innerField of Object.keys(value[field])) {
            fieldData = substituteData(trails, value[field][innerField], sourceObject);
            if (fieldData.length > 0) {
              element = value[field][innerField];
              field = innerField;
              break;
            }
          }
        }
      } else
        fieldData = substituteData(trails, value[field], sourceObject);
      for (const newValue of fieldData) {
        if (element && element._attribute) {
          let attrElement = out.find(el => el._attr);
          if (!attrElement) {
            attrElement = {_attr: {}}
            out.push(attrElement);
          }
          attrElement._attr[field] = newValue;
        } else {
          const wrap = {};
          wrap[field] = newValue;
          out.push(wrap);
        }
      }
    }
  } else {
    for (const field of Object.keys(fields)) {
      const element = fields[field];
      const fieldData = substituteData(trails, fields[field], sourceObject);
      for (const newValue of fieldData) {
        if (element && element._attribute) {
          let attrElement = out.find(el => el._attr);
          if (!attrElement) {
            attrElement = {_attr: {}}
            out.push(attrElement);
          }
          attrElement._attr[field] = newValue;
        } else {
          const wrap = {};
          wrap[field] = newValue;
          out.push(wrap);
        }
      }
    }
  }
  return out;
}

function mapData(trails, mapping, previous) {
  if (!trails[mapping])
    return [];

  if (previous) {
    return trails[mapping]
      .filter(data => data.previous.includes(previous))
      .map(data => data.value);
  } else {
    return trails[mapping]
      .map(data => data.value);
  }
}

function assignTrails(data, trailPrefix, previous) {
  if (!trailPrefix)
    trailPrefix = '';
  const trails = {};
  if (!data && (typeof data !== 'string')) {
    return trails;
  } else if (Array.isArray(data)) {
    for (const value of data) {
      const newTrails = assignTrails(value, trailPrefix, previous);
      for (const trail of Object.keys(newTrails)) {
        if (!trails[trail])
          trails[trail] = [];
        trails[trail] = trails[trail].concat(newTrails[trail]);
      }
    }
  } else if (typeof data === 'object') {
    if (!trails[trailPrefix])
      trails[trailPrefix] = [];
    const trail = {value: data};
    if (previous)
      trail['previous'] = previous;
    trails[trailPrefix].push(trail);
    for (const entry of Object.keys(data)) {
      const newTrails = assignTrails(data[entry], trailPrefix? `${trailPrefix}.${entry}` : entry, previous? previous.concat(data) : [data]);
      for (const trail of Object.keys(newTrails)) {
        if (!trails[trail])
          trails[trail] = [];
        trails[trail] = trails[trail].concat(newTrails[trail]);
      }
    }
  } else {
    const trail = {value: data};
    if (previous)
      trail['previous'] = previous;
    if (!trails[trailPrefix])
      trails[trailPrefix] = [];
    trails[trailPrefix].push(trail);
  }
  return trails;
}

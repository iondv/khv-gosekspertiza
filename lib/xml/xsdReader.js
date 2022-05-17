module.exports = convert;

const streamParser = require('htmlparser2/lib/WritableStream').WritableStream;
const {readFileSync, existsSync} = require('fs');

const testFile = require('path').resolve('./conclusion.xsd');

convert(testFile)
  .then(json => {
    require('fs').writeFileSync('./out.json', JSON.stringify(json, null, 2));
    let consolidated = consolidate(json);
    for (const className of Object.keys(consolidated.schema)) {
      consolidated.schema[className] = collectLostFields(consolidated.schema[className]);
      if (!consolidated.schema[className]['restriction']) {
        consolidated.schema[className] = addHelperFields(consolidated.schema[className]);
      }
    }
    const conclusion = collectObject(consolidated.schema, 'Conclusion');
    require('fs').writeFileSync('./outConsolidated.json', JSON.stringify(consolidated, null, 2));
    require('fs').writeFileSync('./outConclusion.json', JSON.stringify(conclusion, null, 2));
    require('fs').writeFileSync('./out.xml', require('xml')(json[0], {indent: '  '}));
  });

function collectGroup(schema, groupName) {
  if (!schema[groupName])
    return null;
  return expandFields(schema, schema[groupName].fields);
}

function expandFields(schema, fields) {
  let out;
  if (Array.isArray(fields)) {
    out = [];
    for (const value of fields) {
      const innerKey = Object.keys(value)[0];
      if (innerKey === 'group')
        out = concatEntries(out, collectGroup(schema, value[innerKey]._ref));
      else if (innerKey === 'choice')
        out.push({choice: expandFields(schema, value.choice)});
      else {
        const innerValue = {};
        const collectedObject = collectObject(schema, value[innerKey]._type);
        delete collectedObject['title'];
        innerValue[innerKey] = Object.assign({}, value[innerKey], collectedObject);
        out.push(innerValue);
      }
    }
  } else {
    out = {};
    for (const key of Object.keys(fields)) {
      const collectedObject = collectObject(schema, fields[key]._type);
      delete collectedObject['title'];
      out[key] = Object.assign({}, fields[key], collectedObject);
    }
  }
  return out;
}

function collectObject(schema, className) {
  if (!schema[className])
    return {_type: className};
  const out = Object.assign({}, schema[className]);
  if (out.fields)
    out.fields = expandFields(schema, out.fields);
  return out;
}

function addHelperFields(source) {
  const template = {
    _mapping: ''
  };
  let out;
  // if (source['_type'])
    out = Object.assign({}, template, source);
  // else
  //   out = Object.assign({}, source);
  if (out['fields']) {
    if (Array.isArray(out.fields)) {
      for (let i = 0; i < out.fields.length; i += 1) {
        const innerKey = Object.keys(out.fields[i])[0];
        if (innerKey === 'group')
          continue;
        if (innerKey === 'choice')
          out.fields[i][innerKey] = addHelperFields({fields: out.fields[i][innerKey]}).fields;
        else
          out.fields[i][innerKey] = addHelperFields(out.fields[i][innerKey]);
      }
    } else {
      for (const key of Object.keys(out.fields))
        out.fields[key] = addHelperFields(out.fields[key]);
    }
  }
  return out;
}

function collectLostFields(source) {
  // choice objects left in the object body etc
  if (typeof source !== 'object')
    return null;
  const out = {};
  const notFields = [
    'title',
    'fields',
    'assertions',
    'restriction'
  ];
  if (Array.isArray(source)) {
    out['fields'] = [];
    for (const value of source) {
      if ((typeof value === 'object') && (Object.keys(value).length === 1)) {
        const innerKey = Object.keys(value)[0];
        if (notFields.includes(innerKey)) {
          if (innerKey === 'fields')
            out.fields = concatEntries(out.fields, value[innerKey]);
          else
            out[innerKey] = value[innerKey];
        } else {
          out.fields.push(value);
        }
      }
    }
    out.fields = consolidate({sequence: out.fields}).fields;
  } else {
    if (source['fields'])
      out['fields'] = concatEntries(source.fields, []); // convert fields object to array for simpler merging
    else
      out['fields'] = [];
    for (const key of Object.keys(source)) {
      if (key === 'fields')
        continue;
      if (notFields.includes(key)) {
        out[key] = source[key];
      } else {
        const value = {};
        value[key] = source[key];
        out.fields.push(value);
      }
    }
    out.fields = consolidate({sequence: out.fields}).fields;
  }
  return out;
}

function concatEntries(source1, source2) {
  if (Array.isArray(source2) === Array.isArray(source1)) {
    if (Array.isArray(source2))
      return source1.concat(source2);
    else
      return Object.assign({}, source1, source2);
  } else {
    if (Array.isArray(source1)) {
      const out = Object.assign([], source1);
      for (const key of Object.keys(source2)) {
        const value = {};
        value[key] = source2[key];
        out.push(value);
      }
      return out;
    } else {
      const out = Object.assign([], source2);
      for (const key of Object.keys(source1)) {
        const value = {};
        value[key] = source1[key];
        out.push(value);
      }
      return out;
    }
  }
}

function consolidateArray(source) {
  if ((source.length === 1) && (!source[0]['choice']))
    return consolidate(source[0]);
  // move assertions to a separate entry
  source = Object.assign([], source);
  const assertions = [];
  for (let i = 0; i < source.length; i += 1) {
    const value = source[i];
    if ((typeof value === 'object') && (Object.keys(value).length === 1) && (value.assert)) {
      assertions.push(consolidate(value.assert));
      delete source[i];
    }
  }
  if (assertions.length > 0) {
    source.push({assertions: assertions});
    source = source.filter(val => val);
  }
  let convertToObject = true;
  const notFieldNames = [
    'choice',
    'group'
  ];
  const object = {};
  for (const value of source) {
    if ((typeof value !== 'object') || (Object.keys(value).length > 1)) {
      convertToObject = false;
      break;
    }
    const entry = Object.keys(value)[0];
    if (notFieldNames.includes(entry)) {
      convertToObject = false;
      break;
    }
    if (object[entry]) {
      // console.log(`conflicting entry ${entry}, wont convert to object`)
      convertToObject = false;
      break;
    }
    object[entry] = consolidate(value[entry]);
  }
  if (convertToObject)
    return consolidate(object);
  const out = [];
  let isEnumeration = true;
  const enumeration = [];
  for (const value of source) {
    if (!value.enumeration) {
      isEnumeration = false;
      break;
    }
    enumeration.push(consolidate(value.enumeration));
  }
  if (isEnumeration)
    return {possibleValues: consolidate(enumeration)};
  for (const value of source) {
    if (Array.isArray(value)) {
      for (const innerValue of value)
        out.push(consolidate(innerValue));
    } else
      out.push(consolidate(value));
  }
  const possibleValues = [];
  let isListOfPossibleValues = true;
  for (const value of source) {
    if ((typeof value !== 'object') || !value.title || (Object.keys(value).length > 1)) {
      isListOfPossibleValues = false;
      break;
    }
    possibleValues.push(consolidate(value.title));
  }
  if (isListOfPossibleValues)
    return possibleValues;
  return out;
}

function consolidateObject(source) {
  if (Object.keys(source).length === 1) {
    if (source.complextype)
      return consolidate(source.complextype);
  }
  const out = {};
  for (const key of Object.keys(source)) {
    if (key === 'annotation') {
      if (source[key][0] && source[key][0].documentation) {
        out['title'] = consolidate(source[key][0].documentation);
      } else if (source[key].documentation) {
        out['title'] = consolidate(source[key].documentation);
      } else {
        out['title'] = consolidate(source[key]);
      }
    } else {
      out[key] = consolidate(source[key]);
      if ((key === 'complextype') || (key === 'sequence')) {
        // collect every object field to "fields"
        // move everything else (like "assertions") to a separate entry
        const notFields = [
          'assertions',
          'fields'
        ];
        for (let innerKey of Object.keys(out[key])) {
          if (innerKey !== 'fields') {
            if (notFields.includes(innerKey))
              out[innerKey] = out[key][innerKey];
            else {
              let value;
              if (Array.isArray(out[key]))
                value = [out[key][innerKey]];
              else {
                value = {};
                value[innerKey] = out[key][innerKey];
              }
              if (out[key]['fields'])
                out[key].fields = concatEntries(out[key].fields, value);
              else
                out[key]['fields'] = value;
            }
          }
        }
        if (
          (out[key].fields && (Object.keys(out[key]).length === 1))
          || (Object.keys(out[key]).length > 1)
        ) {
          if (out['fields'])
            out['fields'] = concatEntries(out.fields, out[key]['fields'] ? out[key].fields : out[key]);
          else
            out['fields'] = out[key]['fields'] ? out[key].fields : out[key];
          delete out[key];
        }
      }
    }
  }
  return out;
}

function consolidate(source) {
  if (Array.isArray(source)) {
    return consolidateArray(source);
  } else if (typeof source === 'object') {
    return consolidateObject(source);
  } else {
    return source;
  }
}

function convert(source) {
  const out = [];
  const writingStack = [];
  let writingTo = out;
  let key;
  let text;
  let valueAttr;
  const tagsExpanded = expandSelfClosedTags(testFile);

  const parserStream = new streamParser({
    onopentag(name, attributes) {
      if (attributes.name)
        key = attributes.name;
      else {
        key = name.split(':');
        key = key[key.length - 1];
      }
      writingStack.push(writingTo);
      if (attributes.value)
        valueAttr = attributes.value;
      else
        valueAttr = null;
      const value = {};
      value[key] = [];
      if (attributes.test)
        value[key].push({_test: attributes.test});
      if (attributes.ref)
        value[key].push({_ref: attributes.ref});
      if (attributes.type)
        value[key].push({_type: attributes.type});
      if (name === 'xs:attribute')
        value[key].push({_attribute: true});
      writingTo.push(value);
      writingTo = value[key];
      text = '';
    },
    ontext(data) {
      text += data;
    },
    onclosetag(name) {
      text = text.trim();
      if (text.length > 0) {
        const value = {};
        value[key] = text.trim();
        writingTo = writingStack.pop();
        writingTo[writingTo.length - 1] = value;
        text = '';
      } else if (valueAttr) {
        const value = {};
        value[key] = valueAttr;
        writingTo = writingStack.pop();
        writingTo[writingTo.length - 1] = value;
        valueAttr = null;
      } else {
        writingTo = writingStack.pop();
      }
    },
  });

  return new Promise((resolve, reject) => {
    parserStream.on('finish', () => {
      resolve(out);
    });
    parserStream.on('drain', () => {
      resolve(out);
    });
    parserStream.write(tagsExpanded);
  });
}

function expandSelfClosedTags(source) {
  if (existsSync(source))
    return readFileSync(source, {encoding: 'utf-8'}).replace(/<([^\s]+)(\s?[^\/>]*)\/>/ig, '<$1$2></$1>');
  else
    return source.replace(/<([^\s]+)(\s?[^\/>]*)\/>/ig, '<$1$2></$1>');
}

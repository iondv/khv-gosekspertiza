const {readFileSync, writeFileSync} = require('fs');
const {resolve} = require('path');

const stdin = process.openStdin();

const file = process.argv[2];
const schema = JSON.parse(readFileSync(resolve(file), 'utf-8'));
console.log(`read schema from ${file}`)

assignMappings(schema, null, file)
  .then(() => {
    console.log('all done');
    process.exit();
  });

function readInput() {
  return new Promise((resolve) => {
    stdin.once('data', input => resolve(input.toString().trim()));
  });
}

async function assignMappings(schema, path, file) {
  let schemaView = schema;
  if (path && (path.length > 0)) {
    for (const pathPiece of path)
      schemaView = schemaView[pathPiece];
  } else
    path = [];

  const notFieldNames = [
    'assertions',
    'title',
    'restriction'
  ];

  if (typeof schemaView['_mapping'] === 'string') {
    if (schemaView._mapping.length > 0)
      return true;
    console.log(`mapping for ${path.filter(piece => (typeof piece === 'string') && (piece !== 'fields')).join('.')} (${schemaView.title}):`);
    schemaView._mapping = await readInput();
    if (schemaView._mapping.length === 0) {
      delete schemaView._mapping;
      console.log(`deleted mapping for ${path.filter(piece => (typeof piece === 'string') && (piece !== 'fields')).join('.')} (${schemaView.title})`);
    } else
      console.log(`mapping for ${path.filter(piece => (typeof piece === 'string') && (!notFieldNames.concat(['fields']).includes(piece))).join('.')} (${schemaView.title}) is now "${schemaView._mapping}"`);
    writeFileSync(file, JSON.stringify(schema, null, 2));
  }
  if (Array.isArray(schemaView)) {
    for (let i = 0; i < schemaView.length; i += 1) {
      const objectFieldName = Object.keys(schemaView[i])[0];
      await assignMappings(schema, [...path, i, objectFieldName], file);
    }
  } else if (typeof schemaView === 'object') {
    for (const objectFieldName of Object.keys(schemaView)) {
      if (notFieldNames.includes(objectFieldName))
        continue;
      await assignMappings(schema, [...path, objectFieldName], file);
    }
  }
  return true;
}

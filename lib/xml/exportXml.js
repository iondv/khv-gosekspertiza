module.exports = convert;

const xml = require('xml');

function convert(source) {
  return xml(source, {indent: '  '})
    .replace(/(?<=<.*?>[^<]*)&quot;(?=[^<]*<\/.*?>)/g, '"');
}

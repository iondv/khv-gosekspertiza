const getCrc = require('./lib/getCrc');

module.exports = function (options) {

  this.inject = async function (values) {
    if (values && values.cloudObj && values.cloudObjText) {
      const cloudPathParts = values.cloudObj.split('/');
      const dirPathStart = cloudPathParts.findIndex(part => part === '?dir=') + 1;
      let explicitDirPath;
      if (dirPathStart > 1) {
        explicitDirPath = cloudPathParts.slice(dirPathStart, cloudPathParts.length - 1).join('/');
      }
      const url = `${cloudPathParts.slice(0, 3).join('/')}/api/crc/`;
      let crcList;
      if (explicitDirPath) {
        try {
          crcList = await getCrc(explicitDirPath, url);
        } catch (err) {
        }
      }
      if (!crcList)
        crcList = await getCrc(cloudPathParts[cloudPathParts.length - 2], url);
      values.cloudObjText = putCrc(values.cloudObjText, '', crcList);
    }
    return true;
  };

};

function putCrc(cloudObjText, path, crcList) {
  const out = Object.assign({}, cloudObjText);
  out.dirs = [];
  out.files = [];
  for (const dir of cloudObjText.dirs)
    out.dirs.push(putCrc(dir, path.length > 0? `${path}/${dir.name}` : dir.name, crcList));
  for (const file of cloudObjText.files) {
    const fileWithCrc = Object.assign({}, file);
    out.files.push(fileWithCrc);
    fileWithCrc['crc'] = crcList[path.length > 0? `${path}/${file.name}` : file.name];
  }
  return out;
}

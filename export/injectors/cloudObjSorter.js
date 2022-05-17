module.exports = function (options) {

  this.inject = function (values) {
    if (values && values.cloudObjText)
      values.cloudObjText = sortCloudObj(values.cloudObjText);
    return true;
  };

};

function sortCloudObj(cloudObjText) {
  if (!cloudObjText)
    return cloudObjText;
  const out = Object.assign({}, cloudObjText);
  out.dirs = [];
  for (const dir of cloudObjText.dirs)
    out.dirs.push(sortCloudObj(dir));
  out.dirs = out.dirs.sort(sortFunction);
  out.files = out.files.sort(sortFunction);
  return out;

  function sortFunction(a, b) {
    const entry1 = getEntryNumber(a.name);
    const entry2 = getEntryNumber(b.name);
    if (entry1) {
      if (entry2)
        return entry1 - entry2;
      else
        return -1;
    }
    if (entry2)
      return 1;

    if (!b.name)
      return -1;
    if (!a.name)
      return 1;
    return a.name.localeCompare(b.name);
  }

  function getEntryNumber(string) {
    if (!string)
      return null;
    const match = /^(\d+)./.exec(string);
    if (!match)
      return null;
    return Number(match[1]);
  }
}

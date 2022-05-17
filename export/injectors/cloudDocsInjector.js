const cloudDownloadUtil = require('./util/cloudDownload');

module.exports = function (options) {

  this.inject = async function (values) {
    if (values && values.cloudObj) {
      const docs = await cloudDownloadUtil(values.cloudObj, options.cloud.login, options.cloud.password);
      values.cloudObjText = convertCloudStructToCloudObjText(docs);
      // if (values && !values.cloudObjText && values.cloudObj) {
      // }
    }
    return true;
  };

};

function convertCloudStructToCloudObjText(cloudStruct, name) {
  let out;
  if (cloudStruct.contents) {
    out = {
      name,
      "files": [],
      "dirs": []
    };

    for (const innerStructName of Object.keys(cloudStruct.contents)) {
      if (cloudStruct.contents[innerStructName].contents)
        out.dirs.push(convertCloudStructToCloudObjText(cloudStruct.contents[innerStructName], innerStructName));
      else
        out.files.push(convertCloudStructToCloudObjText(cloudStruct.contents[innerStructName], innerStructName));
    }
  } else {
    out = {
      name,
      "link": cloudStruct.link
    }
  }

  return out;
}

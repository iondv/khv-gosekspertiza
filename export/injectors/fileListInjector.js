module.exports = function () {
  this.inject = function (values) {
    if (values && values.cloudObjText) {
      try {
        const fileList = getFileList(values.cloudObjText);
        values.cloudObjText = fileList.map((file) => {
          const nameParts = file.name.split('.');
          const name = nameParts.slice(0, nameParts.length - 1).join('.');
          const type = nameParts[nameParts.length - 1];
          return {name, type, crc: file.crc || ''};
        });
      } catch (e) {
        values.cloudObjText = null;
      }
    }
    return true;
  };

  function getFileList(dir) {
    let files = [];
    if (dir.files && Array.isArray(dir.files))
      files = files.concat(dir.files);
    if (dir.dirs && Array.isArray(dir.dirs)) {
      dir.dirs.forEach((dir) => {
        files = files.concat(getFileList(dir));
      });
    }
    return files;
  }

};

module.exports = function () {

  this.inject = function (values) {
    if (values && values.cloudObjText) {
      try {
        values.cloudObjText = JSON.parse(values.cloudObjText); // values.cloudObjText = JSON.parse(values.cloudObjText.replace(/remote.php\/dav\/files\/admin/ig, "remote.php/webdav"));
      } catch (e) {
        values.cloudObjText = null;
      }
    }
    return true;
  };

};

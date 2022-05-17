module.exports = function () {
  this.inject = function (values) {
    if (values && values.cloudObjText) {
      try {
        values.cloudObjText = JSON.parse(values.cloudObjText);
      } catch (e) {
        values.cloudObjText = null;
      }
    }
    return true;
  };
};
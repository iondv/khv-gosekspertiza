/**
 * Created by Vasiliy Ermilov (ermilov.work@yandex.ru) on 11/4/16.
 */
'use strict';

module.exports = function (data, options, callback) {

  function getPetitionExpert(guid) {
    return new Promise(function (resolve, reject) {
      var cm = options.metaRepository.getMeta('petitionExpert', null, options.namespace);
      if (!cm) {
        return reject(new Error('не найден PetitionExpert'));
      }

      options.dataRepository.getItem(cm.getCanonicalName(), data.guid, 2)
        .then(function (item) {
          if (!item) {
            return reject(new Error('Не найден объект'));
          }
          return resolve(item);
        }).catch(reject);
    });
  }

  if (!data.guid) {
    return callback(new Error('неверные данные'));
  }

  if (data.snils) {
    getPetitionExpert(data.guid)
      .then(function (item) {
        var cloudObjtrue = item.get('cloudObjtrue');
        return callback(null, {guid: data.guid, cloudObjtrue: cloudObjtrue});
      }).catch(callback);
  } else if (typeof data.cloudObjtrue !== 'undefined') {
    getPetitionExpert(data.guid)
      .then(function (item) {
        var itemUpdate = {
          cloudObjtrue: data.cloudObjtrue
        };
        options.dataRepository.editItem(item.getMetaClass().getCanonicalName(), data.guid, itemUpdate)
          .then(function () {
            return callback(null, {guid: data.guid, stat: 'ok'});
          }).catch(callback);
      }).catch(callback);
  } else {
    return callback(new Error('неверный запрос'));
  }
};

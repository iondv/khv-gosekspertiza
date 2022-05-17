/**
 * Created by Vasiliy Ermilov (ermilov.work@yandex.ru) on 10/14/16.
 */
const ShareAccessLevel = require('core/interfaces/ResourceStorage/lib/ShareAccessLevel');
const dirs = require('applications/khv-gosekspertiza/paths_config/petitionExpertDirs.json');
const {createDirs} = require('applications/khv-gosekspertiza/lib/util');

/**
 * @param {Item} petition
 * @param {{dataRepository: DataRepository, dirHelper: CloudDirHelper}} options
 * @returns {Promise}
 */
module.exports = function (petition, options) {

  if (!petition.get('expObject')) {
    return Promise.reject(new Error('Не указан объект экспертизы!'));
  }

  const cm = options.metaRepository.getMeta('expObject', null, options.namespace);
  let dirStructure;
  let dirName;
  let dir;

  return options.dataRepository.getItem(cm.getCanonicalName(), petition.get('expObject'))
    .then((item) => {
      if (!item) {
        throw new Error('Не найден объект экспертизы!');
      }
      const typeObj = item.get('typeObjexp');
      dirStructure = dirs[typeObj];
      if (!dirStructure) {
        throw new Error('Указан некорректный тип объекта экспертизы!');
      }
      return options.dirHelper.getPetitionDirName(petition);
    })
    .then((cloudDirName) => {
      dirName = cloudDirName;
      return options.ownCloudStorage.createDir(dirName, null, true);
    })
    .then((cloudDir) => {
      dir = cloudDir;
      if (!dir) {
        throw new Error('Не удалось создать директорию!');
      }
      return createDirs(dirStructure, dirName, options.ownCloudStorage);
    })
    .then(() => options.ownCloudStorage.share(
      dirName,
      petition.get('status') == 24 ? ShareAccessLevel.READ : ShareAccessLevel.WRITE
    ))
    .then((share) => {
      if (!share) {
        throw new Error('Не удалось создать share!');
      }
      return {cloudObj: dir.link, cloudObjShare: share.getLink()};
    });
};

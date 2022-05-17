const {produceDirName} = require('core/util/dirName');

class CloudDirHelper {

  constructor(options) {
    this.dirTemplate = options.dirTemplate;
    this.dataRepo = options.dataRepo;
    this.ownCloud = options.ownCloud;
  }

  getPetitionCloudDir(petition) {
    if (!petition) {
      return Promise.resolve({});
    }
    const cloudObj = petition.get('cloudObj');
    return (cloudObj ? Promise.resolve(cloudObj) : this.getPetitionDirName(petition))
      .then(cloudDirName => this.ownCloud.getDir(cloudDirName))
      .then((dir) => {
        if (dir) {
          return {dir, dirName: dir.id};
        }
        let petBase = petition.get('petBase');
        if (!petBase) {
          return {};
        }
        let pet = petition.getAggregate('petBase');
        if (pet) {
          return this.getPetitionCloudDir(pet, this.ownCloud, this.dataRepo);
        }
        return this.dataRepo.getItem(petition.getClassName(), petBase)
          .then(p => this.getPetitionCloudDir(p, this.ownCloud, this.dataRepo));
      });
  }

  getPetitionDirName(petition) {
    if (this.dirTemplate) {
      return produceDirName(this.dirTemplate, petition.getClassName(), petition.getItemId(), null, this.dataRepo, true);
    } else {
      const guid = petition.get('guid');
      return guid ? Promise.resolve(guid) : Promise.reject(new Error('Unable to produce petition dir name'));
    }
  }
  
}

module.exports = CloudDirHelper;

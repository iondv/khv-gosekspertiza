module.exports = CloudProxy;

const Service = require('modules/rest/lib/interfaces/Service');
const NAMESPACE = "khv-gosekspertiza";
const SIMULTANEOUS_REQUESTS = 10;

CloudProxy.prototype = new Service();
function CloudProxy(options) {
  const injectorsPipeline = [
    new (require('../../export/injectors/cloudDocsInjector'))({cloud: options}),
    // new (require('../../export/injectors/cloudObjParser'))(),
    new (require('../../export/injectors/cloudObjSorter'))()
  ];

  this._route = function(router) {
    this.addHandler(router, '/:link', 'POST', async req => {
      // console.log(req);
      // if (!req.query || !req.query.link)
      if (!req.params || !req.params.link)
        return 'link parameter is required';

      const docs = {cloudObj: req.params.link};

      const resultItemId = req.body;

      const resultItem = await options.dataRepo.getItem(`result@${NAMESPACE}`, resultItemId);

      const resultDocuments = [];

      let requestsInProgress = [];
      for (const docId of resultItem.base.documents) {
        if (!docId)
          continue;
        while (requestsInProgress.length >= SIMULTANEOUS_REQUESTS) {
          if (requestsInProgress.length > 0)
            await Promise.race(requestsInProgress);
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        const requestPromise = options.dataRepo.getItem(`documentsCloud@${NAMESPACE}`, docId)
        requestsInProgress.push(requestPromise);
        requestPromise
          .then(doc => {
            resultDocuments.push(doc);
            requestsInProgress = requestsInProgress.filter(promise => promise !== requestPromise);
          });
      }

      await Promise.all(requestsInProgress);

      const docFiles = [];
      for (const docItem of resultDocuments.filter(doc => doc)) {
        if (!docItem || !docItem.base.fileDoc || !docItem.base.fileDoc[0])
          continue;
        while (requestsInProgress.length >= SIMULTANEOUS_REQUESTS) {
          if (requestsInProgress.length > 0)
            await Promise.race(requestsInProgress);
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        const requestPromise = options.dataRepo.getItem(`fileDoc@${NAMESPACE}`, docItem.base.fileDoc[0])
        requestsInProgress.push(requestPromise);
        requestPromise
          .then(file => {
            docFiles.push(file);
            requestsInProgress = requestsInProgress.filter(promise => promise !== requestPromise);
          });
      }

      await Promise.all(requestsInProgress);

      const importedFiles = docFiles.filter(file => file)
        .map(file => file.base.storagePath);

      for (const injector of injectorsPipeline) {
        try {
          await injector.inject(docs);
        } catch (err) {
          console.error(err);
        }
      }

      return {
        cloudObjText: docs.cloudObjText,
        importedFiles: importedFiles
      };
    });
  }
}

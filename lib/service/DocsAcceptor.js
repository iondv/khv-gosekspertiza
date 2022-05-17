module.exports = DocsAcceptor;

const Service = require('modules/rest/lib/interfaces/Service');
const getCrc = require('../../export/injectors/lib/getCrc');

const NAMESPACE = 'khv-gosekspertiza';
const SIMULTANEOUS_REQUESTS = 10;

const expDocumentTypes = require('../../config/expDocumentTypes.json');

DocsAcceptor.prototype = new Service();
function DocsAcceptor(options) {

  this._route = function(router) {
    this.addHandler(router, '/', 'POST', async req => {
      const data = JSON.parse(req.body);
      const crcData = await getCrc(data.dir, data.crcUrl);
      const resultItem = await options.dataRepo.getItem(`result@${NAMESPACE}`, data.resultItemId);

      let petItem;
      if (resultItem.base.petitionExpert)
        petItem = await options.dataRepo.getItem(`${resultItem.classMeta.propertyMetas.petitionExpert.refClass}@${NAMESPACE}`, resultItem.base.petitionExpert);
      else
        petItem = await options.dataRepo.getItem(`${resultItem.classMeta.propertyMetas.petitionEstimated.refClass}@${NAMESPACE}`, resultItem.base.petitionEstimated);

      const organization = await options.dataRepo.getItem(`${petItem.classMeta.propertyMetas.customerOrg.refClass}@${NAMESPACE}`, petItem.base.customerOrg);

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

      const importedDocIds = [];

      for (const requiredDocPath of data.docs) {
        let docsToImport = Object.keys(crcData)
          .filter(docPath => docPath.slice(0, requiredDocPath.length) === requiredDocPath)
          .filter(docPath => docPath.slice(docPath.length - 4) !== '.sig')
          .filter(docPath => !importedFiles.includes(docPath));

        for (const realDocPath of docsToImport) {
          const docPathParts = realDocPath.split('/');
          const fileNameParts = docPathParts[docPathParts.length - 1].split('.');
          let fileName;
          let fileExtension;
          let hasExtension = false;
          if (fileNameParts.length > 1) {
            fileName = fileNameParts.slice(0, fileNameParts.length - 1).join('.');
            fileExtension = fileNameParts[fileNameParts.length - 1];
            hasExtension = true;
          } else {
            fileName = fileNameParts[0];
            fileExtension = '';
          }
          const completeFileName = hasExtension? `${fileName}.${fileExtension}` : fileName;

          let signFileCrc = crcData[`${realDocPath}.sig`];
          let signFileItem;
          if (signFileCrc) {
            signFileItem = await options.dataRepo.createItem(`signFile@${NAMESPACE}`, {
              name: `${completeFileName}.sig`,
              format: 'sig',
              checksum: signFileCrc,
              storagePath: `${realDocPath}.crc`
            });
          }

          const fileItemToImport = {
            name: completeFileName,
            format: fileExtension,
            checksum: crcData[realDocPath],
            storagePath: realDocPath
          };

          if (signFileItem)
            fileItemToImport['signFile'] = [signFileItem.id];

          const fileItem = await options.dataRepo.createItem(`fileDoc@${NAMESPACE}`, fileItemToImport);

          let docType;
          for (const type of Object.keys(expDocumentTypes)) {
            const docPathParts = realDocPath.split('/');
            if (expDocumentTypes[type].includes(docPathParts.slice(0, docPathParts.length - 1)
              .join('/'))) {
              docType = type;
              break;
            }
          }

          let docTypeItem;
          if (docType) {
            const typeItems = await options.dataRepo.getList(`docType@${NAMESPACE}`, {
              filter: {eq: ['$type', docType]}
            });
            if (typeItems && typeItems[0])
              docTypeItem = typeItems[0];
          }

          const docItemToImport = {
            name: fileName,
            fileDoc: [fileItem.id]
          };

          if (organization)
            docItemToImport['author'] = organization.base.fullName;
          if (docTypeItem) {
            docItemToImport['docType'] = docTypeItem.id;
            docItemToImport['codeGroup'] = docTypeItem.base.codeGroup;
          }

          const docItem = await options.dataRepo.createItem(`documentsCloud@${NAMESPACE}`, docItemToImport);
          importedDocIds.push(docItem.id);
        }
      }

      await options.dataRepo.saveItem(`result@${NAMESPACE}`, resultItem.id, {
        documents: resultItem.base.documents.concat(importedDocIds)
      });

      return importedDocIds.length.toString();
    });
  }

}

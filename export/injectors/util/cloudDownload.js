const https = require('https');

const nodeNameRegexp = /\/([^\/]*?)\/$/;
const fileNameRegexp = /\/([^\/]*?)$/;
const storageRootRegexp = /^(https?:\/\/.+?)\//;

module.exports = (docsUrl, cloudLogin, cloudPassword) => {
  const storageRoot = storageRootRegexp.exec(docsUrl)[1];

  let storagePath;
  let storagePathRegexp;

  switch(storageRoot) {
    case 'https://demo-cloud.iondv.com':
      storagePath = '/remote.php/dav/files/admin/';
      storagePathRegexp = /\/remote\.php\/dav\/files\/admin\/(.*?)<\//g;
      break;
    case 'https://expkhv.ru':
      storagePath = '/remote.php/webdav/';
      storagePathRegexp = /\/remote\.php\/webdav\/(.*?)<\//g;
      break;
  }

  const url = `${storageRoot}${storagePath}${docsUrl.split('?dir=/')[1]}`;
  return requestDocs(url, cloudLogin, cloudPassword, storageRoot, storagePath, new RegExp(storagePathRegexp));
}

function requestDocs(url, user, password, storageRoot, storagePath, storagePathRegexp) {
  return new Promise((resolve, reject) => {
    const out = {
      link: url,
      contents: {}
    };
    // const req = https.request(encodeURI(decodeURI(url)), {
    const req = https.request(url, {
      auth: `${user}:${password}`,
      method: 'PROPFIND',
      timeout: 60000
    }, (res) => {
      let chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      res.on('error', (err) => {
        return reject(err);
      });
      res.on('end', async () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        let match;
        let skipFirst = true;
        while (match = storagePathRegexp.exec(data)) {
          if (skipFirst) {
            skipFirst = false;
            continue;
          }
          const link = match[1];
          const nodeNameMatch = nodeNameRegexp.exec(link);

          if (nodeNameMatch) {
            const nodeName = decodeURIComponent(nodeNameMatch[1])
            out.contents[nodeName] = await requestDocs(
              `${storageRoot}${storagePath}${link}`,
              user,
              password,
              storageRoot,
              storagePath,
              new RegExp(storagePathRegexp)
            );
          } else {
            const fileName = decodeURIComponent(fileNameRegexp.exec(link)[1]);
            out.contents[fileName] = `${storageRoot}${storagePath}${link}`;
          }
        }
        return resolve(out);
      });
    });

    req.on('error', reject);

    req.end();
  });
}

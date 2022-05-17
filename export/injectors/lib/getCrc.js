module.exports = getCrc;

const https = require('https');

function getCrc(dir, url) {
  // console.log(dir);
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      timeout: 60000
    }, res => {
      if ((res.statusCode !== 200) && (res.statusCode !== 301)  && (res.statusCode !== 302))
        return reject(`${res.statusCode} ${res.statusMessage}`);
      let chunks = [];
      res.on('data', chunk => chunks = chunks.concat(chunk));
      res.on('error', (err) => {
        return reject(err);
      });
      res.on('end', () => {
        try {
          return resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        } catch (err) {
          console.error(`Проблема в данных, полученных из сервиса crc (${url}):`);
          console.error(Buffer.concat(chunks).toString('utf-8'));
          return reject(err);
        }
      });
    });

    req.on('error', err => reject(err));
    req.end(dir);
  });
}

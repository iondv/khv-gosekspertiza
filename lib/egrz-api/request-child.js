const request = require('request');

function errorToObject(err) {
  if (err) {
    return {
      message: err.message,
      fileName: err.fileName,
      lineNumber: err.lineNumber
    };
  }
  return {};
}

function requestPromise(reqParams) {
  return new Promise((resolve, reject) => {
    try {
      request(reqParams, (err, res, body) => {
        if (err) {
          return reject(err);
        }
        return resolve({res, body});
      });
    } catch (err) {
      reject(err);
    }
  });
}

function parseMessage(obj) {
  if (obj) {
    Object.keys(obj).forEach((key) => {
      if (obj[key] !== null && typeof obj[key] === 'object') {
        if (obj[key].type === 'Buffer' && Array.isArray(obj[key].data)) {
          obj[key] = Buffer.from(obj[key].data);
        } else {
          obj[key] = parseMessage(obj[key]);
        }
      }
    });
  }
  return obj;
}

function worker() {
  return new Promise((resolve, reject) => {
    if (!process.send) {
      return reject(new Error('no IPC channel found'));
    }
    process.on('message', (message) => {
      message = parseMessage(message);
      if (message && message.id && message.options) {
        requestPromise(message.options)
          .then(ctx => process.send({id: message.id, result: ctx}))
          .catch(err => process.send({id: message.id, err: errorToObject(err)}));
      }
    });
  });
}

worker();

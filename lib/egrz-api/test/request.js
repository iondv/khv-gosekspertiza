const https = require('https');
const fs = require('fs');

function readFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });
}

const params = {
  hostname: 'localhost',
  port: 443,
  path: '/',
  method: 'GET',
  rejectUnauthorized: true,
  key: null,
  cert: null,
  ca: null
};

let setParam = false;

process.argv.forEach((val) => {
  if (val === '--host') {
    setParam = 'hostname';
  } else if (val === '--port') {
    setParam = 'port';
  } else if (val === '--path') {
    setParam = 'path';
  } else if (val === '--method') {
    setParam = 'method';
  } else if (val === '--unauth') {
    setParam = 'rejectUnauthorized';
  } else if (val === '--key') {
    setParam = 'key';
  } else if (val === '--cert') {
    setParam = 'cert';
  } else if (val === '--ca') {
    setParam = 'ca';
  } else if (setParam) {
    if (setParam === 'ca') {
      if (!Array.isArray(params[setParam])) {
        params[setParam] = [];
      }
      params[setParam].push(val);
    } else if (setParam === 'rejectUnauthorized') {
      params[setParam] = val === 'false' ? false : true;
    } else {
      params[setParam] = val;
    }
  }
});

const options = {
  hostname: params.hostname,
  port: params.port,
  path: params.path,
  method: params.method,
  rejectUnauthorized: params.rejectUnauthorized
};

let fileLoaders = Promise.resolve();

if (typeof params.key === 'string') {
  fileLoaders = fileLoaders.then(() => readFile(params.key)).then(data => options.key = data);
}

if (typeof params.cert === 'string') {
  fileLoaders = fileLoaders.then(() => readFile(params.cert)).then(data => options.cert = data);
}

if (Array.isArray(params.ca) && params.ca.length) {
  options.ca = [];
  params.ca.forEach((ca) => {
    fileLoaders = fileLoaders.then(() => readFile(ca)).then(data => options.ca.push(data));
  });
}

fileLoaders.then(() => {
  const req = https.request(options, res => {
    res.on('data', (data) => {
      process.send(data);
    });
  });

  req.on('error', (err) => {
    throw err;
  });

  req.end();
});

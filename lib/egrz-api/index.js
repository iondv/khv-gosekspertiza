const ProxyRequester = require('./proxy-requester');
const EgrzApiError = require('./EgrzApiError');
const {toAbsolute, readFile} = require('core/system');
const LoggerProxy = require('core/impl/log/LoggerProxy');
const url = require('url');
const _ = require('lodash');

function getRedirectUrl(ctx) {
  const statusCode = _.get(ctx, 'res.statusCode');
  if (statusCode !== 302) {
    throw new EgrzApiError('Wrong EGRZ Response', statusCode);
  }
  const redirect = _.get(ctx, 'res.headers.location');
  if (!redirect) {
    throw new EgrzApiError('Wrong EGRZ Response', statusCode);
  }
  return redirect;
}

function parseBody(ctx, successStatusCodes) {
  successStatusCodes = Array.isArray(successStatusCodes)
    ? successStatusCodes
    : Array.of(successStatusCodes || 200);
  const statusCode = _.get(ctx, 'res.statusCode');
  if (!successStatusCodes.includes(statusCode)) {
    let errMsg;
    if (typeof ctx.body === 'string') {
      errMsg = ctx.body;
    } else if (ctx.body) {
      try {
        errMsg = JSON.stringify(ctx.body);
      } catch (_) {
        // Do nothing
      }
    }
    throw new EgrzApiError(errMsg || 'Unrecognized error', statusCode);
  }
  if (typeof ctx.body === 'string') {
    try {
      return JSON.parse(ctx.body);
    } catch (err) {
      // Do nothing
    }
  } else if (ctx.body && ctx.body.type === 'Buffer') {
    return Buffer.from(ctx.body.data);
  }
  return ctx.body;
}

class EgrzApi {
  /**
   * Common API GIS EGRZ
   * @param {Object} options
   * @param {String} options.cert
   * @param {String} options.key
   * @param {String} options.ca
   * @param {String} [options.apiUrl]
   * @param {Boolean} [options.debug]
   * @param {Boolean} [options.verbose]
   * @param {Logger} [options.log]
   * @constructor
   * @public
   */
  constructor(options) {
    this._options = options || {};
    this._log = this._options.verbose && this._options.log || new LoggerProxy();
    this._requester = options.requester || new ProxyRequester({debug: this._options.debug});
    this.authUrl = options.authUrl  || 'https://lk.egrz.ru/fws/';
    this.apiUrl = options.apiUrl || 'https://lk.egrz.ru/fws/';
    this.fileApiUrl = options.fileApiUrl || 'https://lk.egrz.ru/file/';
  }

  init() {
    let promise = this._requester.init();
    if (this._options.cert) {
      promise = promise
        .then(() => readFile(toAbsolute(this._options.cert), {encoding: 'utf8'}))
        .then((cert) => {
          this.cert = cert;
        });
    }
    if (this._options.key) {
      promise = promise
        .then(() => readFile(toAbsolute(this._options.key), {encoding: 'utf8'}))
        .then((key) => {
          this.key = key;
        });
    }
    if (this._options.ca) {
      promise = promise
        .then(() => readFile(toAbsolute(this._options.ca), {encoding: 'utf8'}))
        .then((ca) => {
          this.ca = ca;
        });
    }
    return promise;
  }

  /**
   * @param {Object} options
   * @returns {Promise.<Object>}
   * @private
   */
  _request(options) {
    options = options || {};
    options.strictSSL = options.strictSSL || false;
    if (this.cert) {
      options.cert = this.cert;
    }

    if (this.key) {
      options.key = this.key;
    }

    if (this.ca) {
      options.ca = this.ca;
    }
    
    return this._requester
      .request(options)
      .then((ctx) => {
        const statusCode = _.get(ctx, 'res.statusCode');
        this._log.info(`ЕГРЗ API: [${statusCode || ''}] ${options.method || ''} ${options.uri || ''}`);
        return ctx;
      })
      .catch((err) => {
        this._log.error(`ЕГРЗ API: Ошибка запроса ${options.method || ''} ${options.uri || ''}`);
        throw err;
      });
  }

  /**
   * @param {String} marker
   * @returns {Object}
   * @public
   */
  decodeMarker(marker) {
    let result;
    if (typeof marker === 'string') {
      const decoded = decodeURIComponent(marker);
      const buf = Buffer.from(decoded, 'base64');
      const markerString = decodeURIComponent(buf.toString('utf8'));
      try {
        result = JSON.parse(markerString);
      } catch (err) {
        // Do nothing
      }
    }
    return result;
  }

  /**
   * Esia
   */

  /**
   * Вход в систему с использованием ЕСИА
   * @param {String} redirectUrl - Адрес перехода при успешном логине
   * @param {String} [errorRedirectUrl] - Адрес перехода при возникновении ошибки
   * @returns {Promise.<String>} - Адрес страницы логина
   * @public
   */
  esiaLogin(redirectUrl, errorRedirectUrl) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/esia/login'),
      followRedirect: false,
      qs: {redirectUrl}
    };
    if (errorRedirectUrl) {
      req.qs.errorRedirectUrl = errorRedirectUrl;
    }
    return this._request(req).then(ctx => getRedirectUrl(ctx));
  }

  /**
   * Получение маркера доступа к информации о пользователе от ЕСИА
   * @param {String} state - Набор случайных символов (необходимо для защиты от перехвата)
   * @param {String} code - Значение авторизационного кода, который необходимо обменять на маркер доступа
   * @returns {Promise.<String>} - Адрес страницы для получения маркера
   * @public
   */
  esiaUserMarker(state, code) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/esia/user_marker'),
      followRedirect: false,
      qs: {code, state}
    };
    return this._request(req).then(ctx => getRedirectUrl(ctx));
  }

  /**
   * Получение списка возможных авторизаций для пользователя ЕСИА
   * @param {String} token - Bearer token
   * @param {String} [redirectUrl] - Адрес перехода при успешном логине
   * @returns {Promise.<Object>} - Данные пользователя и его организации
   * @public
   */
  esiaAuth(token, redirectUrl) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/esia/auth'),
      qs: {},
      auth: {bearer: token}
    };
    if (redirectUrl) {
      req.qs.redirectUrl = redirectUrl;
    }

    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Авторизация с правами представителя указанного юридического лица
   * @param {String} redirectUrl - Адрес перехода при успешной авторизации
   * @param {String} [id] - Идентификатор организации в ЕГРЗ
   * @param {String} [role] - Роль организации
   * @param {String} [marker] - Маркер пользователя ЕСИА
   * @param {String} [oid] - Идентификатор организации в ЕСИА
   * @returns {Promise.<String>} - Адрес страницы для получения маркера
   * @public
   */
  esiaOrg(redirectUrl, id, role, marker, oid) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/esia/org'),
      followRedirect: false,
      qs: {redirectUrl}
    };
    if (id) {
      req.qs.id = id;
    }
    if (marker) {
      req.qs.marker = marker;
    }
    if (role) {
      req.qs.role = role;
    }
    if (oid) {
      req.qs.oid = oid;
    }
    return this._request(req).then(ctx => getRedirectUrl(ctx));
  }

  /**
   * Получение маркера доступа к информации об организации от ЕСИА
   * @param {String} oid - Идентификатор организации из ЕСИА
   * @param {String} state - Набор случайных символов (необходимо для защиты от перехвата)
   * @param {String} code - Значение авторизационного кода, который необходимо обменять на маркер доступа
   * @returns {Promise.<String>} - Адрес страницы для получения маркера
   * @public
   */
  esiaOrgMarker(oid, state, code) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, `api/esia/${oid}/organization_marker`),
      followRedirect: false,
      qs: {state, code}
    };
    return this._request(req).then(ctx => getRedirectUrl(ctx));
  }

  /**
   * Текущее состояние авторизации
   * @param {String} token - Bearer token
   * @returns {Promise.<Object>} - Данные пользователя и его организации
   * @public
   */
  esiaUser(token) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/esia/user'),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Обновление токена
   * @param {String} token - Bearer token
   * @returns {Promise.<Object>} - MarkerResponse
   * @public
   */
  esiaToken(token) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/esia/token'),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Подтверждение аутентификации пользователя
   * @param {String} token - Bearer token
   * @param {String} password - Пароль пользователя
   * @returns {Promise.<Boolean>}
   * @public
   */
  esiaVerify(token, password) {
    const req = {
      method: 'PUT',
      uri: url.resolve(this.apiUrl, 'api/esia/verify'),
      auth: {bearer: token},
      headers: {
        'Content-Type': 'text/json'
      },
      body: JSON.stringify(password)
    };
    return this._request(req)
      .then((ctx) => {
        if (_.get(ctx, 'res.statusCode') === 200 && ctx.body === 'true') {
          return true;
        }
        return false;
      });
  }

  /**
   * Установка пароля для пользователя
   * @param {String} token - Bearer token
   * @param {String} password - Пароль пользователя
   * @returns {Promise}
   * @public
   */
  esiaReset(token, password) {
    const req = {
      method: 'PUT',
      uri: url.resolve(this.apiUrl, 'api/esia/reset'),
      body: {password},
      auth: {bearer: token}
    };
    return this._request(req);
  }

  /**
   * Изменение пароля пользователем
   * @param {String} token - Bearer token
   * @param {String} password - Пароль пользователя
   * @returns {Promise}
   * @public
   */
  esiaRegistry(token, password) {
    const req = {
      method: 'PUT',
      uri: url.resolve(this.apiUrl, 'api/esia/registry'),
      body: {password},
      auth: {bearer: token}
    };
    return this._request(req);
  }

  /**
   * Incidents
   */

  /**
   * Получение списка инцидентов
   * @param {String} token - Bearer token
   * @returns {Promise}
   * @public
   */
  incidents(token) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/Incidents'),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Expertises
   */

  /**
   * Добавление нового экспертного заключения
   * @param {String} token - Bearer token
   * @param {Object} expertise - Данные об экспертном заключении
   * @returns {Promise.<String>} - Идентификатор экспертного заключения
   * @public
   */
  expertiseCreate(token, expertise) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, 'api/expertises'),
      auth: {bearer: token},
      json: expertise
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Чтение экспертного заключения
   * @param {String} token - Bearer token
   * @param {String} id - Идентификатор экспертного заключения
   * @returns {Promise.<Object>} - Данные экспертного заключения
   * @public
   */
  expertiseGet(token, id) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, `api/expertises/${id}`),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Изменение экспертного заключения
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {Object} expertise - Данные об экспертном заключении
   * @returns {Promise.<Object>} - Данные экспертного заключения
   * @public
   */
  expertiseUpdate(token, incidentId, expertise) {
    const req = {
      method: 'PUT',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}`),
      auth: {bearer: token},
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(expertise)
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Валидация
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @returns {Promise.<Object>}
   * @public
   */
  expertiseValidate(token, incidentId) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/validate`),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Генерация печатной формы и описи для заявления №1
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @returns {Promise.<Object>}
   * @public
   */
  expertisePrintForm(token, incidentId) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/printForm`),
      encoding: null,
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Добавление новой организации для объекта экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {String} accountType - Тип организации
   * @param {{}} organization - Объект организации
   * @returns {Promise.<String>} - uuid организации
   * @public
   */
  expertiseOrganizationCreate(token, incidentId, accountType, organization) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/organizations/${accountType}`),
      auth: {bearer: token},
      json: organization
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Получение организаций для объекта экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {Object} accountType - Тип организации
   * @returns {Promise.<Object>} - Данные организации
   * @public
   */
  expertiseOrganizationGet(token, incidentId, accountType) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/organizations/${accountType}`),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Получение параметров объекта экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @returns {Promise} - Результат запроса
   * @public
   */
  expertiseObjectParameters(token, incidentId) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/objectParameters`),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Добавление или обновление параметров объекта экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {{}} objectParameterValues - Параметры объекта
   * @returns {Promise} - Результат запроса
   * @public
   */
  expertiseObjectParametersCreate(token, incidentId, objectParameterValues) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/objectParameters`),
      auth: {bearer: token},
      json: objectParameterValues
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Добавление нового объекта строительства для объекта экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {{}} buildObject - Объект организации
   * @returns {Promise.<String>} - uuid объекта
   * @public
   */
  expertiseBuildObjectCreate(token, incidentId, buildObject) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/buildObject`),
      auth: {bearer: token},
      json: buildObject
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Параметры формы ввода заключений
   * @param {String} token - Bearer token
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  expertiseInputSettings(token) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/expertises/inputSettings'),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Отправить на обработку
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @returns {Promise.<Object>} - Данные организации
   * @public
   */
  expertiseSend(token, incidentId) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/sendToProcessing`),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 204]));
  }

  /**
   * Поиск экспертного заключения
   * @param {String} token - Bearer token
   * @param {String} expertiseNumber - Номер экспертизы
   * @param {Boolean} onlyMyItems - Заключения доступные только для авторизовавшейся организации
   * @returns {Promise.<Object>} - Найденные экспертные заключения
   * @public
   */
  expertiseSuggestions(token, expertiseNumber, onlyMyItems = false) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/expertises/suggestions'),
      qs: {
        expertiseNumber,
        onlyMyItems
      },
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Добавление новой ссылки на ранее выполненную экспертизу для результата экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {{}} linkedObject - ДТО связанного результата экспертизы
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  expertiseLinkedCreate(token, incidentId, linkedObject) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/linkedExpertiseResults`),
      auth: {bearer: token},
      json: linkedObject
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Обновление или создание (ipsert) значения РИИ для результата экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {String} linkedExpertiseItemId - Идентификатор ранее выполненной экспертизы для результата экспертизы
   * @param {{}} linkedObject - ДТО связанного результата экспертизы
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  expertiseLinkedUpsert(token, incidentId, linkedExpertiseItemId, linkedObject) {
    const req = {
      method: 'PUT',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/linkedExpertiseResults/${linkedExpertiseItemId}`),
      auth: {bearer: token},
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(linkedObject)
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Получение значений РИИ для результата экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  expertiseRii(token, incidentId) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/riiResults`),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Создание значения РИИ для результата экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {{}} riiResult - Результат инженерных исследований
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  expertiseRiiCreate(token, incidentId, riiResult) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/riiResults`),
      auth: {bearer: token},
      json: riiResult
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Обновление значения РИИ для результата экспертизы
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {String} riiResultId - Идентификатор ДТО РИИ
   * @param {{}} riiResult - Результат инженерных исследований
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  expertiseRiiUpdate(token, incidentId, riiResultId, riiResult) {
    const req = {
      method: 'PUT',
      uri: url.resolve(this.apiUrl, `api/expertises/${incidentId}/riiResults/${riiResultId}`),
      auth: {bearer: token},
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(riiResult)
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Получение пользовательских параметров обьекта
   * 
   * @param {String} token - Bearer token
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  objectParameters(token) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, 'api/objectParameter'),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Добавление нового параметра обьекта, либо озвращение существующего с такими же полями для объекта строительства
   * @param {String} token - Bearer token
   * @param {{}} objectParameter - Параметры объекта
   * @returns {Promise} - Результат запроса
   * @public
   */
  objectParameterCreate(token, objectParameter) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, 'api/objectParameter'),
      auth: {bearer: token},
      json: objectParameter
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Добавление нового параметра обьекта, либо озвращение существующего с такими же полями
   * @param {String} token - Bearer token
   * @param {String} incidentId - Идентификатор инцидента
   * @param {{}} objectParameter - Параметры объекта
   * @returns {Promise} - Результат запроса
   * @public
   */
  objectParameterIncidentCreate(token, incidentId, objectParameter) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, `api/objectParameter/${incidentId}`),
      auth: {bearer: token},
      json: objectParameter
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Получение динамических параметров для объекта строительства
   * @param {String} token - Bearer token
   * @param {String} id - Идентификатор объекта строительства
   * @returns {Promise} - Результат запроса
   * @public
   */
  buildObjectsObjectParameters(token, id) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.apiUrl, `api/buildObjects/${id}/objectParameters`),
      auth: {bearer: token}
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Добавление или обновление динамических параметров для объекта строительства
   * @param {String} token - Bearer token
   * @param {String} id - Идентификатор объекта строительства
   * @param {{}} objectParameter - Параметры объекта
   * @returns {Promise} - Результат запроса
   * @public
   */
  buildObjectsObjectParameterCreate(token, id, objectParameter) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.apiUrl, `api/buildObjects/${id}/objectParameters`),
      auth: {bearer: token},
      json: objectParameter
    };
    return this._request(req).then(ctx => parseBody(ctx, [200, 201]));
  }

  /**
   * Files
   */

  /**
   * Передача chunk
   * @param {String} token - Bearer token
   * @param {{}} params - Параметры
   * @param {Number} params.resumableChunkNumber - Номер текущего части файла начинающийся с 1
   * @param {Number} params.resumableChunkSize - Текущий размер части файла в байтах
   * @param {Number} params.resumableCurrentChunkSize - Текущий размер части файла в байтах
   * @param {Number} params.resumableTotalSize - Общий размер файла в байтах
   * @param {String} params.resumableType - Тип файла в формате MIME
   * @param {String} params.resumableIdentifier - Уникальный ID файла, с которым он будет сохранен
   * @param {String} params.resumableFilename - Имя файла и его расширение
   * @param {String} params.resumableRelativePath - Имя файла и его расширение
   * @param {Number} params.resumableTotalChunks - Общее количество частей, на которые был разбит отправляемый файл
   * @param {String} params.entityId - Идентификатор сущности
   * @param {String} params.entityName - Название типа сущности, к которой прикрепляется файл, в CRM
   * @param {String} [params.SystemFolderID] - Идентификатор системной папки, куда будет сохранен файл
   * @param {String} [params.UserFolderID] - Идентификатор системной папки, куда будет сохранен файл
   * @param {String} [params.parentFile] - Идентификатор родительского файла (для файлов-подписей)
   * @param {Boolean} [params.isConclusionDocument] - Является ли файл заключением экспертизы
   * @param {String} chunk - Bearer token
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  fileUpload(token, params, chunk) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.fileApiUrl, 'api/File/Upload'),
      auth: {bearer: token},
      qs: params,
      formData: Object.assign(
        {},
        params,
        {
          '': {
            value: chunk,
            options: {
              filename: params.resumableFilename,
              contentType: params.resumableType
            }
          }
        }
      )
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Проверка загруженности chunk
   * @param {String} token - Bearer token
   * @param {Number} resumableChunkNumber - Номер текущего части файла начинающийся с 1
   * @param {String} resumableIdentifier - Уникальный ID файла, с которым он будет сохранен
   * @param {String} systemFolderId - Идентификатор системной папки, куда будет сохранен файл
   * @param {String} userFolderId - Идентификатор системной папки, куда будет сохранен файл
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  fileUploadCheck(token, resumableChunkNumber, resumableIdentifier, systemFolderId, userFolderId) {
    const req = {
      method: 'GET',
      uri: url.resolve(this.fileApiUrl, 'api/File/Upload'),
      auth: {bearer: token},
      qs: {
        resumableChunkNumber,
        resumableIdentifier,
        systemFolderId,
        userFolderId
      }
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

  /**
   * Получение файла подписи из строки и подписание им печатной формы
   * @param {String} token - Bearer token
   * @param {String} data - строка подписи в формате Base64
   * @param {String} entityName - Наименование сущности
   * @param {String} incidentId - Идентификатор обращения
   * @param {String} resultType - Тип решения
   * @returns {Promise.<Object>} - Объект с параметрами
   * @public
   */
  fileFromString(token, data, entityName, incidentId, resultType) {
    const req = {
      method: 'POST',
      uri: url.resolve(this.fileApiUrl, 'api/File/fromString'),
      auth: {bearer: token},
      headers: {
        'content-type': 'application/octet-stream'
      },
      qs: {
        entityName: entityName,
        incidentId: incidentId,
        resultType: resultType || 'null'
      },
      body: data
    };
    return this._request(req).then(ctx => parseBody(ctx));
  }

}

module.exports = EgrzApi;

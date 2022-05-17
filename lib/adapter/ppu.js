/**
 * Created by kras on 22.09.16.
 */
'use strict';
const base64 = require('base64-js');
const Zip = require('adm-zip');
const xpath = require('xpath');
const Dom = require('xmldom').DOMParser;
const buf = require('core/buffer');

// jshint maxstatements: 30

/**
 * @param {{}} options
 * @param {Logger} [options.log]
 * @param {{}} [options.mapping]
 * @param {String[]} [options.ignore]
 * @param {String[]} [options.collapse]
 * @param {String} [options.namespace]
 * @param {Boolean} [options.createOnly]
 */
module.exports = function (options) {

  function log(msg) {
    if (options.log) {
      options.log.info(msg);
    }
  }

  function parseAttribute(attr, result, cache) {
    if (attr.hasAttribute('refClass')) {
      var rc = attr.getAttribute('refClass');
      if (rc) {
        if (isClassIgnored(rc)) {
          return undefined;
        }
        var ri = xpath.select('genericItem', attr);
        if (ri.length > 0) {
          return parseItem(ri[0], result, rc, cache);
        }

        ri = xpath.select('genericItems', attr);
        if (ri.length > 0) {
          var col = [];
          ri = xpath.select('genericItems/genericItem', attr);
          for (var i = 0; i < ri.length; i++) {
            col.push(parseItem(ri[i], result, rc, cache));
          }
          return col;
        }
      }
      return null;
    } else {
      return attr.textContent;
    }
  }

  function isClassIgnored(className) {
    if (Array.isArray(options.ignore)) {
      return options.ignore.indexOf(className) >= 0;
    }
    return false;
  }

  function isAttrIgnored(className, aname) {
    if (options.mapping && options.mapping.hasOwnProperty(className) &&
      Array.isArray(options.mapping[className].ignore)) {
      return options.mapping[className].ignore.indexOf(aname) >= 0;
    }
    return false;
  }

  function assignAttr(data, className, aname, v) {
    if (typeof v === 'undefined') {
      return;
    }

    if (options.mapping && options.mapping.hasOwnProperty(className) &&
      options.mapping[className].attrs &&
      options.mapping[className].attrs.hasOwnProperty(aname)) {
      aname = options.mapping[className].attrs[aname];
    }

    if (Array.isArray(aname)) {
      for (var i = 0; i < aname.length; i++) {
        data[aname[i]] = v;
      }
    } else {
      data[aname] = v;
    }
  }

  function parseItem(item, result, className, cache) {
    if (className && !isClassIgnored()) {
      var id = xpath.select('identifier/text()', item).toString();
      var idName = xpath.select1('identifier/@name', item).value;
      var attrs = xpath.select('attributes/attr', item);

      var cn = className;
      if (options.mapping && options.mapping.hasOwnProperty(className)) {
        cn = options.mapping[className].className;
      }

      if (Array.isArray(options.collapse) && options.collapse.indexOf(className) >= 0) {
        return id;
      }

      var data;
      var add = true;
      if (cache.hasOwnProperty(cn + '@' + id)) {
        data = cache[cn + '@' + id];
        add = false;
      } else {
        data = {
          _class: cn + (options.namespace ? '@' + options.namespace : '')
        };
        if (idName && id) {
          assignAttr(data, className, idName, id);
        }
        cache[cn + '@' + id] = data;
      }

      for (var i = 0; i < attrs.length; i++) {
        if (!isAttrIgnored(className, attrs[i].getAttribute('name'))) {
          assignAttr(data, className, attrs[i].getAttribute('name'), parseAttribute(attrs[i], result, cache));
        }
      }
      if (add) {
        result.push(data);
      }
      return id;
    }
    return null;
  }

  function parseDoc(className, doc, callback, rootNode) {
    try {
      var result = [];
      var items = xpath.select(rootNode + '/genericItems/genericItem', doc);
      var cache = {};
      for (var i = 0; i < items.length; i++) {
        parseItem(items[i], result, className, cache);
      }
      callback(null, result);
    } catch (err) {
      callback(err, null);
    }
  }

  this.parse = function (data) {
    return new Promise(function (resolve, reject) {
      try {
        var dom = new Dom();
        var doc = dom.parseFromString(buf(base64.toByteArray(data)).toString('UTF8'));
        var className = xpath.select('/GetGenericItemsResponse/className/text()', doc).toString();

        var zipNode = xpath.select('//zipResponse/text()', doc).toString();

        var cb = function (err, items) {
          if (err) {
            return reject(err);
          }
          resolve(items);
        };

        if (zipNode) {
          try {
            var unzipped = new Zip(buf(base64.toByteArray(zipNode)));
            var zipEntries = unzipped.getEntries();
            var xml = '';
            for (var i = 0; i < zipEntries.length; i++) {
              xml = xml + unzipped.readAsText(zipEntries[i]);
            }
            doc = dom.parseFromString(xml);
            parseDoc(className, doc, cb, '');
          } catch (err2) {
            throw new Error('accept:ppu: Не удалось распаковать содержимое. Причина: ' + err2);
          }
        } else {
          parseDoc(className, doc, cb, '/GetGenericItemsResponse');
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  this.respond = function (items) {
    return new Promise(function (rs) {
      rs({data: 'done'});
    });
  };
};

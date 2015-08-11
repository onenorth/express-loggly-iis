// node modules
var os = require('os');

// node_modules modules
var debug = require('debug');
var loggly = require('loggly');
var onFinished = require('finished');
var useragent = require('useragent');

exports = module.exports = function (options) {
  options = options || {};
  var immediate = options.immediate || false;
  var config = options.loggly || {};

  var client =  loggly.createClient(config);

  var machine = os.hostname();
  var pid = process.pid.toString();

  var logFormat = function (req, res) {

    var time = getTime(req, res);
    var content = getResponseHeaderFieldValue(req, res, 'content-length');
    var level;

    if (res.statusCode >= 500) {
      level = 'ERROR';
    } else if (res.statusCode >= 400) {
      level = 'WARN';
    } else {
      level = 'INFO';
    }

    var recordObj = {
      'date': new Date().toUTCString(),
      'level': level,

      'server': {
        'server-name': machine,
        'pid': pid
      },

      'request': {
        'host': req.headers['host'],
        'method': req.method,
        'protocol': req.protocol,
        'version': req.httpVersionMajor + '.' + req.httpVersionMinor,
        'hostname': req.hostname,
        'path': req.path,
        'query': req.query ? (Object.keys(req.query).length > 0 ? req.query : '') : '',
        'session': req.sessionID,
        'body': req.body,
        'remote-address': req.headers['x-forwarded-for']
                          || req.connection.remoteAddress
                          || (req.socket && req.socket.remoteAddress)
                          || (req.socket.socket && req.socket.socket.remoteAddress)
      },
      'response': {
        'status': res._headers ? res.statusCode.toString() : '',
        'content-length': content ? content + '-bytes' : '',
        'response-time': time + ' ms'
      },

      'url': req.originalUrl || req.url,
      'user-agent': useragent.lookup(req.headers['user-agent']),
      'referrer': req.headers['referer'] || req.headers['referrer']
    };

    return recordObj;
  };

  return function logger (next, req, res) {

    req._startAt = process.hrtime();

    function logRequest () {
      var record = logFormat(req, res);
      record = JSON.stringify(record);

      client.log(record, config.tags, function (err, result) {
        if (err) {
          debug(err.message);
        } else {
          debug('Log Record: ' + JSON.stringify(record));
          debug('Response: ', + JSON.stringify(result));
        }
      });
    }

    if (immediate) {
      logRequest();
    } else {
      onFinished(res, logRequest);
    }

    next();
  }

  function getTime(req, res) {
    if (!res._header || !req._startAt) {
      return '';
    }
    var diff = process.hrtime(req._startAt);
    var ms = diff[0] * 1e3 + diff[1] * 1e-6;
    return ms.toFixed(3);
  }

  function getResponseHeaderFieldValue(req, res, field) {
    return (res._headers || {})[field.toLowerCase()];
  }
}

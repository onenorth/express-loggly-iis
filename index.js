'use strict';

/**
 * Module exports
 * @public
 */
module.exports = logglyLogger;
module.exports.compile = compile;
module.exports.format = format;
module.exports.token = token;

/**
 * Module dependencies
 * @private
 */
var os = require('os');
var debug = require('debug')('logglyLogger');;
var deprecate = require('depd')('logglyLogger');
var loggly = require('loggly');
var onFinished = require('finished');

/**
 * Common log format month names
 * @private
 */
var CLF_MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Create the loggly middleware
 * @public
 * @param {String|Function} format
 * @param {Object} options
 *
 * @return {Function} middleware
 */
function logglyLogger (format, options) {
  var fmt = format;
  var opts = options || {};

  if (format && typeof format === 'object') {
    opts = format;
    fmt = opts.format || 'iis';
  }

  if (fmt === undefined) {
    deprecate('undefined format: please specify a format');
  }

  // log on request instead of response
  var immediate = opts.immediate || false;

  // should the log entry be skipped
  var skip = opts.skip || false;

  // line format function
  var formatLine = (typeof fmt !== 'function') ? _getFormatFunction(fmt) : fmt;

  // loggly configuration
  var defaultTags = ['iis'];
  var config = opts.loggly;
  var tags = defaultTags.concat(config.tags || '');

  // create the loggly client
  var client = loggly.createClient(config);

  return function logger (next, req, res) {
    // shift args if running inside keystone or any other app that
    // for some reason shifts the argument order
    if (typeof req === 'function') {
       var params = [].slice.call(arguments);
       next = params[0];
       req = params[1];
       res = params[2];
    }

    // request
    req._startAt = undefined;
    req._startTime = undefined;
    req._remoteAddress = _getIpAddress(req);

    // response
    res._startAt = undefined;
    res._startTime = undefined;

    _recordStartTime.call(req);

    function logRequest () {
      if (skip !== false && skip(req, res)) {
        debug('skipped request');
        return;
      }

      var line = formatLine(logglyLogger, req, res);

      if (line === null) {
        debug('skipped line');
        return;
      }

      try {
        var tokenHash = {};
        var tokens = line.split('|');
        tokens.forEach(function(token) {
          var parts = token.split('=');
          tokenHash[parts[0]] = parts[1];
        });

        if (Object.keys(tokenHash).length > 0) {
          line = JSON.stringify(tokenHash);
        }
      } catch (err) {}

      client.log(line, tags, function (err, result) {
        if (err) {
          debug(err.message);
        } else {
          debug('Log Record: ' + line);
          debug('Response: ', + JSON.stringify(result));
        }
      });
    }

    if (immediate) {
      logRequest();
    } else {
      if (res._header) {
        _recordStartTime.call(res);
      }
      // log when response is finished
      onFinished(res, logRequest);
    }

    next();
  };
}

/**
 * Formatters
 */
logglyLogger.format('combined', [
    ':remote-addr', ':date[clf]', ':method', ':url',
    ':http-version', ':status', ':res[content-length]',
    ':referrer :user-agent'
  ].join('|'));

// logglyLogger.format('iis', 'severity:level|s-port:port|cs-Referer:referrer|cs-method:method|s-computername:computer-name|sc-status:status|time-taken:response-time|cs-version:http-version|EventTime:date-time[web]|cs-User-Agent:user-agent|cs-bytes:req[content-length]|cs-host:host|date:date-time[date]|c-ip:remote-addr|s-ip:server-ip|sc-bytes:res[content-length]|cs-uri-stem:url|cs-query:query|time:date-time[time]|host:hostname');
logglyLogger.format('iis', [
    'severity:level', 's-port:port', 'cs-Referer:referrer', 'cs-method:method',
    's-computername:computer-name', 'sc-status:status', 'time-taken:response-time',
    'cs-version:http-version', 'EventTime:date-time[web]', 'cs-User-Agent:user-agent',
    'cs-bytes:req[content-length]', 'cs-host:host', 'date:date-time[date]',
    'c-ip:remote-addr', 's-ip:server-ip', 'sc-bytes:res[content-length]',
    'cs-uri-stem:url', 'cs-query:query', 'time:date-time[time]', 'host:hostname'
  ].join('|'));

logglyLogger.format('dev', function developmentFormatLine(tokens, req, res) {
  var status = res._header ? res.statusCode : undefined;

  var color = status >= 500 ? 31 //red
    : status >= 400 ? 33 //yellow
    : status >= 300 ? 36 //cyan
    : status >= 200 ? 32 //green
    : 0; // no color

  var fn = developmentFormatLine[color];

  if (!fn) {
    fn = developmentFormatLine[color] = compile('\x1b[0m:method :url \x1b['
    + color + 'm:status \x1b[0m:response-time ms - :res[content-length]\x1b[0m');
  }

  return fn(tokens, req, res);
});

logglyLogger.token('method', function getMethodToken(req, res, label) {
  var retval = req.method;
  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('status', function getStatusToken(req, res, label) {
  var retval = res._header ? String(res.statusCode) : '-'
  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('level', function getStatusToken(req, res, label) {
  var retval = res._header ? String(res.statusCode) : '-'

  if (retval !== '-') {
    retval = retval >= 500 ? 'ERROR'
      : retval >= 400 ? 'WARN'
      : retval >= 200 ? 'INFO'
      : '0'
  }

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('url', function getUrlToken(req, res, label) {
  var retval = req.originalUrl || req.url;
  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('port', function getHostToken(req, res, label) {
  var retval = req.headers['host'] || '-';

  if (retval !== '-') {
    retval = retval.split(':')[1];
  }
  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('computer-name', function(req, res, label) {
  var retval = os.hostname();

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
})

logglyLogger.token('host', function getHostToken(req, res, label) {
  var retval = req.headers['host'] || '-';

  if (retval !== '-') {
    retval = retval.split(':')[0];
  }
  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('hostname', function getHostnameToken(req, res, label) {
  var retval = req.hostname || '-';
  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('server-ip', function(req, res, label) {
  var retval;

  try {
      var adrs = os.networkInterfaces();
      for (var key in adrs) {
        if (adrs.hasOwnProperty(key)) {
          for (var i = 0, len = adrs[key].length; i < len; i++) {
            var currKey = adrs[key][i];
            if (currKey.internal === false && currKey.family === 'IPv4') {
              retval = currKey.address;
              break;
            }

            if (retval !== undefined) {
              break;
            }
          }
        }
      }
  } catch (err) {
    debug(err.message);
    retval = '-';
  }

  if (retval === undefined) {
    retval = '-';
  }

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('query', function getQueryToken(req, res, label) {
  var retval = req.query ? (Object.keys(req.query).length > 0 ? req.query : '-') : '-';
  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('response-time', function getResponseTimeToken(req, res, label) {
  var retval;

  if (!res._header || !req._startAt) {
    retval = '-';
  }

  var diff = process.hrtime(req._startAt);
  var ms = diff[0] * 1e3 + diff[1] * 1e-6;

  retval = ms.toFixed(3);

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('date-time', function getDateTimeToken(req, res, label, format) {
  var retval;
  var date = new Date();

  switch (format || 'web') {
    case 'date':
      retval = _dateDate(date);
      break;
    case 'time':
      retval = _timeDate(date);
      break;
    case 'clf':
      retval = _clfDate(date);
      break;
    case 'iso':
      retval = date.toISOString();
      break;
    case 'web':
      retval = date.toUTCString();
      break;
  }

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('time', function getTimeToken(req, res, label) {
  var retval = _simpleDate(new Date());

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('referrer', function getReferrerToken(req, res, label) {
  var retval;
  var referrer = req.headers['referer'] || req.headers['referrer'];

  if (referrer === undefined) {
    retval = '-';
  }

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('remote-addr', function getIpAddress(req, res, label) {
  var retval = _getIpAddress(req);

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('http-version', function getHttpVersionToken(req, res, label) {
  var retval = 'HTTP/' + req.httpVersionMajor + '.' + req.httpVersionMinor;

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('user-agent', function getUserAgentToken(req, res, label) {
  var retval = req.headers['user-agent'];

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('req', function getRequestToken(req, res, label, field) {
  var retval = '-';
  var header = req.headers[field.toLowerCase()];

  if (header !== undefined) {
    retval = Array.isArray(header) ? header.join(', ') : header;
  }

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

logglyLogger.token('res', function getResponseToken(req, res, label, field) {
  var header;
  var retval = '-';

  if (res._header) {
    header = res._headers[field.toLowerCase()];

    if (header !== undefined) {
      retval = Array.isArray(header) ? header.join(', ') : header;
    }
  }

  return (label && label.length > 0) ? (label + '=' + retval) : retval;
});

/**
 * Compile a format string into a function
 * @param {string} format
 * @return {function}
 * @public
 */
 function compile(format) {
  if (typeof format !== 'string') {
    throw new TypeError('argument format must be a string');
  }

  var fmt = format.replace(/"/g, '\\"')
  var fn = '  return "' + fmt.replace(/([-\w]{2,})?:([-\w]{2,})(?:\[([^\]]+)\])?/g, function(_, tokenLabel, tokenName, tokenArg) {
    return '"\n    + (tokens["' + tokenName + '"](req, res, ' + String(JSON.stringify(tokenLabel)) + ', ' + String(JSON.stringify(tokenArg)) + ') || "") + "'
  }) + '";'

  return new Function('tokens, req, res', fn);
 }

/**
 * Create a format with a name
 * @param {string} name
 * @param {string|function} fmt
 * @public
 */
function format(name, fmt) {
  logglyLogger[name] = fmt;
  return this;
}

/**
 * Define a token function with given name and callback
 * @param {string} name
 * @param {function}
 * @public
 */
function token(name, fn) {
  logglyLogger[name] = fn;
  return this;
}

/**
 * Get common log format date
 * @param {Date} datetime
 * @return {string}
 */
function _clfDate(dateTime) {
  var date = dateTime.getUTCDate();
  var hour = dateTime.getUTCHours();
  var mins = dateTime.getUTCMinutes();
  var secs = dateTime.getUTCSeconds();
  var year = dateTime.getUTCFullYear();
  var month = dateTime.getUTCMonth();

  var clfMonth = CLF_MONTH[month];

  return _pad2(date) + '/' + month + '/' + year
    + ':' + _pad2(hour) + ':' + _pad2(mins) + ':' + _pad2(secs)
    + ' +0000';
}

function _timeDate(dateTime) {
  var hour = dateTime.getUTCHours();
  var mins = dateTime.getUTCMinutes();
  var secs = dateTime.getUTCSeconds();

  return _pad2(hour) + ':' + _pad2(mins) + ':' + _pad2(secs);
}

function _dateDate(dateTime) {
  var date = dateTime.getUTCDate();
  var month = dateTime.getUTCMonth();
  var year = dateTime.getUTCFullYear();

  return year + '-' + _pad2(month) + '-' + _pad2(date);

}

/**
 * Pad a number to 2 places
 * @param {number} num
 * @return {string}
 * @private
 */
function _pad2(num) {
  var str = String(num);

  return (str.length === 1 ? '0' : '') + str;
}

/**
 * Find then compile a named format function
 * @param {string} name
 * @return {function}
 * @private
 */
function _getFormatFunction(name) {
  var fmt = logglyLogger[name] || name || logglyLogger.default;

  return (typeof fmt !== 'function') ? compile(fmt) : fmt;
}

/**
 * Get IP Address of remote (client) connection
 * @param {Object} req
 * @return {string}
 */
function _getIpAddress(req) {
  return req.headers['x-forwarded-for'] || req._remoteAddress || req.ip
                || (req.connection && req.connection.remoteAddress)
                || (req.socket && req.socket.remoteAddress)
                || (req.socket.socket && req.socket.socket.remoteAddress)
                || '-';
}

/**
 * Record the start time
 * @private
 */
function _recordStartTime() {
  this._startAt = process.hrtime();
  this._startTime = new Date();
}

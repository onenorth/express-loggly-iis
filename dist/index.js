'use strict';var axios=require('axios'),trimTags=function(b){return b.split(',').map(function(c){return c.trim()}).join(',')},config={token:process.env.LOGGLY_TOKEN||console.error('Must provide a LOGGLY TOKEN'),subdomain:process.env.LOGGLY_SUBDOMAIN||'logs-01',tags:trimTags(process.env.LOGGLY_TAGS||'iis')},twoDigits=function(b){return 0<b&&10>b?'0'+b:b},date=function(b){var c=b.getUTCFullYear(),d=twoDigits(b.getUTCMonth()+1),e=twoDigits(b.getUTCDate());return c+'-'+d+'-'+e},time=function(e){var b=twoDigits(e.getUTCHours()),c=twoDigits(e.getUTCMinutes()),d=twoDigits(e.getUTCSeconds());return b+':'+c+':'+d},json=function(_ref){var b=_ref.req,c=_ref.res,d=_ref.start,e=_ref.now;return{'c-ip':b.ip,'cs-host':b.hostname,'cs-method':b.method,'cs-uri-stem':b.path,date:date(d),time:time(d),'time-taken':e-d}},onSuccess=function(){return function(_ref2){_ref2.data;console.info('LOGGLY: Data sent successfully')}},onFailure=function(){return function(_ref3){_ref3.data;console.error('LOGGLY: Could not send data.')}},sendToLoggly=function(b){return axios.post('https://'+config.subdomain+'.loggly.com/inputs/'+config.token+'/tag/'+config.tags+'/',b).then(onSuccess(b)).catch(onFailure(b))},now=function(){return new Date(Date.now())};module.exports=function(b,c,d){var e=now();c.on('finish',function(){sendToLoggly(json({req:b,res:c,start:e,now:now()}))}),d()};

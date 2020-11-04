const axios = require('axios')
const parseUrl = require('parseurl')

const trimTags = (tags) =>
  tags.split(',').map(a => a.trim()).join(',')

const config = {
  token: process.env.LOGGLY_TOKEN || console.error('Must provide a LOGGLY TOKEN'),
  subdomain: process.env.LOGGLY_SUBDOMAIN || 'logs-01',
  tags: trimTags(process.env.LOGGLY_TAGS || 'iis')
}

const twoDigits = (num) =>
  (num > 0 && num < 10) ? '0' + num : num

const date = (time) => {
  const year = time.getUTCFullYear()
  const month = twoDigits(time.getUTCMonth() + 1)
  const day = twoDigits(time.getUTCDate())

  return `${year}-${month}-${day}`
}

const time = (time) => {
  const hour = twoDigits(time.getUTCHours())
  const minute = twoDigits(time.getUTCMinutes())
  const second = twoDigits(time.getUTCSeconds())

  return `${hour}:${minute}:${second}`
}

const json = ({ req, res, start, now }) => ({
  'c-ip': req.ip, // Must set 'trust proxy'
  'cs-host': req.hostname,
  'cs-method': req.method,
  'cs-uri-stem': req.path,
  'cs-uri-query': parseUrl(req).query,
  'date': date(start),
  'time': time(start),
  'time-taken': now - start,
  'cs-User-Agent': req.get('User-Agent'),
  'cs-status': res.statusCode,
  'cs-Referer': req.get('Referer')
})

const onSuccess = (json) => ({ data }) => {
  // console.info('LOGGLY: Data sent successfully')
}

const onFailure = (json) => ({ data }) => {
  console.error('LOGGLY: Could not send data.')
}

const sendToLoggly = (json) =>
  axios
    .post(`https://${config.subdomain}.loggly.com/inputs/${config.token}/tag/${config.tags}/`, json)
    .then(onSuccess(json))
    .catch(onFailure(json))

const now = () => new Date(Date.now())

module.exports = (req, res, next) => {
  const start = now()

  res.on('finish', () => {
    sendToLoggly(json({ req, res, start, now: now() }))
  })

  next()
}

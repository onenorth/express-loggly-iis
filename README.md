# Express | Loggly IIS

A module that sends logging information to your Loggly instance.

### Usage

Here's how to set up Loggly IIS with your existing Express server:

1. Run: `npm install --save git://github.com/onenorth/express-loggly-iis.git#2.0.0`

1. Add `app.use(expressLogglyIIS)` __before all__ of your routes.


```js
const express = require('express')
const expressLogglyIIS = require('express-loggly-iis')

const app = express()

// !!! Important for logging IP addresses on Heroku !!!
app.set('trust proxy', true)

app.use(expressLogglyIIS)

app.get('/', (req, res) => res.send('home'))
app.get('/people', (req, res) => res.send('people'))
app.get('/services', (req, res) => res.send('services'))

app.listen(3000, () => console.info('ready on port 3000'))
```


### Configuration

To configure this with your Express instance, please use the following environment variables:


__`LOGGLY_TOKEN`__ (Required)
> Example: `12345678-1234-1234-1234-1234567890AB`

The __customer token__ generated from Loggly. Find out more about how to create a token [here](https://www.loggly.com/docs/customer-token-authentication-token/).


__`LOGGLY_TAGS`__ (Required)
> Example: `iis,onenorth`

A comma-separated list of tags you want to use for filtering logs.

Please add in your site's tag, along with `iis`.


__`LOGGLY_SUBDOMAIN`__ (Defaults to `logs-01`)
> Example: `logs-01`

The subdomain associated with Loggly (you can leave this alone).

The subdomain option is only here in case hosting decides to change their standard endpoint.

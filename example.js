const express = require('express')
const loggly = require('./index')

const app = express()

app.use(loggly)

app.get('/', (req, res) => res.send('home'))
app.get('/people', (req, res) => res.send('people'))
app.get('/services', (req, res) => res.send('services'))

app.listen(3000, () => console.info('ready on port 3000'))

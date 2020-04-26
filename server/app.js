'use strict';

/* imports */
const 
  express = require('express'),
  routes = require('./routes/index');

const app = express();

app.use('/api/', routes);

app.use(express.static(__dirname + '/public'));

module.exports = app;

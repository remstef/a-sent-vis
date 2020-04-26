'use strict';

const express = require('express');
const router = express.Router();

/* set up some testing routes */
router.get('/test', (req, res) => {
  res.send('It works!');
});

module.exports = router;

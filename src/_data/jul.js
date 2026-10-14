// Julraden, se lib/jul.js. Datumet ändras i site.json under julSista.
const site = require('./site.json');

module.exports = require('../../lib/jul.js').julrad(site.julSista) || false;

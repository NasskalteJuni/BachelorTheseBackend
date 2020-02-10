const session = require('express-session');
const config = require('../config.js').web;
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const db = require('../persistence/orm.js');
const store = new SequelizeStore({
    db,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: config.session.duration * 60 * 60 * 1000,
});

module.exports = store;
const session = require('express-session');
const config = require('../config.js').web;
const store = require('./store.js');

const sessionConfig = {
    proxy: config.behindProxy,
    secret: config.session.secret,
    name: config.session.name,
    cookie: {
        name: config.session.name,
        domain: config.domain,
        sameSite: config.session.secure ? 'Strict' : 'None', // only dev allows for cross site cookies
        httpOnly: true,
    },
    resave: false, // do only save, when the session was actually modified
    saveUninitialized: false, // do not save temporary sessions of users that are not logged in
    store
};
if(config.session.secure) sessionConfig.cookie.secure = true; // on production, only allow the cookie on secure origins (production must have tls enabled)
store.sync();
module.exports = session(sessionConfig);
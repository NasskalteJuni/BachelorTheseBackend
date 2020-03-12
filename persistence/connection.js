const mysql = require('mysql2/promise');
const config = require('../config.js');
let connection = null;
const getConnection = () => {
    if(connection === null) {
        return mysql.createConnection(config.persistence).catch(err => {
            if (err.message && err.message.indexOf('ECONNREFUSED') >= 0) console.error('DATABASE IS NOT STARTED OR INCORRECTLY CONFIGURED');
            else throw err;
        });
    } else {
        return Promise.resolve(connection);
    }
};
module.exports = getConnection;

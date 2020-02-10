const mysql = require('mysql2/promise');
const config = require('../config.js');
let connection = null;
const getConnection = () => connection === null ? mysql.createConnection(config.persistence) : Promise.resolve(connection);
module.exports = getConnection();

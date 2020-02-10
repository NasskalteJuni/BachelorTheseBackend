const config = require('../config.js');
const DB = require('sequelize');
module.exports = new DB(config.persistence.database, config.persistence.user, config.persistence.password, {dialect: 'mysql', logging: false});
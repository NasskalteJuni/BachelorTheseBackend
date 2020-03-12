const crypto = require('crypto');
const config = require('../config.js').turn || {};
const unixtime = () => parseInt(Date.now() / 1000);
const defaultSeparator = config.separator || ':';
const defaultDuration = (config.sessionDuration || 24) * 60 * 60; // hours

const createIceServerToken = function(id, secret, service='turn', duration=defaultDuration, separator=defaultSeparator){
    const expiry = unixtime() + duration;
    const temporaryUserName = expiry + separator + id;
    return {
        urls: service+':'+config.domain,
        username: temporaryUserName,
        credential: crypto.createHmac('sha1', secret).update(temporaryUserName).digest('base64')
    };
};

module.exports = createIceServerToken;
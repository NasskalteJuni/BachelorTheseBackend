const authenticated = require('../middleware/authenticated.js');
const asyncMiddleware = require('../middleware/asyncHandling.js');
const connection = require('../persistence/connection');
const router = require('express').Router();
const crypto = require('crypto');
const config = require('../config.js').turn || {};
const unixtime = () => parseInt(Date.now() / 1000);
router.use(authenticated);

router.get('/credentials', asyncMiddleware( async(req, res) => {
    const separator = config.separator || ':';
    try{
        const [rows, columns] = await connection.execute('SELECT * FROM TURN_SERVER_CREDENTIALS');
    }catch(err){
        console.error(err);
        return res.status(500).sendStatusMessage('TURN CURRENTLY NOT WORKING DUE TO AN INTERNAL PROBLEM');
    }
    const sessionDuration = (config.sessionDuration || 24) * 60 * 60;
    const expiry = unixtime + sessionDuration;
    const temporaryUserName = expiry + separator +req.session.user.id;
    const temporaryPassword = crypto.createHmac('sha1', rows[rows.length-1]).update(temporaryUserName).digest('base64');
    res.status(200).json({username: temporaryUserName, credential: temporaryPassword, urls: 'turn:'+config.domain});
}));

module.exports = router;
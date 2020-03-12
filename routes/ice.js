const authenticated = require('../middleware/authenticated.js');
const asyncMiddleware = require('../middleware/asyncHandling.js');
const connection = require('../persistence/connection');
const router = require('express').Router();
const config = require('../config.js').turn || {};
const createIceServerToken = require('../logic/IceServerTokenMaker.js');

router.use(authenticated);



router.get('/ice', asyncMiddleware( async(req, res) => {
    let rows, columns;
    try{
        const con = await connection();
        [rows, columns] = await con.execute('SELECT * FROM turn_secret');
    }catch(err){
        console.error(err);
        return res.status(500).sendStatusMessage('TURN CURRENTLY NOT WORKING DUE TO AN INTERNAL PROBLEM');
    }
    const id = req.session.user.id;
    const secret = rows[0].value;
    res.status(200).json([createIceServerToken(id, secret,'turn'), createIceServerToken(id, secret, 'stun')]);
}));

module.exports = router;
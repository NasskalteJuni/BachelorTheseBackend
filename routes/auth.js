const router = require('express').Router();
const config = require('../config.js').web;
const User = require('../logic/User.js');
const Room = require('../logic/Room.js');

router.post('/session',async (req, res) => {
    const name = req.body.name;
    const password = req.body.password;
    if(!name) return res.status(422).sendStatusMessage('MISSING NAME');
    if(!password) return res.status(422).sendStatusMessage('MISSING PASSWORD');
    await User.sync();
    const user = await User.findOne({where:{name}});
    if(!user) return res.status(403).sendStatusMessage('LOGIN FAILED');
    if(!await user.isPasswordValid(password)) return res.status(403).sendStatusMessage('LOGIN FAILED');
    await user.updateLastLogin();
    req.session.user = user;
    req.session.save(err => err ? res.status(500).sendStatusMessage('COULD NOT CREATE SESSION') : res.status(200).json({user}));
});

router.delete('/session', (req, res) => {
    if(req.session && req.session.user){
        Room.removeUserEverywhere(req.session.user);
        req.session.destroy();
        res.cookie(config.session.name, '', {expires: new Date()});
        req.session = null;
        return res.status(204).send();
    }else{
        return res.status(403).sendStatusMessage('NOT AUTHENTICATED');
    }
});


module.exports = router;
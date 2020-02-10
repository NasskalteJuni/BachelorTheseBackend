const router = require('express').Router();
const User = require('../logic/User.js');
const authenticated = require('../middleware/authenticated.js');
const permitted = require('../middleware/permitted.js');

router.get('/user/:id', authenticated, async (req, res) => {
    if(!req.params.id) return res.status(422).sendStatusMessage('MISSING ID');
    await User.sync();
    const user = User.findByPk(req.params.id);
    if(!user) return res.status(404).sendStatusMessage('NO SUCH USER');
    res.status(200).json(user.json())
});

router.post('/user/', async (req, res) => {
    const name = req.body.name;
    const password = req.body.password;
    if(!name) return res.status(422).sendStatusMessage('MISSING NAME');
    if(!password) return res.status(422).sendStatusMessage('MISSING PASSWORD');
    if(password.length < 8 || password.replace(/\s/g,'').length === 0) return res.status(422).sendStatusMessage('INVALID PASSWORD');
    await User.sync();
    if(await User.findOne({where:{name}})) return res.status(422).sendStatusMessage('NAME ALREADY TAKEN');
    await User.create({name, password});
    res.status(200).json((await User.findOne({where:{name}})).toJSON());
});

router.put('/user/:id/name', authenticated, permitted, async (req, res) => {
    if(!req.params.id) return res.status(422).sendStatusMessage('MISSING ID');
    if(!req.body.name) return res.status(422).sendStatusMessage('MISSING NAME');
    if(await User.findOne({where: {name: req.body.name}})) return res.status(422).sendStatusMessage('NAME ALREADY TAKEN');
    await User.sync();
    const user = await User.findByPk(req.params.id);
    if(!user) return res.status(404).sendStatusMessage('NO SUCH USER');
    user.name = req.body.name;
    await user.save();
    res.status(204).sendStatusMessage('NAME CHANGED');
});

router.put('/user/:id/password', authenticated, permitted, async (req, res) => {
    if(!req.params.id) return res.status(422).sendStatusMessage('MISSING ID');
    if(!req.body.newPassword) return res.status(422).sendStatusMessage('MISSING NEW PASSWORD');
    if(!req.body.oldPassword) return res.status(422).sendStatusMessage('MISSING OLD PASSWORD');
    if(req.body.newPassword.length < 8 || !req.body.newPassword.trim()) return res.status(422).sendStatusMessage('INVALID NEW PASSWORD');
    await User.sync();
    const user = await User.findByPk(req.params.id);
    if(!user) return res.status(404).sendStatusMessage('NO SUCH USER');
    if(!user.isPasswordValid(req.body.oldPassword)) return res.status(403).sendStatusMessage('INVALID OLD PASSWORD');
    await user.updatePassword(req.body.newPassword);
    res.status(204).send();
});

// using post since delete with cookies and/or body works poorly...
router.delete('/user/:id', authenticated, permitted, async (req, res) => {
    if(!req.params.id) return res.status(422).sendStatusMessage('MISSING ID');
    if(!req.body.password) return res.status(422).sendStatusMessage('MISSING PASSWORD');
    const user = await User.findByPk(req.params.id);
    if(!user) return res.status(404).sendStatusMessage('NO SUCH USER');
    if(!user.isPasswordValid(req.body.password)) return res.status(403).sendStatusMessage('INVALID PASSWORD');
    await user.destroy({force: true});
    res.status(204).send();

});


module.exports = router;
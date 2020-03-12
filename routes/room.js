const authenticated = require('../middleware/authenticated.js');
const router = require('express').Router();
const Room = require('../logic/Room.js');
router.use(authenticated);
const roomSocketMessageHandling = require('../sockets/room.js');

const injectRoom = (req, res, next) => {
    if(req.params.id) {
        const room = Room.byId(req.params.id);
        if (!room) return res.status(404).sendStatusMessage('NO SUCH ROOM');
        req.room = room;
    }else{
        return res.status(422).sendStatusMessage('MISSING ID');
    }
    next();
};

router.get('/rooms', (req, res) => {
    let rooms;
    if(req.query.password) rooms = Room.all.filter(room => room.check(req.query.password) && room.name === req.query.name);
    else rooms = Room.public.filter(room => req.query.name ? room.name === req.query.name : true);
    res.status(200).json(rooms.map(room => room.toJSON()));
});

router.get('/room/:id', injectRoom, (req, res) => {
    const room = req.room;
    if(!room.public && !room.check(req.query.password)) return res.status(401).sendStatusMessage('LOGIN FAILED');
    res.status(200).json(room.toJSON());
});

router.post('/room/', (req, res) => {
    const name = req.body.name;
    if(!name) return res.status(422).sendStatusMessage('MISSING NAME PROPERTY');
    if(Room.byName(name)) return res.status(422).sendStatusMessage('NAME ALREADY IN USE');
    const room = new Room({name, creator: req.session.user, password: req.body.password, maxMembers: req.body.maxMembers || Infinity});
    // wait for everything to be booted up, then bind handler function and respond
    room.addEventListener('ready',() => {
        res.status(200).json(room.toJSON());
        roomSocketMessageHandling(room);
    });
    // register the socket stuff for created rooms
});

router.post('/room/:id/user', injectRoom, async (req, res) => {
    const password = req.query.password || req.body.password || '';
    const room = req.room;
    if(!room.joinable) return res.status(401).sendStatusMessage('LOBBY IS FULL');
    if(!room.public && !room.check(password)) return res.status(401).sendStatusMessage('WRONG PASSWORD');
    try{
        room.join(req.session.user, password);
    }catch(err){
        return res.status(422).sendStatusMessage(err.message);
    }
    res.status(200).json(room.toJSON());
});

router.delete('/room/:id/user', injectRoom, (req, res) => {
    const room = req.room;
    const user = room.members.reduce((found, user) => user.id === req.session.user.id ? user : found, null);
    if(!user) return res.status(404).sendStatusMessage('NO SUCH USER');
    room.leave(user);
    res.status(204).send();
});

router.delete('/room/:id', injectRoom, (req, res) => {
    const room = req.room;
    if(req.session.user.id !== room.creator.id) return res.status(401).sendStatusMessage('NOT ALLOWED TO CLOSE LOBBY');
    room.close();
    res.status(204).send();
});

module.exports = router;
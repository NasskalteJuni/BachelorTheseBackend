const sockets = require('../sockets/sockets.js');
module.exports = (req, res, next) => {
    // inject the socket into the session user
    // (which may loose this again, but persisting it into the session may cause circular json structures and more problems than this way)
    if(req.session && req.session.user && req.session.user.id){
        const user = req.session.user;
        const socket = sockets.all[user.id];
        if(socket){
            user.socket = socket;
        }
    }
    next();
};
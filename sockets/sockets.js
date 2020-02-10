const Socket = require('faye-websocket');
const Signaler = require('../utils/Signaler.js');
const session = require('../session/session.js');
const all = {};

// as soon as a socket connection is opened via http upgrade handshake, add the created socket to the session user for further usage
const bind = server => server.on('upgrade', (req, sock, body) => {
    if(Socket.isWebSocket(req)){
        session(req, {}, () => {
            // on invalid session, close the connection immediately
            if (!req.session || !req.session.user) return sock.destroy();
            const user = req.session.user;
            if (user.socket) {
                if(!user.socket.close) user.socket = all[user.id];
                user.socket.close();
                delete user["socket"];
                delete all[user.id];
            }
            const signaler = new Signaler(req, sock, body);
            user.socket = signaler;
            all[user.id] = signaler;

            // on close, remove the signaler
            signaler.addEventListener('close', () => {
                delete user["socket"];
                delete all[user.id];
            });
        });
    }
});

module.exports = {
    bind,
    all
};
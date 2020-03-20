const sockets = require('./sockets.js');
const roomSocketMessageHandling = require('./user.js');

module.exports = room => {
    // public rooms are broadcasted over socket
    if(room.public){
        sockets.all().forEach(socket => socket.send({type: 'room:added', data: {name: room.name, id: room.id}, sender: '@server', receiver: '*'}));
        room.addEventListener('close', () => {
            sockets.all().forEach(socket => socket.send({type: 'room:removed', data: {name: room.name, id: room.id}, sender: '@server', receiver: '*'}));
        });
    }
    // room members receive updates of server state changes on the room
    room.addEventListener('join', user => {
        roomSocketMessageHandling(user, room);
        const others = room.members.filter(member => member.id !== user.id);
        user.socket.send({type: 'user:list', data: others.map(m => m.name), sender: '@server', receiver: '*'});
        others.forEach(member => member.socket.send({type: 'user:connected', data: user.name, sender: '@server', receiver: '*'}));
        room.sfu.Tunnel.doImport('message', {type: 'user:connected', data: user.name, sender: '@server', receiver: '@sfu'}).catch(console.error);
        room.mcu.Tunnel.doImport('message', {type: 'user:connected', data: user.name, sender: '@server', receiver: '@mcu'}).catch(console.error);
    });
    room.addEventListener('leave', user => {
        const others = room.members.filter(member => member.id !== user.id);
        others.forEach(member => member.socket.send({type: 'user:disconnected', data: user.name, sender: '@server', receiver: '*'}));
        room.sfu.Tunnel.doImport('message', {type: 'user:disconnected', data: user.name, sender: '@server', receiver: '@sfu'}).catch(console.error);
        room.mcu.Tunnel.doImport('message', {type: 'user:disconnected', data: user.name, sender: '@server', receiver: '@mcu'}).catch(console.error);
    });
    room.addEventListener('switch', (architecture) => {
        room.members.forEach(member => member.socket.send({type: 'architecture:switch', data: architecture, sender: '@server', receiver: '*'}));
        room.sfu.Tunnel.doImport('message', {type: 'architecture:switch', data: architecture, sender: '@server', receiver: '@sfu'});
        room.mcu.Tunnel.doImport('message', {type: 'architecture:switch', data: architecture, sender: '@server', receiver: '@mcu'});
        room.sfu.Tunnel.doImport('message', {type: 'user:list', data: room.members.map(m => m.name), sender: '@server', receiver: '@sfu'});
        room.mcu.Tunnel.doImport('message', {type: 'user:list', data: room.members.map(m => m.name), sender: '@server', receiver: '@mcu'});
    });
};
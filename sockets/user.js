module.exports = (user, room) => {
    // forward messages in rooms
    user.socket.addEventListener('message', e => {
        let message = e.data;
        if(typeof e.data === "string"){
            message = JSON.parse(message);
        }
        message.sender = user.name;
        if(!message.receiver || message.receiver === '*'){
            room.members.forEach(member => member.socket.send(message));
        }else if(message.receiver === '@server'){
            if(message.type === "user:list"){
                user.socket.send({type: "user:list", data: room.members.map(m => m.name).filter(m => m !== user.name), receiver: message.sender, sender: "@server"});
            }else{
                room.env.Tunnel.doImport('message', message)
                    .catch(err => user.socket.send({type: 'error', data: err, sender: '@server', receiver: user.name}));
            }
        }else if(room.members.findIndex(member => member.name === message.receiver) >= 0){
            const receiver = room.members[room.members.findIndex(member => member.name === message.receiver)];
            receiver.socket.send(message);
        }else{
            user.socket.send({type: 'user:disconnected', data: message.receiver, sender: '@server', receiver: user.name});
        }
    });
    // forward messages from the browser environment to the users
    room.env.Tunnel.onExport('message',message => {
        if(!message.receiver || message.receiver === '*'){
            room.members.forEach(member => member.socket.send(message));
        }else if(room.members.findIndex(member => member.name === message.receiver) >= 0){
            const receiver = room.members[room.members.findIndex(member => member.name === message.receiver)];
            receiver.socket.send(message);
        }else{
            room.env.Tunnel.doImport({type: 'user:disconnected', data: message.receiver, sender: '@server', receiver: '@server'});
        }
    });
}
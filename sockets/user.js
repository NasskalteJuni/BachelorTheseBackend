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
            }else if(message.type === "architecture:switch"){
                room.architecture = message.data;
            }
        }else if(message.receiver === '@mcu'){
            room.mcu.Tunnel.doImport('message', message).catch(console.error);
        }else if(message.receiver === '@sfu'){
            room.sfu.Tunnel.doImport('message', message).catch(console.error);
        }else if(room.members.findIndex(member => member.name === message.receiver) >= 0){
            const receiver = room.members[room.members.findIndex(member => member.name === message.receiver)];
            receiver.socket.send(message);
        }else{
            user.socket.send({type: 'user:disconnected', data: message.receiver, sender: '@server', receiver: user.name});
        }
    });
    // forward messages from the browser environment to the users
    ['sfu', 'mcu'].forEach((server) => {
        room[server].Tunnel.onExport('message',message => {
            message.sender = '@'+server;
            if(!message.receiver || message.receiver === '*'){
                room.members.forEach(member => member.socket.send(message));
            }else if(room.members.findIndex(member => member.name === message.receiver) >= 0){
                const receiver = room.members[room.members.findIndex(member => member.name === message.receiver)];
                receiver.socket.send(message);
            }else{
                room[server].Tunnel.doImport({type: 'user:disconnected', data: message.receiver, sender: '@server', receiver: '@'+server}).catch(console.error);
            }
        });
    });
};
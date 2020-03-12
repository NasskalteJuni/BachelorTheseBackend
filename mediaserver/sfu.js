const signaler = MediaUtilities.wrapTunnelAsSignaler(Tunnel);
window.connections = new MediaUtilities.ConnectionManager({name: '@sfu', signaler, isYielding: true, verbose: true});
connections.addEventListener('userconnected', user => {
    connections.users.forEach(u => {
        if(u !== user){
            connections.get(u).streams.forEach(stream => {
                stream.meta = user;
                connections.get(user).addMedia(stream);
            });
        }
    })
});
connections.addEventListener('userdisconnected', user => {
    if(connections.get(user)){
        connections.users.forEach(u => {
            if(u !== user){
                connections.get(u).streams.forEach(stream => connections.get(user).removeMedia(stream));
            }
        });
        connections.get(user).removeMedia();
    }
});
connections.addEventListener('trackadded', (track, user) => {
    track.contentHint = track.kind === "video" ? "motion" : "speech";
    connections.users.forEach(u => {
        if(u !== user){
            track.meta = user;
            connections.get(u).addMedia(track);
        }
    })
});
connections.addEventListener('trackremoved', (track, user) => {
    connections.users.forEach(u => {
        if(u !== user){
            connections.get(u).removeMedia(track);
        }
    })
});
signaler.addEventListener('message', message => {
    if(message.type === "architecture:switch" && message.sender === "@server"){
        if(message.data !== "sfu"){
            console.log('architecture not sfu - remove media');
            connections.users.forEach(user => {
                connections.get(user).removeMedia();
            });
        }
    }
});
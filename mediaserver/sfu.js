const signaler = MediaUtilities.wrapTunnelAsSignaler(Tunnel);
const connections = new MediaUtilities.ConnectionManager({name: '@sfu', signaler, isYielding: true, verbose: true});

let isActive = false; // if you start with this architecture, set this to true
const iceServers = [];

Tunnel.onImport('iceServers', ice => {
	console.log('iceServers changing from', iceServers, 'to', ice);
	iceServers.splice(0, iceServers.length);
	ice.forEach(s => iceServers.push(s));
});

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
        if(message.data !== "sfu" && isActive){
            console.log('architecture not sfu - remove media');
	    isActive = false;
            connections.users.forEach(user => {
                connections.get(user).removeMedia();
            });
        }else if(message.data === "sfu" && isActive){
	    console.log('architecture is sfu');
	}
    }
});
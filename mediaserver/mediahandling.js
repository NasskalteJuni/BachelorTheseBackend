const signaler = MediaUtilities.wrapTunnelAsSignaler(Tunnel);
signaler.addEventListener('message', e => console.log(e.data));
const makeID = (m, u) => u+'-'+m.id;
const peers = new MediaUtilities.ConnectionManager({name: '@server', isYielding: true, signaler, verbose: true});
const video = {};
const audio = {};
peers.addEventListener('userconnected', user => {
    video[user] = new MediaUtilities.VideoMixer({fps: 20});
    audio[user] = new MediaUtilities.AudioMixer();
    peers.get(user).addMedia(new MediaStream([video[user].outputTrack, audio[user].outputTrack]));
});
peers.addEventListener('userdisconnected', user => {
    delete video[user];
    delete audio[user];
    peers.get(user).removeMedia();
});
peers.addEventListener('trackadded', (track, u) => {
    peers.users.forEach(user => {
        if(u !== user){
            if(track.kind === 'video') video[user].addStream(new MediaStream([track]), makeID(track, u));
            if(track.kind === 'audio') audio[user].addStream(new MediaStream([track]), makeID(track, u));
        }
    })
});
peers.addEventListener('trackremoved', (track, u) => {
    peers.users.forEach(user => {
        if(u !== user){
            if(track.kind === 'video') video[user].removeStream(makeID(track, u));
            if(track.kind === 'audio') audio[user].removeStream(makeID(track, u));
        }
    });
});
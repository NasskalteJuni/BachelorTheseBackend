const Socket = require('faye-websocket');
const Listenable = require('../utils/Listenable');
const all = [];

class Signaler extends Listenable(){

    constructor() {
        super();
        this._socket = new Socket(...arguments);
        this._socket.onopen = () => all.push(this);
        this._socket.onclose = () => this._onclose();
        this._socket.onmessage = e => this.dispatchEvent('message', [{type: 'message', data: JSON.parse(e.data)}])
    }

    send(msg){
        this._socket.send(JSON.stringify(msg));
    }

    close(){
        this._socket.close();
    }

    get closed(){
        return this._socket.readyState > 1;
    }

    static get all(){
        return Object.freeze(all);
    }

    _onclose(){
        const i = all.indexOf(this);
        if(i >= 0) all.splice(i, 1);
        this.dispatchEvent('close', []);
    }

    toJSON(){
        return {state: this._socket.readyState};
    }

    toString(){
        return '[Socket]'
    }

}

module.exports = Signaler;
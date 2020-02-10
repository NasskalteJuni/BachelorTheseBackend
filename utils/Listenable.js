module.exports = (superclass=Object) => class extends superclass{

    constructor(){
        super(...arguments);
        this._listeners = {};
    }

    addEventListener(event, fn){
        event = event.toLowerCase();
        if(typeof fn !== "function") throw new Error("Argument 1 is not of type function");
        if(!(this._listeners[event] instanceof Array)) this._listeners[event] = [];
        this._listeners[event].push(fn)
    }

    removeEventListener(event, fn, all=false){
        event = event.toLowerCase();
        if(typeof fn !== "function") throw new Error("Argument 1 is not of type function");
        if(this._listeners[event] instanceof Array){
            if(all){
                this._listeners[event] = this._listeners[event].filter(listener => listener.toString() !== fn.toString());
            }else{
                const i = this._listeners[event].findIndex(listener => listener.toString() === fn.toString());
                if(i !== -1) this._listeners[event].splice(i, 1);
            }
        }
    }

    dispatchEvent(event, args=[]){
        event = event.toLowerCase();
        if(this._listeners[event] instanceof Array) this._listeners[event].forEach(fn => fn(...args));
    }
};
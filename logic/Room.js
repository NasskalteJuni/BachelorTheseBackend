const BrowserEnvironment = require('../mediaserver/BrowserEnvironment.js');
const Listenable = require('../utils/Listenable.js');
const ID = require('./ID.js');
const createIceServerToken = require('./IceServerTokenMaker.js');
const connection = require('../persistence/connection.js');
const rooms = [];


/**
 * Rooms are in memory (non-persistent) structures that have 0-n members
 * A Room with 0 members will cease to exist after a defined time, so they actually need 1-n members to stay open
 * */
class Room extends Listenable(){


    /**
     * creates a new Room object according to the given options
     * @param {Object} options Some settings and options to define rules for the room object
     * @param {string} options.name name of the room. Must be unique, will be checked for uniqueness
     * @param {string} options.creator id of the creating user
     * @param {String} [password=''] the password. If left empty, the room is public and a password is not necessary
     * @param {Number} [maxMembers=MAX_SAFE_INTEGER] the number of members allowed. Joining after reaching the limit throws an exception
     * @param {Number} [maxEmptyMinutes=0] the time that must pass before a room without members is closed down automatically
     * @param {Boolean} [consoleToStdout=false] Flag used to forward media server console logs to the process standard output
     * @param {Boolean} [stdinToEvaluate=false] Flag used to evaluate process standard input in the given media server. Must have form "[roomid] [architecture] [expression to evaluate]", without the brackets
     * @param {String} [id=random id] the id for this Room. Must be unique but is not checked for uniqueness. Better just leave it to the default value
     * @throws Error when options.name is already in use, an Error will be thrown so that a new Room with a unique name should be created
     * */
    constructor({name, creator, password='', maxMembers=Number.MAX_SAFE_INTEGER, maxEmptyMinutes=0, id=ID(), consoleToStdout=false, stdinToEvaluate=false} = {}){
        super();
        this._created = new Date();
        if(Room.byName(name)) throw new Error('NAME ALREADY IN USE');
        this._name = name;
        this._creator = creator;
        this._members = [];
        this._password = password;
        this._maxMembers = maxMembers;
        this._architecture = 'mesh';
        this._id = id;
        this._maxEmptyMinutes = maxEmptyMinutes;
        this._closingTimer = null;
        this._mcu = new BrowserEnvironment(this._id+'-mcu', {template: require.resolve('../mediaserver/template.html'), scripts: ['../public/mediautils.js', '../mediaserver/mcu.js'], globals: {iceServers:[]}}); // use a page template, alternatively, pass one or multiple scripts with scripts[paths...]
        this._sfu = new BrowserEnvironment(this._id+'-sfu', {template: require.resolve('../mediaserver/template.html'), scripts: ['../public/mediautils.js', '../mediaserver/sfu.js'], globals: {iceServers:[]}});
        this._mcu.init().then(() => this._sfu.init()).catch(err => this.dispatchEvent('error', [err]));
        this._sfu.onInitialized = () => this._configureIceTokens().then(() => this.dispatchEvent('ready')).catch(err => this.dispatchEvent('error', [err]));
        this.addEventListener('ready', () =>{
            if(consoleToStdout) this._configureOutputForwarding();
            if(stdinToEvaluate) this._configureInputForwarding();
        });
        rooms.push(this);
    }

    /**
     * automatically setup ice servers tokens in room
     * @private
     * */
    async _configureIceTokens(){
        let rows, columns;
        try{
            const con = await connection();
            [rows, columns] = await con.execute('SELECT * FROM turn_secret');
            const secret = rows[0].value;
            const mcuIceTokens = [createIceServerToken(this._id + '-mcu', secret, 'stun'), createIceServerToken(this._id + '-mcu', secret, 'turn')];
            const sfuIceTokens = [createIceServerToken(this._id + '-sfu', secret, 'stun'), createIceServerToken(this._id + '-sfu', secret, 'turn')];
            await this._sfu.Tunnel.doImport('iceServers', sfuIceTokens);
            await this._mcu.Tunnel.doImport('iceServers', mcuIceTokens);
        }catch(err){
            console.error(err);
        }finally{
            this.dispatchEvent('ready', []);
        }
    }


    /**
     * forward the console output of the media servers to the current process output
     * @private
     * */
    _configureOutputForwarding(){
        this._sfu.addEventListener('console', (type, msg) => process.stdout.write(this._id+' sfu-console-'+type+': '+msg.join(',')));
        this._mcu.addEventListener('console', (type, msg) => process.stdout.write(this._id+' mcu-console-'+type+': '+msg.join(',')));
    }

    /**
     * forward process input
     * @private
     * */
    _configureInputForwarding(){
        require('./ServerInput.js').on('line', async line => {
            line = line.trim();
            if(line.startsWith(this._id)){
                line = line.substr(this._id.length).trim();
                let evaluated;
                if(line.startsWith('mcu')){
                    line = line.substr(3).trim();
                    evaluated = await this.mcu.evaluate(line);
                }else if(line.startsWith('sfu')){
                    line = line.substr(3).trim();
                    evaluated = await this.sfu.evaluate(line);
                }else{
                    evaluated = 'No such server architecture';
                }
                process.stdout.write(evaluated+"\n");
            }
        })
    }


    /**
     * @static
     * kick the user out of any room
     * @param {Object} user the user to remove
     * */
    static removeUserEverywhere(user){
        rooms.forEach(room => {
            if(room.members.findIndex(member => member.id === user.id) >= 0){
                room.leave(user);
            }
        });
    }

    /**
     * retrieve a Room object with the given id
     * @param {String} id the Room's id
     * @return {Room|null} the Room or null of no Lobby with the given id was found
     * */
    static byId(id){
        return rooms.reduce((found, room) => room.id === id ? room : found, null);
    }

    /**
     * retrieve a Room object with the given name
     * @param {String} name the name of the Room
     * */
    static byName(name){
        return rooms.reduce((found, room) => room.name === name ? room : found, null);
    }

    /**
     * The list of rooms without password
     * @readonly
     * */
    static get public(){
        return rooms.filter(room => room.public);
    }

    /**
     * The list of all rooms
     * @readonly
     * */
    static get all(){
        return rooms;
    }

    /**
     * get the Room id
     * @readonly
     * */
    get id(){
        return this._id;
    }

    /**
     * get the browser environment used for mixing on the server
     * @readonly
     * */
    get mcu(){
        return this._mcu;
    }

    /**
     * get the browser environment used for forwarding media
     * @readonly
     * */
    get sfu(){
        return this._sfu;
    }

    /**
     * is it possible to join the Room at the current time
     * @readonly
     * */
    get joinable(){
        return this.remainingMembers > 0;
    }

    /**
     * which users are members of the Room
     * @readonly
     * */
    get members(){
        return Object.freeze(this._members.slice());
    }

    /**
     * the Date when the Room was created
     * @readonly
     * */
    get created(){
        return this._created;
    }

    /**
     * the Room name
     * @readonly
     * */
    get name(){
        return this._name;
    }

    /**
     * the user (more specific, the user id) that created the Room
     * @readonly
     * */
    get creator(){
        return this._creator;
    }

    /**
     * if the Room is public (has no password) or not
     * @readonly
     * */
    get public(){
        return !this._password.length;
    }

    /**
     * the currently used Room architecture
     * @readonly
     * */
    get architecture(){
        return this._architecture;
    }

    /**
     * set the architecture
     * @param {String} architectureToUse an architecture that is either 'mesh', 'sfu' or 'mcu'
     * */
    set architecture(architectureToUse){
        architectureToUse = architectureToUse.toLowerCase();
        if(architectureToUse !== this._architecture){
            try{
                if(architectureToUse === 'mcu') this._mcu.Tunnel.doImport('activate', [this._members.length]);
                if(architectureToUse !== 'mcu' && this._architecture === 'mcu') this._mcu.Tunnel.doImport('deactivate', []);
                if(architectureToUse === 'sfu') this._sfu.Tunnel.doImport('activate', [this._members.length]);
                if(architectureToUse !== 'sfu' && this._architecture === 'sfu') this._sfu.Tunnel.doImport('deactivate', []);
            }catch(err){this.dispatchEvent('error', [err])}
            this.dispatchEvent('switch', [architectureToUse, this._architecture]);
            this._architecture = architectureToUse;
        }
    }

    /**
     * get the number of members that can still join (can be Infinity)
     * @readonly
     * */
    get remainingMembers(){
        return this._maxMembers - this._members.length;
    }

    /**
     * stop the closing countdown
     * @private
     * */
    _stopPossibleClosingTimer(){
        if(this._closingTimer !== null){
            clearTimeout(this._closingTimer);
            this._closingTimer = null;
        }
    }

    /**
     * kick user out of other rooms
     * @private
     * */
    _leaveOtherLobbies(user){
        rooms.forEach(room => {
            if(room.members.indexOf(user) >= 0 && room.id !== this.id){
                room.leave(user);
            }
        })
    }

    /**
     * join a Room. Since every user can only be a member of 1 room at once, this includes leaving other rooms
     * @param user [User] the user / joining Room member
     * @param password [string] the password specified by that user to enter the room. Ignored if Room is public
     * @throws [Error] will fail, if the Room is full ('LOBBY FULL') or the password is necessary and wrong ('WRONG PASSWORD')
     * */
    join(user, password){
        if(!this.joinable) throw new Error('LOBBY FULL');
        if(this._password && this._password !== password) throw new Error('WRONG PASSWORD');
        if(!user.socket || user.socket.closed) throw new Error('NO SOCKET CONNECTION ('+(user.socket && user.socked.closed ? 'CLOSED' : 'MISSING')+')');
        if(this._members.findIndex(u => user.id === u.id) >= 0) throw new Error('ALREADY IN ROOM');
        this._stopPossibleClosingTimer();
        this._leaveOtherLobbies(user);
        this._members.push(user);
        this.dispatchEvent('join', [user]);
    }

    /**
     * leave a Room
     * @param user [User] the leaving Room member
     * */
    leave(user){
        const i = this._members.findIndex(p => p.id === user.id);
        if(i >= 0){
            this._members.splice(i,1);
            this.dispatchEvent('leave', [user]);
        }
        if(this._members.length === 0){
            this._closingTimer = setTimeout(() => {
                if(this._members.length === 0) this.close();
                this._stopPossibleClosingTimer();
            }, 1000 * 60 * this._maxEmptyMinutes);
        }
    }

    /**
     * check if the password matches
     * @param password [string] the password to check
     * @return boolean
     * */
    check(password){
        return password === this._password;
    }

    /**
     * close a room, making it not findable any more and removing the members of the Room object
     * */
    close(){
        this._members = [];
        const i = rooms.findIndex(l => l.id === this._id);
        rooms.splice(i,1);
        this.dispatchEvent('close', []);
        this._sfu.destroy()
            .then(() => this._mcu.destroy())
            .then(() => this.dispatchEvent('closed', []))
            .catch(console.error);
    }

    toJSON(){
        return {
            id: this._id,
            name: this._name,
            creator: {
                id: this._creator.id,
                name: this._creator.name,
            },
            public: this.public,
            architecture: this.architecture,
            joinable: this.joinable,
            maxMembers: this._maxMembers,
            members: this.members.map(m => m.name),
            created: this.created
        }
    }

    toString(){
        return '[Room: '+this.name+']';
    }

}

module.exports = Room;

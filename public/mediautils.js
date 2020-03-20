var MediaUtilities = (function (exports) {
    'use strict';

    /**
     * Intended to blend together multiple audio tracks to one single track
     * @class
     * @implements MediaConsuming
     * */
    class AudioMixer{

        /**
         * creates a new AudioMixer object
         * */
        constructor(){
            this._context = new AudioContext();
            this._out = this._context.createMediaStreamDestination();
            this._in = {};
        }

        /**
         * the mixed MediaStream
         * @readonly
         * */
        get out(){
            return this._out.stream;
        }

        /**
         * the mixed MediaStreamTrack
         * @readonly
         * */
        get outputTrack(){
            return this._out.stream.getAudioTracks()[0];
        }

        /**
         * add media into the mixing process
         * @param {MediaStream|MediaStreamTrack} m The media to mix. A given stream should contain exactly 1 audio track, a given track should be of kind audio
         * @param id [string=m.id] a unique identifier for the given media
         * */
        addMedia(m, id) {
            if(arguments.length === 1) id = m.id;
            if(m instanceof MediaStreamTrack) m = new MediaStream([m]);
            this._in[id] = this._context.createMediaStreamSource(m);
            this._rebuildGraph();
        }

        /**
         * removes media from the mixing process
         * @param {string|MediaStream|MediaStreamTrack} m The media to remove. Either a stream, a track or the identifier that was used to add the track
         * */
        removeMedia(m){
            if(arguments.length === 0) Object.keys(this._in).forEach(k => delete this._in[k]);
            if(arguments[0] instanceof MediaStream || arguments[0] instanceof MediaStreamTrack) m = arguments[0].id;
            delete this._in[m];
            this._rebuildGraph();
        }

        /**
         * @private
         * */
        _rebuildGraph(){
            const inputs = Object.values(this._in);
            if(this._merger) this._merger.disconnect();
            if(!inputs.length) return;
            this._merger = this._context.createChannelMerger(inputs.length);
            this._merger.connect(this._context.destination);
            inputs.forEach((input, i) => input.connect(this._merger, 0, i));
        }

        /**
         * stop the audio mixer and free used resources
         * */
        close(){
            this._context.close();
        }

    }

    var AudioMixer_1 = AudioMixer;

    /**
     * Define custom video mixing configurations
     * @class
     * */
    class VideoMixingConfiguration {

        /**
         * Create a new VideoMixingConfiguration with the given settings
         * @param {Object} settings
         * @param {Boolean|Function} [settings.applicable=true] Use this setting to define if the config can be used. Use a function that receives currently mixed ids to determine, if the config is usable under the given circumstances
         * @param {Array|Function} [settings.positions=[]] Define, where a stream should be rendered. A function receives the ids, index and array of mixed ids. Can be used to render a grid layout of videos. The positions can have x, y, width, height and zIndex values, either static with given values or functions that will be calculated during render
         * @param {String|Function} [settings.background='rgb(20,20,20)'] Which background to use. Can be a static value or a function which receives the ids and is evaluated while rendering
         * @param {Number|Function} [settings.priority=0] If two VideoMixingConfigurations are applicable at the same time, the one with the higher priority will be used. A function will receive the currently mixed ids, but will not be updated while rendering but only when adding another config or media
         * */
        constructor(settings) {
            this.__isVideoMixingConfigurationObject = true;
            this.width = 0;
            this.height = 0;
            this._applicable = settings.applicable || true;
            this._positions = settings.positions || [];
            this._background = settings.background || 'rgb(20,20,20)';
            this._priority = settings.priority || 0;
            this.paint = null;
        }

        /**
         * check if this function can be used under the given circumstances
         * @param {Array} ids the currently mixed ids
         * @return {Boolean}
         * */
        applicable(ids){
            if(typeof this._applicable === "function"){
                return this._applicable(ids);
            }else{
                return !!this._applicable;
            }
        }

        /**
         * check which priority this config currently
         * @param {Array} ids the currently mixed ids
         * @return {Number}
         * */
        priority(ids){
            if(this._priority === undefined){
                return 0;
            }else if(typeof this._priority === "function"){
                return this._priority(ids);
            }else{
                return +this._priority;
            }
        }

        /**
         * get a function that will return the current background value
         * @return {Function}
         * */
        background(){
            if(typeof this._background === "function"){
                return this._background;
            }else{
                return () => this._background;
            }
        }

        /**
         * get a pre-calculated position Object for the given id at the given index of the given array
         * @return {Object} an object with x,y,with and height values as assigned video sources
         * */
        positions(id, index, arr){
            if(typeof this._positions === "function"){
                // case: generating function -> let the function handle the creation of position objects
                return this._positions(id, index, arr);
            }else if(this._positions instanceof Array){
                // case: array -> return the array element at given index
                return this._positions[index];
            }else{
                // case: single object -> return a clone of the single object for every stream
                return Object.assign({}, this._positions);
            }
        }
    }

    var VideoMixingConfiguration_1 =VideoMixingConfiguration;

    /**
     * @mixin
     * Handle Video Mixing configurations
     * */
    var _VideoMixingConfigurations = (superclass=Object) => class C extends superclass{

        constructor(){
            super(...arguments);
            this._configChangeHandler = () => {};
            this._streamIds = [];
            this._configs = {};
            this._currentConfigId = null;
        }

        /**
         * set the current number of stream ids
         * @param ids [array] the ids of currently used streams. Needs to be given, since the choice of the current config depends on the number of streams
         * @returns VideoMixingConfiguration the currently used configuration after the stream ids were applied
         * */
        updateStreamIds(ids){
            this._streamIds = ids;
            this._findCurrentConfig();
            return this.currentConfig;
        }

        /**
         * @returns VideoMixingConfiguration the current config. May return null, if there is no current config (because the VideoMixingConfigurationManager was just constructed, for example)
         * */
        get currentConfig(){
            return this.currentConfigId ? this._configs[this._currentConfigId] : null;
        }

        /**
         * @returns string the id of the current config
         * */
        get currentConfigId(){
            return this._currentConfigId;
        }

        /**
         * enforce the given id as current config, independent if it is applicable or not
         * @param id [string] the id of the config to use
         * @throws Error when no config has the given id
         * */
        forceConfig(id){
            if(!this._configs[id]) throw new Error("No config with the id "+id);
            const previousConfigId = this._currentConfigId;
            this._currentConfigId = id;
            this._configChangeHandler(this._configs[id], id, previousConfigId);
        }

        /**
         * @private
         * @static
         * Checks if the given object is a VideoMixingConfiguration or just a plain object that probably should be used as configuration for this
         * @returns VideoMixingConfiguration the given VideoMixingConfiguration or, if none was given, a VideoMixingConfiguration constructed from the given object
         * */
        static _videoMixingConfigurationTypeGuard(configOrPlainObject){
            if(!configOrPlainObject.__isVideoMixingConfigurationObject && !configOrPlainObject instanceof VideoMixingConfiguration_1){
                configOrPlainObject = new VideoMixingConfiguration_1(configOrPlainObject);
            }
            return configOrPlainObject;
        }

        /**
         * adds another config under the given id
         * @param config [VideoMixingConfiguration] a VideoMixingConfiguration (or its settings object)
         * @param id [string] a unique id for the config. Non unique ids will result in unchecked overwriting of the config
         * */
        addConfig(config, id){
            this._configs[id] = C._videoMixingConfigurationTypeGuard(config);
            this._findCurrentConfig();
        }

        /**
         * remove the config with the registered id
         * @param id [string] the id of the config to remove
         * @throws Error when no config with the given id was found
         * */
        removeConfig(id){
            if(!this._configs[id]) throw new Error("No config with the id "+id);
            delete this._configs[id];
            this._findCurrentConfig();
        }

        /**
         * define a function that will be invoked when (and only when) the configuration that should be used currently changes
         * @param cb [function] a function which will retrieve the current configuration, its id, and the previous configuration
         * */
        onConfigChange(cb){
            if(typeof cb !== "function") throw new Error("Callback must be a function");
            this._configChangeHandler = cb;
        }

        /**
         * @private
         * get the config that is applicable AND has the highest priority
         * @return object of structure {id: VideoMixingConfiguration}
         * */
        _findCurrentConfig() {
            let highestApplicableId = null;
            let highestPriority = -Infinity;
            for (let id in this._configs) {
                if(!this._configs.hasOwnProperty(id)) continue;
                const currentConfig = this._configs[id];
                if (currentConfig.applicable(this._streamIds)) {
                    const currentPriority = currentConfig.priority(this._streamIds);
                    if (highestPriority < currentPriority) {
                        highestApplicableId = id;
                        highestPriority = currentPriority;
                    }
                }
            }
            const previousConfigId = this._currentConfigId;
            this._currentConfigId = highestApplicableId;
            if(previousConfigId !== this._currentConfigId) this._configChangeHandler(this.currentConfig, this._currentConfigId, previousConfigId);
        }

    };

    /**
     * Handle Video Streams
     * */
    var _VideoStreams = (superclass=Object) => class C extends superclass{

        constructor(){
            super(...arguments);
            this._streams = {};
            this._onStreamChangeHandler = () => {};
        }

        /**
         * adds a MediaStream to the managed streams
         * @param m the MediaStream object to manage
         * @param id the unique identifier used for the mediaStream (useful for removal, custom grids, etc.). Defaults to the media stream id
         * */
        addMedia(m, id){
            if(arguments.length === 1) id = m.id;
            if(m instanceof MediaStreamTrack) m = new MediaStream([m]);
            const helper = document.createElement('video');
            helper.autoplay = true;
            helper.muted = true;
            helper.srcObject = m;
            helper.style.visibility = "hidden";
            helper.style.pointerEvents = "none";
            helper.style.position = "fixed";
            helper.style.left = "0";
            helper.style.top = "0";
            helper.style.width = "1px";
            helper.style.height = "1px";
            helper.width = 1;
            helper.height = 1;
            helper.setAttribute('playsinline', '');
            helper.addEventListener('pause', () => helper.play());
            document.body.appendChild(helper);
            this._streams[id] = helper;
            this._onStreamChangeHandler(this.streamIds());
        }

        /**
         * removes a MediaStream from the mixing process
         * @param m [string|MediaStream|MediaStreamTrack] the id used to add the media stream. If the media stream was added without id, you have to pass in the stream or track that was added
         * @throws Error when there is no stream with the given id
         * */
        removeMedia(m){
            if(arguments.length === 0) return this.streamIds().forEach(id => this.removeMedia(id));
            if(m instanceof MediaStream || m instanceof MediaStreamTrack){
                const matching = this.streamIds().filter(id => this._streams[id].srcObject.id === m.id || this._streams[id].srcObject.getTracks[0].id === m.id);
                if(matching.length) m = matching[0];
            }
            delete this._streams[m];
            this._onStreamChangeHandler(this.streamIds());
        }

        /**
         * @returns array the list of current streams as their ids
         * */
        streamIds(){
            return Object.keys(this._streams);
        }

        /**
         * @returns HTMLVideoElement of the stream id
         */
        videoByStreamId(id){
            return this._streams[id];
        }

        onStreamChange(cb){
            if(typeof cb !== "function") throw new Error("Callback must be of type function");
            this._onStreamChangeHandler = cb;
        }
    };

    /**
     * Utility to mix video streams to one single video output
     * @class
     * @implements Listenable
     * @implements MediaConsuming
     * */
    class VideoMixer extends _VideoStreams(_VideoMixingConfigurations()){

        /**
         * create a new video mixer
         * @param config [object] a configuration object
         * @param config.canvas (optional) a canvas element to use for mixing MediaStreams together. Can be null (default, creates new), an element, or a query selector string like 'div.main>#canvas'
         * @param config.fps [int=30] frames per second used for mixing & sampling
         * @param config.startImmediately [boolean=true] tells the mixer to start the mixing as soon as the object is constructed (no waiting for call to .start())
         * @param config.width [int=-1] the width of a newly created canvas, -1 is used to infer the width automatically
         * @param config.height [int=-1] the height of a newly created canvas, -1 is used to infer the width automatically
         * */
        constructor({canvas = null, fps = 30, startImmediately = true, width=-1, height=-1} = {}){
            super();
            this._width = width;
            this._height = height;
            this.fps = fps;
            this._initCanvas(canvas, width, height);
            if(startImmediately) this.start();
            // tie together the video streams and the configurations.
            // changes in the streams require always position recalculation and an update to the config that sometimes changes the current config
            this.onStreamChange(ids => {
                this.updateStreamIds(ids);
                if(this.currentConfig) this._precalculatePositionsAndMatchStreams(this.currentConfig);
            });
            // when the config changes, which does not necessary be due to a change to the used streams
            // (a forceful configuration change, for example)
            // precalculate the positions
            this.onConfigChange(this._precalculatePositionsAndMatchStreams);
            this._snapshot = null;
        }

        /**
         * @private
         * */
        _precalculatePositionsAndMatchStreams(currentConfig){
            currentConfig.width = this._canvas.width;
            currentConfig.height = this._canvas.height;
            if(!currentConfig.paint){
                const ids = this.streamIds();
                currentConfig.calculatedPositions = ids.map(currentConfig.positions.bind(currentConfig));
                currentConfig.calculatedPositions.sort((a, b) => {
                    const aVal = a.id !== undefined ? 0 : a.index !== undefined ? 1 : 2;
                    const bVal = b.id !== undefined ? 0 : b.index !== undefined ? 1 : 2;
                    const diff = aVal - bVal;
                    if(diff === 0 && a.index !== undefined) return (typeof a.index === "function" ? a(ids) : a) - (typeof b.index === "function" ? b(ids) : b);
                    else return diff;
                });
                currentConfig.calculatedPositions.forEach((pos) => {
                    let id = null;
                    if(pos.id !== undefined){
                        id = typeof pos.id === "function" ? pos.id(ids) : pos.id;
                        if(!this.videoByStreamId(id)) throw new Error('no stream with id '+id);
                        pos.source = this.videoByStreamId(id);
                        pos.assignedId = id;
                    }else if(pos.index !== undefined){
                        let index = typeof pos.index === "function" ? pos.index(ids) : pos.index;
                        if(index > ids.length) throw new Error('not enough streams for index '+index);
                        id = ids[index];
                        pos.source = this.videoByStreamId(id);
                        pos.assignedId = id;
                    }else{
                        if(!ids.length) throw new Error('more position definitions than streams');
                        id = ids[0];
                        pos.source = this.videoByStreamId(id);
                        pos.assignedId = id;
                    }
                    ids.shift();
                });
            }
        }

        /**
         * set up a canvas to mix videos according to the optionally given width and height
         * @private
         * */
        _initCanvas(canvas, width, height){
            if(canvas === null) canvas = document.createElement("canvas");
            this._canvas = typeof canvas === "string" ? document.querySelector(canvas) : canvas;
            if(this._canvas){
                if(this._width !== -1){
                    canvas.width = this._width;
                    canvas.style.width = this._width + 'px';
                }else{
                    this._width = +this._canvas.style.width.replace('px','');
                }
                if(this._height !== -1){
                    canvas.height = this._height;
                    canvas.style.height = this._height + 'px';
                }else{
                    this._height = +this._canvas.style.height.replace('px','');
                }
                this._context = this._canvas.getContext("2d");
                this._context.clearRect(0,0,this._canvas.width,this._canvas.height);
                this._out = this._canvas.captureStream(this.fps);
            }
            if(!this._canvas && typeof canvas === "string") window.addEventListener('load',() => this._initCanvas(canvas, width, height));
        }


        /**
         * mixed output as a MediaStream
         * @readonly
         * */
        get out(){
            return this._out;
        }

        /**
         * mixed output as a MediaStreamTrack of kind video
         * @readonly
         * */
        get outputTrack(){
            return this._out.getVideoTracks()[0];
        }

        /**
         * the pixel width of the mixed video
         * @readonly
         * */
        get width(){
            return this._width;
        }

        /**
         * the pixel height of the mixed video
         * @readonly
         * */
        get height(){
            return this._height;
        }


        /**
         * can be used to start the mixing process, use this if the option startImmediately was set to false
         * */
        start(){
            this._paintloop = setInterval(this._draw.bind(this), 1000 / this.fps);
        }

        /**
         * stops the video mixing process
         * */
        stop(){
            clearInterval(this._paintloop);
            this._context.clearRect(0,0,this._canvas.width,this._canvas.height);
        }

        /**
         * debug function. allows you to see the calculated values and used configs
         * @ignore
         * */
        snapshot(fn){
            this._snapshot = fn;
        }

        /**
         * draw the current streams on according to the current config in use on a canvas
         * @private
         * */
        _draw(){
            if(!this.currentConfig) return;
            const ids = this.streamIds();
            if(this.currentConfig.paint){
                // let the custom paint function handle it
                this.currentConfig.paint(ids, this._canvas, this._context);
            }else{
                const snapshot = {background: null, mixed: []};
                this._context.clearRect(0,0,this._width,this._height);
                const background = this.currentConfig.background()(ids);
                this._context.fillStyle = background;
                snapshot.background = background;
                this._context.fillRect(0,0,this._width, this._height);
                // check if you have to resolve position functions
                const resolveFn = (v, s) => typeof v === "function" ? v(s) : v;
                this.currentConfig.calculatedPositions
                    // sort according to z-Index
                    .sort((a , b) => {
                        if(a.zIndex !== undefined && b.zIndex !== undefined){
                            return (typeof a.zIndex === "function" ? a.zIndex({id: a.assignedId}) : a.zIndex) - (typeof b.zIndex === "function" ? b.zIndex({id: b.assignedId}) : b.zIndex);
                        }
                        else if(a.zIndex !== undefined) return 1;
                        else return -1
                    })
                    // draw each frame
                    .forEach((pos, drawIndex) => {
                        const stats = {width: this.width, height: this.height, id: pos.assignedId, drawIndex};
                        if(pos.source){
                            const x = resolveFn(pos.x, stats);
                            const y = resolveFn(pos.y, stats);
                            const width = resolveFn(pos.width, stats);
                            const height = resolveFn(pos.height, stats);
                            this._context.drawImage(pos.source, x, y, width, height);
                            snapshot.mixed.push({id: pos.assignedId, drawIndex, x, y, width, height});
                        }
                    });
                // optionally take a snapshot
                if(this._snapshot){
                    this._snapshot(snapshot);
                    this._snapshot = null;
                }
            }
        }

    }

    var VideoMixer_1 = VideoMixer;

    /**
     * Allows recording media to a file
     * @class
     * */
    class Recorder{

        /**
         * @param {MediaStream|MediaStreamTrack} m The media to record
         * @param {Object} [settings]
         * @param {Boolean} [audioOnly=false] If the recorder should only record audio or also video.
         * @param {Boolean} [startImmediately=true] If the recording process should start immediately or only after start was called
         * @param {String} [fileExtension] the file extension to use
         * */
        constructor(m, {audioOnly = false, startImmediately = true, fileExtension = null} = {}){
            this._fileExtension = fileExtension;
            this._recorder = new MediaRecorder(m);
            this._data = [];
            this.maxRetrievalTime = 5000;
            if(startImmediately) this._recorder.start();
            else this.start = () => this._recorder.start();
        }

        /**
         * creates a unique file name for the recording, including a fitting file extension
         * @private
         * */
        _createFileName(){
            const name = "recording";
            const date = new Date().toISOString();
            const extension = this._fileExtension || (this._recorder.mimeType.startsWith('audio') ? '.ogg' : '.mp4');
            return date + '_' + name + extension;
        }

        /**
         * write the already recorded data into a file
         * @return {Promise} resolves with a file object or rejects with an error
         * */
        toFile(){
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => clearTimeout(timeout) || reject(new Error('Retrieving data took to long')), this.maxRetrievalTime);
                this._recorder.ondataavailable = e => {
                    if(e.data.size === 0) reject(new Error('Empty Recorder or cannot access recorded data at the moment'));
                    this._data.push(e.data);
                    const blob = new Blob(this._data, this._recorder.mimeType);
                    resolve(new File([blob], this._createFileName()));
                };
                this._recorder.onerror = err => reject(err);
                this._recorder.requestData();
            });
        }

    }

    var Recorder_1 = Recorder;

    /**
     * @interface Listenable
     * @description defines a set of functions to listen for events, similar to the EventTarget Interface commonly used in the front end
     * */
    const Listenable = (superclass=Object) => class extends superclass{

        /**
         * passes all given arguments to the super class (default: Object) constructor
         * */
        constructor(){
            super(...arguments);
            this._listeners = {};
        }

        /**
         * @callback EventHandlerFunction
         * @param {...*} any arguments passed by the triggering instance
         * */
        /**
         * add a callback that is triggered when the given event occurs
         * @param {string} event The event name to listen for
         * @param {EventHandlerFunction} fn The function to trigger when the event occurs. The function does not receive an event but relevant values!
         * @function
         * @name Listenable#addEventListener
         * */
        addEventListener(event, fn){
            event = event.toLowerCase();
            if(typeof fn !== "function") throw new Error("Argument 1 is not of type function");
            if(!(this._listeners[event] instanceof Array)) this._listeners[event] = [];
            this._listeners[event].push(fn);
        }

        /**
         * stop triggering a registered function / unregister a formerly given callback
         * @param {string} event The event name to listen for
         * @param {EventHandlerFunction} fn The registered function
         * @function
         * @name Listenable#removeEventListener
         * */
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

        /***
         * trigger all event handlers with the given event name
         * @param {string} event the event name (and NOT AN EVENT OBJECT!) to trigger
         * @param {Array} [args=[]] an array of arguments to pass to the event listener functions
         * @function
         * @name Listenable#dispatchEvent
         * */
        dispatchEvent(event, args=[]){
            event = event.toLowerCase();
            if(this._listeners[event] instanceof Array) this._listeners[event].forEach(fn => fn(...args));
        }
    };

    var Listenable_1 = Listenable;

    const ID = () => new Date().getTime().toString(32) + Math.random().toString(32).substr(2,7);

    /**
     * Introduces an abstraction layer around the RTCPeerConnection.
     * It uses a predefined signalling mechanism, handles common problems (short-time state errors, race-conditions) and
     * comfort functions (like accepting media-streams and transforming them into tracks or transceivers)
     * @class
     * @implements MediaConsuming
     * @implements Listenable
     * */
    class Connection extends Listenable_1() {

        /**
         * Create a new connection object which connects 2 users
         * @param config
         * @param {string} [config.id=(autogenerated alphanumeric string)] Any sort of unique identifier, defaults to a random alphanumeric string
         * @param {string} config.peer The name or id of the other endpoint of this connection
         * @param {string} config.name The name of the user that is on this endpoint of the connection
         * @param {Signaler} config.signaler The signaling connection to use
         * @param {Array} [config.iceServers=[]] List of ice servers to use to establish the connection in the common RTCIceServers-format
         * @param {boolean} [config.useUnifiedPlan=true] Strongly recommended to not set this to false, Plan B semantic is deprecated and will not work with every funciton
         * @param {boolean} [config.isYielding] Defines if this end of the connection shall ignore and roll back session descriptions in favour to the other side. If omitted, a tiebraker is used to resolve conflicts, if set, you have to make sure that the other side has this set to the opposite value.
         * @param {boolean} [config.verbose=false] set to true to log the steps in the signalling and media handling process
         * @param {console} [config.logger=console] Logger to be used. Must implement the methods .log and .error. Defaults to console
         * */
        constructor({id = ID(), peer = null, name = null, signaler, iceServers = [], useUnifiedPlan = true, isYielding = undefined, verbose = false, logger=console} = {}) {
            super();
            this._signaler = signaler;
            this._connectionConfig = {iceServers, sdpSemantics: useUnifiedPlan ? 'unified-plan' : 'plan-b'};
            this._id = id;
            this._peer = peer;
            this._name = name || this._id;
            this._signaler.addEventListener('message', msg => this._handleSignallingMessage(msg));
            this._verbose = verbose;
            this._isYielding = isYielding === undefined ? (this._name ? this._name.localeCompare(this._peer) > 0 : false) : isYielding;
            this._offering = false;
            this._receivedStreams = [];
            this._receivedTracks = [];
            this._addedTracks = [];
            this._logger = logger;
            this._metaCache = {};
            this._unboundTransceivers = [];
            this._setupPeerConnection();
        }

        /**
         * the id of the connection
         * @readonly
         * */
        get id() {
            return this._id;
        }

        /**
         * the peer id which is the other endpoint of the connection
         * @readonly
         * */
        get peer() {
            return this._peer;
        }

        /**
         * property if logging is enabled
         * */
        get verbose() {
            return this._verbose;
        }
        set verbose(makeVerbose) {
            this._verbose = !!makeVerbose;
        }

        /**
         * Initiate all objects by registering the necessary event listeners
         * @private
         */
        _setupPeerConnection() {
            this._connection = new RTCPeerConnection(this._connectionConfig);
            this._connection.addEventListener('icecandidate', e => this._forwardIceCandidate(e.candidate));
            this._connection.addEventListener('negotiationneeded', () => this._startHandshake());
            this._connection.addEventListener('iceconnectionstatechange', () => this._handleIceChange());
            this._connection.addEventListener('signalingstatechange', () => this._restartJammedConnectionAttempts());
            this._connection.addEventListener('track', ({track, streams}) => this._handleIncomingTrack(track, streams));
            this._connection.addEventListener('signalingstatechange', () => this._syncNewTransceivers());
            if (this._verbose) this._logger.log('created new peer connection (' + this._id + ') using ' + (this._connectionConfig.sdpSemantics === 'unified-plan' ? 'the standard' : 'deprecated chrome plan b') + ' sdp semantics');
        }

        /**
         * event handler that adds a newly received track to the list of received tracks, if it does not exist already.
         * Also checks, if a new Stream was added with the given track and adds this one, if necessary
         * @private
         * */
        _handleIncomingTrack(track, streams) {
            const newStreams = [];
            // handle chrome bug 835767 (remote audio not working with web audio api if not instantiated as element)
            if(track.kind === "audio"){
                const bugfix = document.createElement('audio');
                bugfix.muted = true;
                bugfix.autoplay = true;
                bugfix.srcObject = new MediaStream([track]);
            }
            const matches = this._connection.getTransceivers().filter(tr => tr.receiver.track && tr.receiver.track.id === track.id);
            const mid = matches.length > 0 ? matches[0].mid : null;
            if(this._metaCache[mid]){
                track.meta =  this._metaCache[mid];
                delete this._metaCache[mid];
            }
            this.dispatchEvent('trackadded', [track, mid]);
            streams.forEach(stream => {
                if (this._receivedStreams.findIndex(s => s.id === stream.id) === -1) {
                    this._receivedStreams.push(stream);
                    newStreams.push(stream);
                    this.dispatchEvent('streamadded', [stream, track, mid]);
                }
            });
            this._receivedTracks.push(track);
            this.dispatchEvent('mediachanged', [{change: 'added', track, streams, peer: this._peer}]);
            track.addEventListener('ended', () => {
                this._receivedTracks = this._receivedTracks.filter(t => t.id !== track.id);
                this.dispatchEvent('mediachanged', [{change: 'removed', track, peer: this._peer, mid}]);
                this.dispatchEvent('trackremoved', [track, mid]);
                streams.forEach(stream => {
                    if (!stream.active) {
                        this._receivedStreams = this._receivedStreams.filter(s => s.id !== stream.id);
                        this.dispatchEvent('streamremoved', [stream, track, mid]);
                    }
                });
            });
            this.dispatchEvent('mediachanged', [{change: 'added', track, streams, newStreams, peer: this._peer, mid}]);
        }

        /**
         * sends generated ice candidates to the other peer
         * @private
         * */
        _forwardIceCandidate(candidate) {
            if (candidate !== null) {
                this._signaler.send({
                    receiver: this._peer,
                    data: candidate,
                    type: 'ice'
                });
            }
        }

        /**
         * handles incoming signalling messages
         * @private
         * */
        async _handleSignallingMessage(msg) {
            // when someone else sent the message, it is obviously of none interest to the connection between the peer and us
            if(msg.sender !== this._peer) return;
            const type = msg.type.toLowerCase();
            if(type === 'sdp'){
                await this._handleSdp(msg.data);
            }else if(type === 'ice'){
                await this._handleRemoteIceCandidate(msg.data);
            }else if(type === 'connection:close'){
                await this._handleClosingConnection();
            }else if(type === 'receiver:stop'){
                await this._stopReceiver(msg.data);
            }else if(type === 'track:meta'){
                this._changeMetaOfTrack(msg.data.mid, msg.data.meta);
            }else{
                if(this._verbose) this._logger.log('could not find handle for msg type',type,msg);
            }
        }


        /**
         * starts an attempt to establish a new peer connection to the other endpoint
         * @private
         * */
        async _startHandshake(){
            try{
                if(this._verbose) this._logger.log('negotiation is needed');
                this._offering = true;
                const offer = await this._connection.createOffer();
                if(this._connection.signalingState !== "stable") return;
                if (this._verbose) this._logger.log('set local description on connection ' + this._id + ':', this._connection.localDescription);
                await this._connection.setLocalDescription(offer);
                const msg = {
                    receiver: this._peer,
                    data: offer,
                    type: 'sdp',
                };
                this._signaler.send(msg);
            }catch(err){
                this._logger.error(err);
            }finally{
                this._offering = false;
            }
        }

        /**
         * add incoming ice candidates
         * @private
         * */
        async _handleRemoteIceCandidate(candidate) {
            if (candidate !== null){
                try{
                    await this._connection.addIceCandidate(candidate);
                }catch(err){
                    if(!this._ignoredOffer) throw err;
                }
            }
        }

        /**
         * handles incoming sdp messages by either setting or ignoring them (in case of a glare situation where this endpoint waits for the other sites answer)
         * @private
         * */
        async _handleSdp(description){
            if(this._verbose) this._logger.log('received sdp', description);
            try {
                const collision = this._connection.signalingState !== "stable" || this._offering;
                if(collision && this._verbose) this._logger.log("collision");
                if ((this._ignoredOffer = !this._isYielding && description.type === "offer" && collision)) {
                    if(this._verbose) this._logger.log(this._id+' for '+this._peer+' ignored offer due to glare');
                    return;
                } else if (collision && description.type === "offer"){
                    if(this._verbose) this._logger.log(this._id+' for '+this._peer+' handles glare by yielding');
                    await Promise.all([
                        this._connection.setLocalDescription({type: "rollback"}),
                        this._connection.setRemoteDescription(description)
                    ]);
                }else{
                    await this._connection.setRemoteDescription(description);
                }
                if (description.type === "offer") {
                    await this._connection.setLocalDescription(await this._connection.createAnswer());
                    this._signaler.send({type: 'sdp', receiver: this._peer, data: this._connection.localDescription});
                }
            } catch (err) {
                this._logger.error(err);
            }
        }

        /**
         * @private
         * */
        _syncNewTransceivers(){
            const boundTransceivers = [];
            if(this._connection.signalingState === "stable"){
                this._unboundTransceivers.forEach((transceiver, index) => {
                    if(transceiver.mid !== null){
                        const binding = this._connection.getTransceivers().filter(tr => tr === transceiver);
                        if(binding.length){
                            const bound = binding[0];
                            boundTransceivers.push(bound);
                            if(bound.sender.track && bound.sender.track.meta) this._signaler.send({type: "track:meta", data: {mid: bound.mid, meta: bound.sender.track.meta}, receiver: this._peer});
                        }
                    }
                });
            }
            this._unboundTransceivers = this._unboundTransceivers.filter(tr => boundTransceivers.indexOf(tr) === -1);
        }

        /**
         * adds a media track to the connection, but with more options than addTrack, since transceiver based
         * @param {MediaStreamTrack|MediaStreamTrackKind} track what kind of media should be added
         * @param {Array|RTCTransceiverConfig} streams allows passing either the array of streams associated with this track or a config object
         * @private
         * */
        _addTrackToConnection(track, streams = []) {
            this._addedTracks.push(track);
            if (this._verbose) this._logger.log('add track to connection ' + this._id, track);
            const config = {
                direction: "sendonly",
                streams
            };
            this._unboundTransceivers.push(this._connection.addTransceiver(track, streams instanceof Array ? config : streams));
        }

        /**
         * remove a transceiver for a track to a connection
         * Does not handle invalid or any kind of input, only the specified
         * track [MediaStreamTrack|string] the track or trackKind (a string equal to "video", "audio" or "*", case sensitive)
         * @private
         * */
        _removeTrackFromConnection(track) {
            let removed = 0;
            const searchingTrackKind = typeof track === "string";
            const searchingActualTrack = track instanceof MediaStreamTrack;
            if(searchingActualTrack) this._addedTracks = this._addedTracks.filter(tr => tr.id !== track.id);
            else this._addedTracks = this._addedTracks.filter(tr => track !== '*' && tr.kind !== track);
            this._connection.getTransceivers().forEach(transceiver => {
                // we obviously only remove our own tracks, therefore searching 'recvonly'-transceivers makes no sense
                if (transceiver.direction === "sendrecv" || transceiver.direction === "sendonly") {
                    const tr = transceiver.sender.track;
                    if (tr && (searchingActualTrack && tr.id === track.id) || (searchingTrackKind && (tr.kind === track || track === '*'))) {
                        // mute the given track, removing its content
                        this._connection.removeTrack(transceiver.sender);
                        if (transceiver.direction === "sendrecv") transceiver.direction = "recvonly";
                        else transceiver.direction = "inactive";
                        this._signaler.send({
                            receiver: this._peer,
                            type: 'receiver:stop',
                            data: transceiver.mid,
                        });
                        removed++;
                    }
                }
            });
            if (this._verbose) this._logger.log('removed ' + removed + ' tracks from connection ' + this._id);
        }

        /**
         * handles the missing stop call to transceivers in chrome by stopping the track on the remote side instead.
         * This method is called on the remote side
         * @private
         * */
        _stopReceiver(mid){
            this._connection.getTransceivers().filter(tr => tr.mid === mid).forEach(tr => {
                const track = tr.receiver.track;
                if(track){
                    track.stop();
                    // we have to stop the track, since Chrome misses the transceiver.stop() implementation,
                    // but calling stop will not fire the ended event, so we have to fire it instead...
                    track.dispatchEvent(new Event('ended'));
                }
            });
        }

        /**
         * changes additional info of a received track, if it does not find the track or something else is wrong, this method fails silently.
         * @private
         * */
        _changeMetaOfTrack(mid, meta){
            if(this._verbose) console.log('meta of track bound to transceiver '+mid+' will change to '+meta);
            const matches = this._connection.getTransceivers().filter(tr => tr.mid === mid);
            if(matches.length && matches[0].receiver.track){
                const track = matches[0].receiver.track;
                track.meta = meta;
                track.dispatchEvent(new Event('metachanged', [meta]));
            }else{
                this._metaCache[mid] = meta;
            }
        }

        /**
         * replaces a track or every track of a matching type with the given replacement track
         * @private
         * */
        _replaceTrack(searchTrack, replacementTrack) {
            const searchingActualTrack = searchTrack instanceof MediaStreamTrack;
            const searchingTrackKind = typeof searchTrack === "string" && (searchTrack === "audio" || searchTrack === "video" || searchTrack === '*');
            const i = this._addedTracks.findIndex(tr => (searchingActualTrack && tr.id === searchTrack.id) || (searchingTrackKind && (tr.kind === searchTrack || searchTrack === '*')));
            if(i !== -1) this._addedTracks[i] = replacementTrack;
            this._connection.getTransceivers().forEach(transceiver => {
                // again, we only replace our own tracks, no need to look at 'recvonly'-transceivers
                if (transceiver.direction === "sendrecv" || transceiver.direction === "sendonly") {
                    if (transceiver.sender.track && (searchingActualTrack && transceiver.sender.track.id === searchTrack.id) || (searchingTrackKind && transceiver.sender.track.kind === searchTrack)) {
                        transceiver.sender.replaceTrack(replacementTrack);
                        if(replacementTrack instanceof MediaStreamTrack) this._signaler.send({type: "track:meta", data: {mid: transceiver.mid, meta: track.meta || ""}, receiver: this._peer});
                    }
                }
            });
        }

        /**
         * mutes a given track or all tracks of the matching kind
         * @param track [MediaStreamTrack|MediaStreamTrackKind|'*']
         * @param muted [boolean=true] if set to false, this method unmutes a previously muted track
         * @private
         * */
        _muteTrack(track, muted=true){
            const searchingActualTrack = track instanceof MediaStreamTrack;
            const searchingTrackKind = typeof track === "string" && (['audio', 'video', '*'].indexOf(track) >= 0);
            this._connection.getTransceivers().forEach(transceiver => {
                if(muted ? transceiver.sender.track : transceiver.sender._muted){
                    const trackAndNotMuted = () => (searchingActualTrack && transceiver.sender.track.id === track.id) || (searchingTrackKind && (track === '*' || transceiver.sender.track.kind === track));
                    const trackAndMuted = () => (searchingActualTrack && transceiver.sender._muted.id === track.id) || (searchingTrackKind && (track === '*' || transceiver.sender._muted.kind === track));
                    if(muted ? trackAndNotMuted() : trackAndMuted()){
                        if(muted){
                            if(!transceiver.sender._muted){
                                transceiver.sender._muted = transceiver.sender.track;
                                transceiver.sender.replaceTrack(null);
                            }
                        }else{
                            if(transceiver.sender._muted){
                                transceiver.sender.replaceTrack(transceiver.sender._muted);
                                delete transceiver.sender['_muted'];
                            }
                        }
                    }
                }
            });
        }

        /**
         * reacts to ice state changes. this is either used to detect disconnection or ice gathering problems and react accordingly
         * (by setting the state to closed or restart the ice process)
         * @private
         * */
        _handleIceChange() {
            // if the other side is away, close down the connection
            if (this._connection.iceConnectionState === "disconnected"){
                this._connection.close();
                this.dispatchEvent('close', []);
            }
            // if the connection failed, restart the ice gathering process according to the spec, will lead to negotiationneeded event
            if(this._connection.iceConnectionState === "failed"){
                this._connection.restartIce();
            }
        }

        _restartJammedConnectionAttempts(){
            const removeConnectionAttemptTimeout = () => {
                if(this._connectingAttemptTimeout !== undefined) clearTimeout(this._connectingAttemptTimeout);
                this._connectingAttemptTimeout = undefined;
            };
            if(this._connection.signalingState === "have-local-offer"){
                this._connectingAttemptTimeout = setTimeout(async () => {
                    if(this._verbose) this._logger.log('connection exceeded time to connect and is assumed to be jammed, restarting ice gathering...');
                    removeConnectionAttemptTimeout();
                    // if still stuck without no answer, rollback and renegotiate
                    if(this._connection.signalingState === "have-local-offer") await this._connection.setLocalDescription({type: "rollback"});
                    this._connection.restartIce();
                    this._connection.dispatchEvent(new Event('negotiationneeded'));
                }, 3000 + Math.random()*2000);
            }else{
                removeConnectionAttemptTimeout();
            }
        }

        /**
         * add media to the connection
         * @param {MediaStreamTrack|string} trackOrKind A track or its kind
         * @param {Array|RTCRtpTransceiverInit} streamsOrTransceiverConfig The streams that the given track belongs to or a config object for the transceiver to use
         * */
        /**
         * add media to the connection
         * @param {MediaStream|MediaStreamTrack|MediaStreamConstraints} media A MediaStream, which tracks will be added, a single MediaStreamTrack, which will be added or the MediaStreamConstraints, which will be used to retrieve the local MediaStreamTracks
         * */
        async addMedia(media) {
            if (arguments.length === 2) {
                this._addTrackToConnection(arguments[0], arguments[1]);
            } else {
                if (media instanceof MediaStream) {
                    media.getTracks().forEach(track => {
                        if(media.meta) track.meta = media.meta;
                        this._addTrackToConnection(track, [media]);
                    });
                } else if (media instanceof MediaStreamTrack) {
                    this._addTrackToConnection(media, [new MediaStream([media])]);
                } else if (typeof media === "string" && ["audio", "video", "*"].indexOf(media) >= 0) {
                    this._addTrackToConnection(media, [new MediaStream([])]);
                } else {
                    this._logger.error('unknown media type', typeof media, media);
                }
            }
        }

        /**
         * removes the given media from the connection
         * @param {MediaStream|MediaStreamTrack|MediaStreamTrackOrKind} [media]
         * allows to remove all media from the given stream or stream description ("audio" removing all tracks of kind audio, no argument or '*' removing all media)
         * */
        removeMedia(media) {
            if (media instanceof MediaStream) {
                media.getTracks().forEach(track => this._removeTrackFromConnection(track));
            } else if ((media instanceof MediaStreamTrack) || (typeof media === "string" && ["audio", "video", "*"].indexOf(media) >= 0)) {
                this._removeTrackFromConnection(media);
            } else if(typeof media === undefined || arguments.length === 0 || (typeof media === "string" && media === "*")){
                this._removeTrackFromConnection("*");
            } else {
                this._logger.error('unknown media type', typeof media, media);
            }
        }

        /**
         * mute the given media
         * @param {String|MediaStream|MediaStreamTrack} media The media or media kind to mute
         * @param {Boolean} [mute=true] Flag to define if you want to mute or unmute media
         * */
        muteMedia(media, mute=true){
            if(media instanceof MediaStream) {
                media.getTracks().forEach(track => this._muteTrack(track, mute));
            } else if ((media instanceof MediaStreamTrack) || (typeof media === "string" && ["audio", "video", "*"].indexOf(media) >= 0)) {
                this._muteTrack(media, mute);
            } else if(typeof media === undefined || arguments.length === 0 || (typeof media === "string" && media === "*")){
                this._muteTrack("*", mute);
            } else {
                this._logger.error('unknown media type', typeof media, media);
            }
        }

        /**
         * All received tracks of the given connection
         * @readonly
         * */
        get tracks() {
            return this._receivedTracks;
        }

        /**
         * All active received streams of the given connection
         * @readonly
         * */
        get streams() {
            return this._receivedStreams.filter(stream => stream.active);
        }

        /**
         * all locally added tracks of the given connection
         * @readonly
         * */
        get addedTracks(){
            return this._addedTracks;
        }

        /**
         * handles the command of the remote side to shut down the connection
         * @private
         * */
        _handleClosingConnection() {
            if(this._verbose) this._logger.log('connection closing down');
            this._receivedTracks.forEach(track => {
                track.stop();
                track.dispatchEvent(new Event('ended'));
            });
            this._connection.close();
            this.dispatchEvent('close');
        }

        /**
         * close the connection
         * */
        close() {
            const msg = {
                receiver: this._peer,
                data: 'immediately',
                type: 'connection:close'
            };
            this._signaler.send(msg);
            this._connection.close();
            this.dispatchEvent('close');
        }

        /**
         * Is the connection closed or still open
         * @readonly
         * */
        get closed() {
            return this._connection.connectionState === "closed" || this._connection.signalingState === "closed";
        }


        /**
         * get a report of the inbound and outbound byte and packet transmission rate as also the packet-loss for this peer connection as an Object
         * @param {Number} [watchTime=1000] the time to gather the data transmission rates in milliseconds. Defaults to 1 Second, ergo 1000 ms.
         * @return Promise resolves with an performance report Object containing inbound and outbound dictionaries with the keys bytes, packets and packetLoss
         * */
        async getReport(watchTime = 1000){
            const getRelevantValues = statValueDict => {
                const val = {inbound: {bytes: 0, packets: 0, packetLoss: 0}, outbound: {bytes: 0, packets: 0, packetLoss: 0}, timestamp: 0};
                for(let stat of statValueDict){
                    if(stat.type === 'inbound-rtp'){
                        val.inbound.bytes += stat.bytesReceived;
                        val.inbound.packets += stat.packetsReceived;
                        val.inbound.packetLoss += stat.packetsLost;
                    }else if(stat.type === 'outbound-rtp'){
                        val.outbound.bytes += stat.bytesSent;
                        val.outbound.packets += stat.packetsSent;
                    }else if(stat.type === 'remote-inbound-rtp'){
                        val.outbound.packetLoss += stat.packetsLost;
                    }else if(stat.type === 'peer-connection'){
                        val.timestamp = stat.timestamp;
                    }
                }
                return val;
            };
            return new Promise(async(resolve, reject) => {
                try{
                    const statsAtStart = (await this._connection.getStats()).values();
                    setTimeout(async () => {
                        const statsAtEnd = (await this._connection.getStats()).values();
                        const valuesAtStart = getRelevantValues(statsAtStart);
                        const valuesAtEnd = getRelevantValues(statsAtEnd);
                        const duration = valuesAtEnd.timestamp - valuesAtStart.timestamp;
                        resolve({
                            inbound: {
                                bytes: valuesAtEnd.inbound.bytes-valuesAtStart.inbound.bytes,
                                packets: valuesAtEnd.inbound.packets-valuesAtStart.inbound.packets,
                                packetLoss: valuesAtEnd.inbound.packetLoss-valuesAtStart.inbound.packetLoss,
                                tracks: this._connection.getTransceivers().filter(tr => tr.currentDirection !== "inactive" && (tr.direction === "sendrecv" || tr.direction === "recvonly") && tr.receiver.track && tr.receiver.track.readyState === "live").length
                            },
                            outbound: {
                                bytes: valuesAtEnd.outbound.bytes-valuesAtStart.outbound.bytes,
                                packets: valuesAtEnd.outbound.packets-valuesAtStart.outbound.packets,
                                packetLoss: valuesAtEnd.outbound.packetLoss-valuesAtStart.outbound.packetLoss,
                                tracks: this._connection.getTransceivers().filter(tr => tr.currentDirection !== "inactive" && (tr.direction === "sendrecv" || tr.direction === "sendonly") && tr.sender.track && tr.sender.track.readyState === "live").length
                            },
                            duration,
                        });
                    }, watchTime);
                }catch(err){
                    reject(err);
                }
            });
        }

    }

    var ConnectionWithRollback = Connection;

    /**
     * Allows to manage a set of Connection {@link Connection}
     * @class ConnectionManager
     * @implements Listenable
     * @implements MediaConsuming
     * */
    class ConnectionManager extends Listenable_1(){

        /**
         * create a new peer connection manager who handles everything related to transmitting media via RTCPeerConnections
         * @param {Object} config
         * @param {string} config.name The name or identifier of this peer
         * @param {Signaler} signaler The Signaler to transmit messages to the server
         * @param {Array} [iceServers=[]] An array of ice servers to use, in the common RTCIceServers-format
         * @param {boolean} [useUnifiedPlan=true] Use of standard sdp. Set to false, Plan-B semantics are used but are not guaranteed to work on the given browser, therefore this is discouraged
         * @param {boolean} [verbose=false] Any action or step in the connection process can be logged, if this flag is set to true
         * @param {console} [logger=console] A logger that must offer the methods .log or .error. Only used in verbose mode, defaults to console
         * */
        constructor({name, signaler, iceServers = [], useUnifiedPlan = true, verbose = false, logger = console, isYielding = undefined} = {}){
            super();
            this._signaler = signaler;
            this._verbose = verbose;
            this._logger = logger;
            this.connections = {};
            this.localMediaStreams = [];
            this._signaler.addEventListener('message', msg => {
                switch(msg.type){
                    case "user:connected":
                        if(this._verbose) this._logger.log('new user connected', msg.data);
                        this.connections[msg.data] = new ConnectionWithRollback({peer: msg.data, name, iceServers, signaler: this._signaler, useUnifiedPlan, isYielding, verbose, logger});
                        this.dispatchEvent('userconnected', [msg.data]);
                        this._forwardEvents(this.connections[msg.data]);
                        this.localMediaStreams.forEach(stream => this.connections[msg.data].addMedia(stream));
                        this.connections[msg.data].addEventListener('close', () => delete this.connections[msg.data]);
                        break;
                    case "user:disconnected":
                        if(this._verbose) this._logger.log('user disconnected', msg.data);
                        delete this.connections[msg.data];
                        this.dispatchEvent('userdisconnected', [msg.data]);
                        break;
                    case "user:list":
                        if(this._verbose) this._logger.log('list of users received', msg.data);
                        msg.data.filter(u => !this.connections[u]).forEach(u => {
                            this.connections[u] = new ConnectionWithRollback({peer: u, name, iceServers, signaler: this._signaler, useUnifiedPlan, isYielding, verbose});
                            if(this._verbose) this._logger.log('new user (of list) connected', u);
                            this.dispatchEvent('userconnected', [u]);
                            this._forwardEvents(this.connections[u]);
                            this.localMediaStreams.forEach(stream => this.connections[u].addMedia(stream));
                            this.connections[u].addEventListener('close', () => delete this.connections[u]);
                        });
                        break;
                }
            });
        }

        /**
         * forward the managed connections events by dispatching them on this object
         * @private
         * */
        _forwardEvents(connection){
            connection.addEventListener('mediachanged', e => this.dispatchEvent('mediachanged', [e]));
            connection.addEventListener('streamadded', (stream, track, mid) => this.dispatchEvent('streamadded', [stream, connection.peer, track, mid]));
            connection.addEventListener('streamremoved', (stream, track, mid) => this.dispatchEvent('streamremoved', [stream, connection.peer, track, mid]));
            connection.addEventListener('trackadded', (track, mid) => this.dispatchEvent('trackadded', [track, connection.peer, mid]));
            connection.addEventListener('trackremoved', (track, mid) => this.dispatchEvent('trackremoved', [track, connection.peer, mid]));
            connection.addEventListener('close', () => this.dispatchEvent('connectionclosed', [connection.peer, connection]));
            connection.addEventListener('close', () => this.dispatchEvent('connectionclosed', [connection.peer, connection]));
        }

        /**
         * the ids of the registered / known users as a list
         * @readonly
         * */
        get users(){
            return Object.keys(this.connections);
        }

        /**
         * @param {string} id The id of the user
         * @return {Connection} A connection or null, if none exists at the time
         * */
        get(id){
            return this.connections[id] || null;
        }

        /**
         * get all remote media streams
         * @readonly
         * @returns {Array} The complete list of MediaStreams that peers sent to this connection
         * */
        get streams(){
            return Object.values(this.connections).map(connection => connection.streams.length ? connection.streams : []).reduce((all, streams) => all.concat(streams), []);
        }

        /**
         * get all remote media stream tracks
         * @readonly
         * @returns {Array} The complete list of MediaStreamTracks that peers sent to this connection
         * */
        get tracks(){
            return Object.values(this.connections).map(connection => connection.tracks.length ? connection.tracks : []).reduce((all, tracks) => all.concat(tracks),[]);
        }

        /**
         * adds media to the (already existing and newly created) connections
         * @param {MediaStream|MediaStreamTrack} m the media to add. Can be a Stream or just a single Track
         * */
        addMedia(m){
            if(m instanceof MediaStream){
                if(this._verbose) this._logger.log('added media stream');
                this.localMediaStreams.push(m);
                Object.values(this.connections).forEach(con => con.addMedia(m));
            }else if(m instanceof MediaStreamTrack){
                if(this._verbose) this._logger.log('added media stream track');
                const stream = new MediaStream([m]);
                this.localMediaStreams.push(stream);
                Object.values(this.connections).forEach(con => con.addMedia(m));
            }else{
                this._logger.error('unknown media type',typeof m, m);
            }
        }

        /**
         * removes media from all connections
         * @param {MediaStream|MediaStreamTrack|string} [m] Remove the given media. If called without media or with '*', every media that was added is removed
         * */
        removeMedia(m){
            if(arguments.length === 0){
                if(this._verbose) this._logger.log('removed all media');
                this.localMediaStreams = [];
                Object.values(this.connections).forEach(con => con.removeMedia());
            }else{
                if(this._verbose) this._logger.log('remove single media stream');
                this.localMediaStreams = this.localMediaStreams.filter(s => s.id !== arguments[0].id);
                Object.values(this.connections).forEach(con => con.removeMedia(arguments[0]));
            }
        }

        muteMedia(m = "*", mute=true){
            Object.values(this.connections).forEach(con => con.muteMedia(m, mute));
        }

        /**
         * get a report about the overall amount of bytes and packets currently sent over the managed connections and how many of them get dropped
         * @param {Number} [watchTime=1000] in order to get the byte throughput, one has to watch the connection for a time. This parameter specifies for how long. It takes the number of milliseconds and defaults to a second, so that you get bytes per second as a result
         * @returns Promise resolves to a dictionary with inbound and outbound numeric byte transmission values
         * */
        async getReport(watchTime=1000){
            const report = {inbound: {bytes: 0, packets: 0, packetLoss: 0, tracks: 0}, outbound: {bytes: 0, packets: 0, packetLoss: 0, tracks: 0}, duration: 0};
            try{
                const reports = await Promise.all(Object.values(this.connections).map(con => con.getReport(watchTime)));
                reports.reduce((complete, r) => {
                    complete.inbound.bytes += r.inbound.bytes;
                    complete.inbound.packets += r.inbound.packets;
                    complete.inbound.packetLoss += r.inbound.packetLoss;
                    complete.inbound.tracks += r.inbound.tracks;
                    complete.outbound.bytes += r.outbound.bytes;
                    complete.outbound.packets += r.outbound.packets;
                    complete.outbound.packetLoss += r.outbound.packetLoss;
                    complete.outbound.tracks += r.outbound.tracks;
                    complete.duration += Math.floor(r.duration/reports.length);
                }, report);
            }catch (err) {
                this._logger.error(err);
            }
            return report;

        }

        /**
         * closes all connections
         * @param {Boolean} [remove=false] flag used to remove connections when closing them. Defaults to keeping the closed connections
         * */
        close(remove=false){
            Object.keys(this.connections)
                .forEach(user => {
                    this.connections[user].close();
                    if(remove) delete this.connections[user];
                });
        }

    }

    var ConnectionManager_1 = ConnectionManager;

    /**
     * A noise or speech detection utility that checks if a given stream has decibel levels above a defined threshold
     * @class
     * @implements Listenable
     * @implements MediaConsuming
     * */
    class SpeechDetection extends Listenable_1(){

        /**
         * creates a speech or noise detector (since there is de facto no recognition of speech but only of sound),
         * which checks which given media streams or tracks are currently loud enough for typical human speech
         * (key parts were directly taken from or inspired by hark.js https://github.com/latentflip/hark/)
         * @param {Object} [config]
         * @param {Number} [config.threshold=-70] A dBFS measure. Positive numbers will be made negative. Defaults to -70, which is approximately the loudness of human voices
         * @param {Number} [config.samplingInterval=100] Milliseconds between samples. Higher sample rate equals earlier detection but also more cpu cost
         * @param {Number} [config.smoothingConstant=0.1] Smoothes input to avoid peaks, set values with caution
         * @param {Number} [config.requiredSamplesForSpeech=5] How many consecutive samples must have an average dBFS value over threshold to be considered speech
         * @param {Boolean} [config.verbose=false] Logging on events if true
         * @param {console} [config.logger=console] A logger to use, defaults to browser console, only used when verbose is set to true
         * */
        constructor({threshold=-70, samplingInterval=100, smoothingConstant=0.1, requiredSamplesForSpeech=5, verbose=false, logger=console} = {}){
            super();
            this._smoothingConstant = 0.1;
            this._samplingInterval = 100; //ms
            this._treshold = -Math.abs(threshold);
            this.requiredSamplesForSpeech = 3;
            this._in = {};
            this._out = {};
            this._context = new AudioContext(); // careful, audio context may need user interaction to work
            this._lastSpeakers = [];
            this._lastSpeaker = null;
            this._silence = true;
            this._verbose = verbose;
            this._logger = logger;
            this._analyzerLoop = setInterval(() => {
                Object.keys(this._in).forEach(this._processForEachUser.bind(this));
                const currentSpeakers = Object.keys(this._out).reduce((speakers, id) => this._getStatsFor(id).speaking ? speakers.concat(id) : speakers, []).sort();
                const currentLength = currentSpeakers.length;
                const lastLength = this._lastSpeakers.length;
                const change = currentLength !== lastLength || !currentSpeakers.reduce((allSame, id, i) => currentSpeakers[i] === this._lastSpeakers[i] ? allSame : false, true);
                const speechEnd = currentLength === 0 && lastLength > 0;
                const speechStart = currentLength > 0 && lastLength === 0;
                if(speechStart){
                    if(this._verbose) this._logger.log('speech start');
                    this.dispatchEvent('speechstart', [currentSpeakers]);
                    this._silence = false;
                }
                if(speechEnd){
                    if(this._verbose) this._logger.log('speech end');
                    this.dispatchEvent('speechend', [currentSpeakers]);
                    this._silence = true;
                }
                if(change){
                    if(this._verbose) this._logger.log('speakers changed', currentSpeakers, this._lastSpeakers);
                    this.dispatchEvent('speechchange', [currentSpeakers, this._lastSpeakers.slice()]);
                }
                if(currentLength > 0){
                    this._lastSpeaker = currentSpeakers[0];
                }
                this._lastSpeakers = currentSpeakers;
            }, this._samplingInterval);
        }

        /**
         * stops the speech detection
         * */
        stop(){
            clearInterval(this._analyzerLoop);
        }

        /**
         * @param {Number} dBFS Decibel value set as threshold for sound, non negative values will be made negative
         * */
        set threshold(dBFS){
            this._threshold = -Math.abs(dBFS);
        }

        /**
         * the current decibel (dBFS) threshold for a stream to be considered not silent
         *
         * */
        get threshold(){
            return this._threshold;
        }

        /**
         * current stats by each registered media
         * @readonly
         * */
        get out(){
            return Object.assign({}, this._out);
        }

        /**
         * if all registered media is silent
         * @readonly
         * */
        get silence(){
            return this._silence;
        }

        /**
         * a list of the latest speakers (empty when no one spoke since the last sample)
         * @readonly
         * */
        get speakers(){
            return this._lastSpeakers
        }

        /**
         * return the last or current speaker.
         * If currently there is silence, return the one that spoke last,
         * if currently someone is speaking, return the first of the speaking ones
         * @readonly
         * */
        get lastSpeaker(){
            return this._lastSpeaker;
        }

        /**
         * get the (current) deciBel values (min, max, avg) for the given id
         * @param {string} id The media identifier used
         * @private
         * */
        _getStatsFor(id){
            if(!this._out[id]) this._out[id] = {consecutiveSamplesOverTreshold: 0, speaking: false, current: null};
            return this._out[id];
        }

        /**
         * add media to the current detection process. you can pass in the media(stream or track) itself or its identifier
         * @param m [MediaStream|MediaStreamTrack] a stream or track to add (stream must contain at least one audio track)
         * @param id [string=media.id] an id to reference the media and its results
         * */
        addMedia(m, id){
            if(arguments.length === 1) id = m.id;
            if(m instanceof MediaStreamTrack) m = new MediaStream([m]);
            const analyzer = this._context.createAnalyser();
            analyzer.fftSize = 512;
            analyzer.smoothingTimeConstant = this._smoothingConstant;
            const fftBins = new Float32Array(analyzer.frequencyBinCount);
            const source = this._context.createMediaStreamSource(m);
            source.connect(analyzer);
            this._in[id] = {analyzer, fftBins, source, stream: m};
        }

        /**
         * Removes the given media. You can pass in the media (stream or track) itself or its identifier.
         * If call this method without any argument or with '*', it will remove any added media
         * @param m [MediaStream|MediaStreamTrack|string] the media to remove
         * */
        removeMedia(m){
            if(arguments.length === 0 || m === '*') return Object.keys(this._in).forEach(id => this.removeMedia(id));
            if(arguments[0] instanceof MediaStream || arguments[0] instanceof MediaStreamTrack){
                const matching = Object.keys(this._in).filter(id => this._in[id].stream.getTracks()[0].id === m.id || this._in[id].stream.id === m.id);
                if(matching.length) m = matching[0];
            }
            delete this._in[m];
            delete this._out[m];
            this._lastSpeakers = this._lastSpeakers.filter(s => s !== m);
            if(this._lastSpeaker === m) {
                if(this._lastSpeakers.length) this._lastSpeaker = this._lastSpeakers.indexOf(this._lastSpeaker)  >= 0 ? this._lastSpeaker : this._lastSpeakers[0];
                else this._lastSpeaker = null;
            }
        }

        /**
         * takes an analyzer and sample buffer and retrieves the noise volume from it
         * @param analyzer [WebAudioNode] a web audio analyzer node
         * @param fftBins [Float32Array] a native buffer array containing the fft data of the sample at given time
         * @returns Object a dictionary containing the minimal, maximal and average volume in the sample
         * @private
         * */
        _analyzeVolume(analyzer, fftBins){
            analyzer.getFloatFrequencyData(fftBins);
            // set max as smallest value and min as biggest value so that any other value will overwrite them
            let minVolume = 0; // highest dBFS
            let maxVolume = -Infinity; // silence
            let average = 0;
            let count = 0;
            fftBins.forEach(f => {
                if(f > maxVolume) maxVolume = f;
                if(f < minVolume) minVolume = f;
                average+=f;
                count++;
            });
            average/=count;
            return {minVolume, maxVolume, average}
        }

        /**
         * check for each user, if the current media sample is above the threshold and therefore seen as more than just a bit of noise
         * @param id [string] the identifier for the given media
         * @private
         * */
        _processForEachUser(id){
            const output = this._getStatsFor(id);
            const stats = this._analyzeVolume(this._in[id].analyzer, this._in[id].fftBins);
            output.current = stats;
            if(stats.maxVolume > this._treshold){
                output.consecutiveSamplesOverTreshold++;
                if(output.consecutiveSamplesOverTreshold > this.requiredSamplesForSpeech){
                    output.speaking = true;
                    this.dispatchEvent('speechstartid', [id]);
                }
            }else{
                output.consecutiveSamplesOverTreshold = 0;
                if(output.speaking){
                    output.speaking = false;
                    this.dispatchEvent('speechendid', [id]);
                }
            }
        }

    }

    var SpeechDetection_1 = SpeechDetection;

    /**
     * Utility to simplify transcribing of outgoing media. Intended to be added to a Connection instead of media
     * */
    class Transcriber {

        /**
         * Create a transcriber for a given track who allows you to set up the peer connection with the given quality transcription
         * */
        constructor(trackOrKind, trackSettings = {}) {
            this._trackOrKind = trackOrKind;
            this._trackSettings = trackSettings;
            this._kind = typeof trackOrKind === "string" ? trackOrKind : trackOrKind.kind;
            this._qualities = {
                full: {
                    video: {},
                    audio: {},
                },
                high: {
                    video: {
                        "maxFramerate": 60
                    },
                    audio: {}
                },
                medium: {
                    video: {
                        "maxFramerate": 30
                    },
                    audio: {},
                },
                low: {
                    video: {
                        "maxFramerate": 15,
                        "scaleResolutionDownBy": 2
                    },
                    audio: {},
                },
                micro: {
                    video: {
                        "maxFramerate": 10,
                        "scaleResolutionDownBy": 4,
                        "maxBitrate": 8 * 1024 * 2,
                    },
                    audio: {
                        "maxBitrate": 8 * 1024 * 4,
                        // dtx: true // currently poor browser support, only moz ff >= v46
                    }
                }
            };
        }

        _mergeRtpSettingsForTrack(rtpOptions){
            const trackSettingsCopy = Object.assign({}, this._trackSettings);
            if(!trackSettingsCopy.sendEncodings){
                trackSettingsCopy.sendEncodings = [rtpOptions];
            }else{
                trackSettingsCopy.sendEncodings.forEach(encoding => {
                    Object.keys(rtpOptions).forEach(key => {
                        console.log(key, key in encoding);
                        if (!(key in encoding)) encoding[key] = rtpOptions[key];
                    });
                });
            }
            return trackSettingsCopy;
        }

        /**
         * returns the track and the options to pass to addTransceiver.
         * You may use this like peerConnection.addTransceiver(...myTranscriber.transcribe('medium'));
         * @param quality [string] one of the quality settings of the transcriber (by default full, high, medium, low, micro)
         * @returns [trackOrKind, settings]
         * */
        transcribe(quality){
            quality = quality.toLowerCase();
            if(Object.keys(this._qualities).indexOf(quality) === -1) throw new Error('Unsupported quality option');
            return [this._trackOrKind, this._mergeRtpSettingsForTrack(this._qualities[quality][this._kind])];
        }

    }

    var Transcriber_1 = Transcriber;

    /**
     * implements a simple, websocket-based Signaler,
     * which can be also used as a reference or interface for other signalling solutions (like Server-Sent-Event-based or HTTP-Push)
     * All signalers expose a send function, which accepts serializable objects and allow adding a 'message' EventListener
     * by calling addEventListener('message', function callback({type="message", data}){...}) and a 'close' EventListener by calling
     * addEventListener('close', function callback(){...})
     * @class
     * @implements Listenable
     * */
    class Signaler extends Listenable_1(){

        /**
         * construct a new signaller
         * @param {Object} config
         * @param {string} config.endpoint URL or connection string to connect the signaler client to the server
         * @param {WebSocket} [config.socket] A socket to use for a new socket connection, defaults to a newly created, browser-native WebSocket with the given endpoint
        * */
        constructor({endpoint, socket=null} = {}){
            super();
            if(socket === null) socket = new WebSocket(arguments.length && typeof arguments[0] === "string" ? arguments[0] : endpoint);
            this._connection = socket;
            this._queued = [];
            this._connection.addEventListener('open', () => this._queued.forEach(msg => this._connection.send(msg)));
            this._connection.addEventListener('close', () => this.dispatchEvent('close', []));
            this._connection.addEventListener('message', e => this._handleMessage(e));
        }

        /**
         * sends messages, if not closed
         * @param {Object} msg A serializable, non-recursive Object
         * */
        send(msg){
            msg = JSON.stringify(msg);
            if(this._connection.readyState !== 1) this._queued.push(msg);
            else this._connection.send(JSON.stringify(msg));
        }

        /**
         * closes the connection
         * */
        close(){
            return this._connection.close();
        }

        /**
         * checks if the connection is closed (this means: no messages can be sent)
         * @readonly
         * */
        get closed(){
            return this._connection.readyState > 1;
        }


        /**
         * handles incoming socket messages and parses them accordingly
         * @param {Event} e a message event
         * @private
         * */
        _handleMessage(e){
            let msg = JSON.parse(e.data);
            if(typeof msg === "string"){
                try{
                    msg = JSON.parse(msg);
                }catch(err){}
            }
            this.dispatchEvent('message', [msg]);
        }

    }

    var Signaler_1 = Signaler;

    /**
     * A video mixing configuration that shows the current speaker as a big background image and other participants in little images on the bottom.
     * Also indicates if someone is speaking right now
     * @extends VideoMixingConfiguration
     * @class
     * */
    class Speaker extends VideoMixingConfiguration_1{

        /**
         * @param {SpeechDetection} speechDetection A speechDetection object to use to determine who is speaking right now. The media to detect must be added to the speech detection
         * @param {Number} [priority=0] The priority of this config
         * @param {Boolean} [applicable=true] if this config is usable. Should work with every number of conference members, therefore defaults to true
         * */
        constructor(speechDetection, priority = 0, applicable = true){
            // check if the given id is speaking now, or if everyone is silent
            const silenceOffset = 2;
            const noiseOffset = 5;
            const smallFrameWidth = 80;
            const smallFrameHeight = 60;
            const smallFrameOffset = 5;
            const idIsNowSpeaking = (id, index) => speechDetection.lastSpeaker === id  || (speechDetection.lastSpeaker === null && index === 0);
            const frameX = stats => {
                if(idIsNowSpeaking(stats.id, stats.drawIndex)){
                    return speechDetection.silence ? silenceOffset : noiseOffset;
                }else{
                    return smallFrameOffset + stats.drawIndex*smallFrameWidth;
                }
            };
            const frameY = stats => {
                if(idIsNowSpeaking(stats.id, stats.drawIndex)){
                    return speechDetection.silence ? silenceOffset : noiseOffset;
                }else{
                    return stats.height - smallFrameHeight - noiseOffset;
                }
            };
            const frameWidth = stats => {
                if(idIsNowSpeaking(stats.id, stats.drawIndex)){
                    return speechDetection.silence ? stats.width - silenceOffset*2 : stats.width - noiseOffset*2;
                }else{
                    return smallFrameWidth;
                }
            };
            const frameHeight = stats => {
                if(idIsNowSpeaking(stats.id, stats.drawIndex)){
                    return speechDetection.silence ? stats.height - silenceOffset*2 : stats.height - noiseOffset*2;
                }else{
                    return smallFrameHeight;
                }
            };
            super({
                applicable,
                priority,
                background: () => speechDetection.silence ? 'rgb(0,0,0)' : 'rgb(100,200,250)',
                positions: {
                    x: frameX,
                    y: frameY,
                    width: frameWidth,
                    height: frameHeight,
                    zIndex: s => idIsNowSpeaking(s.id, s.drawIndex) ? 0 : 1
                }
            });
        }
    }

    var Speaker_1 = Speaker;

    const architectures = Object.freeze(['mesh', 'sfu', 'mcu']);
    const floormod = (n, m) => ((n % m) + m) % m;


    class Architecture extends Listenable_1(){

        constructor(initial = 'mesh') {
            super();
            this._architecture = initial;
        }

        next(){
            const previous = this._architecture;
            this._architecture = this.nextValue();
            this.dispatchEvent("architecture:next", [this._architecture, previous]);
            this.dispatchEvent("architecture:switch", [this._architecture, previous]);
        }

        nextValue(){
            return architectures[floormod(architectures.indexOf(this._architecture) + 1, architectures.length)];
        }

        prev(){
            const previous = this._architecture;
            this._architecture = this.prevValue();
            this.dispatchEvent("architecture:prev", [this._architecture, previous]);
            this.dispatchEvent("architecture:switch", [this._architecture, previous]);
        }

        prevValue(){
            return architectures[floormod(architectures.indexOf(this._architecture) - 1, architectures.length)];
        }

        set value(architecture){
            architecture = architecture.toLowerCase();
            if(architectures.indexOf(architecture) === -1) throw new Error("INVALID ARCHITECTURE");
            const previous = this._architecture;
            this._architecture = architecture;
            this.dispatchEvent("architecture:switch", [this._architecture, previous]);
        }

        get value(){
            return this._architecture;
        }
    }

    var _Architecture = Architecture;

    /**
     * @class Utility to transmit your media to other conference members using a specified architecture
     * */
    var Conference_1 = class Conference extends Listenable_1(){

        /**
         * create a new conference that exchanges your media streams with other conference members using multiple architectures,
         * like the simple peer to peer model 'mesh' or the architecture 'mcu', that uses a media server to mix streams
         * @param {Object} config
         * @param {String} config.name your username in the conference
         * @param {Signaler} config.signaler The signaler to use to communicate the necessary data to transmit media between the conference members
         * @param {String} [config.architecture='mesh'] The architecture (name) to start with. Defaults to the purely peer to peer based mesh model
         * @param {Object} [config.video={width:640, height:480}] The video size to preferably use
         * @param {Array} [config.iceServers=[]] The ice servers to use, in the common RTCIceServer-format
         * @param {Console} [config.logger=console] The logger to use. Anything with .log() and .error() method should work. Defaults to the browser console
         * @param {Boolean} [config.verbose=false] If you want to log (all) information or not
         * */
        constructor({name, signaler, architecture= 'mesh', iceServers = [], video = {width: 640, height: 480}, verbose = false, logger = console}){
            super();
            this._name = name;
            this._signaler = signaler;
            this._verbose = verbose;
            this._logger = logger;
            this._peers = new ConnectionManager_1({signaler, name, iceServers, verbose, logger});
            this._sfu = new ConnectionWithRollback({signaler, name, iceServers, peer: '@sfu', isYielding: false, verbose, logger});
            this._mcu = new ConnectionWithRollback({signaler, name, iceServers, peer: '@mcu', isYielding: false, verbose, logger});
            this._speechDetection = new SpeechDetection_1({threshold: 65});
            this._videoMixer = new VideoMixer_1(video);
            this._videoMixer.addConfig(new Speaker_1(this._speechDetection), 'speaker');
            this._audioMixer = new AudioMixer_1();
            this._architecture = new _Architecture(architecture);
            this._addedMedia = [];
            this._display = null;
            signaler.addEventListener('message', message => {
                if(message.type === 'architecture:switch'){
                    this._handleArchitectureSwitch(message.data);
                }
            });
            this._peers.addEventListener('trackadded', (track, user) => {
                if(this._architecture.value === 'mesh'){
                    this._videoMixer.addMedia(track, 'peers-'+user);
                    if(track.kind === "audio") this._speechDetection.addMedia(track, 'peers-'+user);
                    this.dispatchEvent('trackadded', [track, user]);
                    this.dispatchEvent('mediachanged', []);
                }
            });
            this._sfu.addEventListener('trackadded', track => {
                if(this._architecture.value === 'sfu'){
                    const addTrack = track => {
                        this._videoMixer.addMedia(track, 'sfu-'+track.meta);
                        if(track.kind === "audio") this._speechDetection.addMedia(track, 'sfu-'+track.meta);
                        this.dispatchEvent('trackadded', [track, track.meta]);
                        this.dispatchEvent('mediachanged', []);
                    };
                    if(track.meta) addTrack(track);
                    else track.addEventListener('metachanged', () => addTrack(track, track.meta));
                }
            });
            this._mcu.addEventListener('trackadded', () => {
                this._updateDisplayedStream();
            });
            this._peers.addEventListener('userconnected', user => this.dispatchEvent('userconnected', [user]));
            this._peers.addEventListener('userdisconnected', user => this.dispatchEvent('userdisconnected', [user]));
            this._peers.addEventListener('connectionclosed', user => {
                if(this._architecture.value === 'mesh'){
                    this._videoMixer.removeMedia('peers-'+user);
                    this._audioMixer.removeMedia('peers-'+user);
                    this._speechDetection.removeMedia('peers-'+user);
                    this._updateDisplayedStream();
                }
            });
            this.addEventListener('mediachanged', () => this._updateDisplayedStream());
        }

        /**
         * the name of the architecture currently used
         * @readonly
         * */
        get architecture(){
            return this._architecture.value;
        }

        /**
         * the current conference members
         * @readonly
         * */
        get members(){
            return this._peers.users;
        }

        /**
         * get the current or specified architecture connection(s)
         * @private
         * */
        _getArchitectureHandler(name = null){
            if(name === null) name = this._architecture.value;
            const architectures = {mesh: this._peers, mcu: this._mcu, sfu: this._sfu};
            return architectures[name];
        }

        /**
         * when notified to switch to another architecture, use the next architecture model to transmit and receive media and display it
         * @private
         * */
        _handleArchitectureSwitch(newArchitecture){
            const previousArchitecture = this._architecture.value;
            this._architecture.value = newArchitecture;
            this._addedMedia.forEach(m => this._getArchitectureHandler(newArchitecture).addMedia(m));
            if(newArchitecture === 'mesh'){
                this._clearLocalMediaProcessors();
                // TODO: make this more standardized by using it like sfu or mcu, maybe via track.meta
                this._getArchitectureHandler('mesh').users.forEach(user => {
                    this._getArchitectureHandler('mesh').get(user).tracks.forEach(track => {
                        this._addTrackToLocalMediaProcessors(track, user);
                    });
                });
                this._addedMedia.forEach(m => this._addLocalMediaToLocalMediaProcessors(m));
            }else if(newArchitecture === 'sfu'){
                this._clearLocalMediaProcessors();
                this._getArchitectureHandler('sfu').tracks.forEach(track => {
                    this._addTrackToLocalMediaProcessors(track, track.meta);
                });
                this._addedMedia.forEach(m => this._addLocalMediaToLocalMediaProcessors(m));
            }else if(newArchitecture === 'mcu'){
                this.dispatchEvent('mediachanged', []);
            }
            this._updateDisplayedStream();
            this._getArchitectureHandler(previousArchitecture).removeMedia();
            this.dispatchEvent('architectureswitched', [newArchitecture, previousArchitecture]);
        }

        /**
         * switches the used architecture to the given one
         * @param {String} [name=nextArchitectureValue] the architecture to switch to
         * */
        switchArchitecture(name=undefined){
            if(name === undefined) name = this._architecture.nextValue();
            if(this._verbose) this._logger.log('request switching to architecture', name);
            let msg = {type: 'architecture:switch', receiver: '@server', data: name};
            this._signaler.send(msg);
        }

        /**
         * switches to the architecture that comes after the current architecture in the order of architectures (standard: mesh -> sfu -> mcu -> mesh)
         * */
        nextArchitecture(){
            this.switchArchitecture(this._architecture.nextValue());
        }

        /**
         * the architecture that is used after the current architecture
         * @returns {String} the architecture name
         * */
        get nextArchitectureValue(){
            return this._architecture.nextValue();
        }

        /**
         * switches to the architecture that is before the current one in the order of architectures to use (standard: mesh -> sfu -> mcu -> mesh)
         * */
        previousArchitecture(){
            this.switchArchitecture(this._architecture.prevValue());
        }

        /**
         * the architecture that is used before the current architecture
         * @returns {String} the architecture name
         * */
        get prevArchitectureValue(){
            return this._architecture.prevValue();
        }

        /**
         * @private
         * */
        _clearLocalMediaProcessors(){
            this._videoMixer.removeMedia();
            this._speechDetection.removeMedia();
            this._audioMixer.removeMedia();
        }

        /**
         * @private
         * */
        _addTrackToLocalMediaProcessors(track, id){
            if(track.kind === "video"){
                this._videoMixer.addMedia(track, id);
            }else{
                this._audioMixer.addMedia(track, id);
                this._speechDetection.addMedia(track, id);
            }
        }

        /**
         * The stream of the conference
         * @returns MediaStream The mixed & ready stream to display
         * */
        get out(){
            if(this._architecture.value === 'mcu'){
                return this._mcu.streams[0];
            }else{
                return new MediaStream([this._videoMixer.outputTrack, this._audioMixer.outputTrack]);
            }
        }

        /**
         * activates your webcam and adds the stream to the connection
         * @param {Object} [config={video:true, audio:true}] the webcam configuration to use
         * */
        async addWebcam(config = {video: true, audio: true}){
            const stream = await window.navigator.mediaDevices.getUserMedia(config);
            this.addMedia(stream);
        }

        /**
         * mutes (or unmutes) added media
         * @param {String|MediaStream|MediaStreamTrack} m The media to mute. Defaults to all media "*" but can be any stream, track or media kind ("video", "audio" or "*")
         * @param {Boolean} [mute=true] a flag which indicates if you want to mute media, or unmute muted media. Muting muted or unmuting not muted Media has no effect.
         * */
        muteMedia(m="*", mute=true){
            this._getArchitectureHandler().muteMedia(m, mute);
        }

        /**
         * add media to the connection
         * @param {MediaStream|MediaStreamTrack} m The media to add. This can be a stream or a single track
         * */
        async addMedia(m){
            if(!m.meta) m.meta = this._name;
            this._getArchitectureHandler().addMedia(m);
            this._addLocalMediaToLocalMediaProcessors(m);
            this._addedMedia.push(m);
            this._updateDisplayedStream();
        }

        /**
         * remove media from the conference
         * @param {String|MediaStream|MediaStreamTrack} [m="*"] the media to remove. Can be a media type like audio, video or "*" for all, a track or a stream
         * */
        removeMedia(m = "*"){
            if(m instanceof MediaStream){
                m.getTracks().forEach(track => {
                    this._getArchitectureHandler().removeMedia(track);
                    this._removeLocalMediaFromLocalMediaProcessors(m);
                });
            }else if(m instanceof MediaStreamTrack){
                this._getArchitectureHandler().removeMedia(m);
                this._removeLocalMediaFromLocalMediaProcessors(m);
            }else if(typeof m === "string" && ["video", "audio", "*"].indexOf(m.toLowerCase()) >= 0){
                m = m.toLowerCase();
                this._getArchitectureHandler().removeMedia(m);
                this._removeLocalMediaFromLocalMediaProcessors(m);
            }else{
                console.log('unknown media type', m);
            }
            this._addedMedia = this._addedMedia.filter(added => {
                if(typeof m === "string"){
                    m = m.toLocaleLowerCase();
                    if(added instanceof MediaStreamTrack){
                        return added.kind !== m || m !== "*"
                    }else if(added instanceof MediaStream){
                        added.getTracks().filter(track => track.kind !== m || m !== "*").forEach(track => added.removeTrack(track));
                        return added.getTracks().length > 0
                    }
                }else if(m instanceof MediaStream){
                    if(added instanceof MediaStream){
                        return added.id !== m.id;
                    }else if(added instanceof MediaStreamTrack){
                        return m.getTracks().findIndex(track => track.id === added.id) === -1;
                    }
                }else if(m instanceof MediaStreamTrack){
                    if(added instanceof MediaStream){
                        added.getTracks().forEach(track => {
                            if(track.id === m.id) added.removeTrack(track);
                        });
                        return added.getTracks().length > 0;
                    }else if(added instanceof MediaStreamTrack){
                        return m.id !== added.id;
                    }
                }
            });
        }

        /**
         * @private
         * */
        _addLocalMediaToLocalMediaProcessors(m){
            if(this._architecture.value !== 'mcu'){
                this._speechDetection.addMedia(m, this._name);
                this._videoMixer.addMedia(m, this._name);
            }
        }

        /**
         * @private
         * */
        _removeLocalMediaFromLocalMediaProcessors(m){
            if(m instanceof MediaStream){
                m.getTracks().forEach(track => {
                    if(track.kind === "video"){
                        this._videoMixer.removeMedia(track);
                    }else{
                        this._audioMixer.removeMedia(track);
                        this._speechDetection.removeMedia(track);
                    }
                });
            }else if(typeof m === "string" && ["video", "audio", "*"].indexOf(m.toLowerCase()) >= 0){
                m = m.toLowerCase();
                this._getArchitectureHandler().removeMedia(m);
                if(m === "*" || m === "video") {
                    this._videoMixer.removeMedia();
                }
                if(m === "*" || m === "audio") {
                    this._audioMixer.removeMedia();
                    this._speechDetection.removeMedia();
                }
            }
        }

        /**
         * define on which video element the conference should be displayed on
         * @param element the element to use as a display. Can be a video element or a query selector string to find one
         * */
        displayOn(element){
            if(typeof element === 'string') element = document.querySelector(element);
            this._display = element;
            if(this._verbose) this._logger.log('display output on', element);
            this._updateDisplayedStream();
        }

        /**
         * @private
         * */
        _updateDisplayedStream(){
            if(this._display){
                if(this._verbose) this._logger.log('updated display');
                this._display.srcObject = this.out;
            }
        }

        /**
         * Get the number of media objects that you added. This is not equal to the number of MediaStreamTracks, since added MediaStreams also count just as one
         * @return Number the number of media added
         * */
        get numberOfAddedMedia(){
            return this._addedMedia.length;
        }

        /**
         * Get the number of added MediaStreamTracks to the connection
         * @return Number the number of tracks added (as tracks only or as part of a stream)
         * */
        get addedTracks(){
           return this.addedMedia.reduce((count, m) => m instanceof MediaStream ? count+m.getTracks().length : count+1, 0);
        }

        /**
         * Close down any connections of any used architecture
         * */
        close(){
            [this._peers, this._sfu, this._mcu].forEach(architecture => architecture.close());
            this._addedMedia = [];
        }

        /**
         * A conference is closed if at least one connection in use is closed
         * @readonly
         * */
        get closed(){
            return ![this._peers, this._sfu, this._mcu].reduce((isClosed, architecture) =>architecture.closed || isClosed, false)
        }

    };

    /**
     * Utility to generate placeholder media without using a web cam or video/audio files
     * @class
     * */
    class PlaceholderMediaGenerator{

            /**
             * create a new Media Generator
             * @param {Object} [settings]
             * @param {Boolean} [settings.enable=false] if the generated audio should actually make noise and the video should be more than just black
             * */
            constructor({enable = false} = {}){
                this._audio = this._generateAudio(enable);
                this._video = this._generateVideo(enable);
            }

            /**
             * a generated MediaStream
             * @readonly
             * */
            get out(){
                return new MediaStream([this._video, this._audio]);
            }

            /**
             * a generated audio MediaStreamTrack
             * @readonly
             * */
            get audioTrack(){
                return this._audio;
            }

            /**
             * a generated video MediaStreamTrack
             * @readonly
             * */
            get videoTrack(){
                return this._video;
            }

            /**
             * create a disabled (=will not be played on speakers) beep sound
             * @param {Boolean} [enabled=false]
             * @private
             * */
            _generateAudio(enabled = false){
                let ctx = new AudioContext(), oscillator = ctx.createOscillator();
                let dst = oscillator.connect(ctx.createMediaStreamDestination());
                oscillator.start();
                return Object.assign(dst.stream.getAudioTracks()[0], {enabled});
            }

            /**
             * create a disabled (=always black and no new frames) video stream
             * @param {Boolean} [enabled=false]
             * @param {Object} [dimensions={width:360, height:420}] which dimensions the generated video stream should have
             * */
            _generateVideo(enabled = false, dimensions = {width: 360, height: 420}){
                let canvas = Object.assign(document.createElement("canvas"), dimensions);
                let context = canvas.getContext('2d');
                context.fillRect(0, 0, dimensions.width, dimensions.height);
                if(enabled){
                    window.setInterval(() => {
                        context.fillStyle = 'rgb('+Math.floor(Math.random()*255)+','+Math.floor(Math.random()*255)+','+Math.floor(Math.random()*255)+')';
                        context.fillRect(0,0, dimensions.width, dimensions.height);
                    },1000);
                }
                let stream = canvas.captureStream(1);
                return Object.assign(stream.getVideoTracks()[0], {enabled});
            }
    }

    var PlaceholderMediaGenerator_1 = PlaceholderMediaGenerator;

    /**
     * @function wrapTunnelAsSignaler
     * @param {Tunnel} tunnel the BrowserEnvironments Tunnel object to wrap and make it look like a Signaler
     * (which only allows sending and registering listeners for message events but nothing else)
     * */
    var TunnelSignaler = tunnel => ({
        send: msg => {
            tunnel.doExport('message', msg);
        },
        addEventListener: (_, cb) => {
            if(_.toLowerCase() !== 'message') return;
            tunnel.onImport('message', function(data){
                cb(data);
            });
        },
        close(){},
        closed: false
    });

    /**
     * @param {Number} n the positive integer to factor
     * @return {Array} A list of tuples of factoring numbers, unique (only a,b but not a,b and b,a) and sorted biggest factors first
     * @private
     * */
    function factors(n){
        if(n === null || n === undefined || isNaN(n)) throw new Error('Invalid argument, n must be a number but is ' + n);
        if(n === 0 || n === 1) return [[n, n]];
        const factorDict = {};
        // honestly, there is no need for factoring algorithms like rho,
        // n will be less than 30, one could even hard-code the results...
        for(let i = 1; i <= Math.floor(n/2); i++){
            const isDivisor = n%i === 0;
            if(isDivisor){
                if(!factorDict[i]) factorDict[n/i] = i;
            }
        }
        return Object.keys(factorDict).map(k => [factorDict[k],+k]);
    }

    /**
     * Places video streams in a grid
     * @extends VideoMixingConfiguration
     * @class
     * */
    class Grid extends VideoMixingConfiguration_1{

        /**
         * Creates a grid of videos, which works best for square numbers but also for numbers which can be factored by a and b with |a-b| <= 2
         * Everything else seemed to look bad
         * @param {Number} [priority=0] The priority of this config
         * @param {Boolean|Function} [applicable=differenceBetweenTwoBiggestFactors(ids.length) <= 2]
         * */
        constructor(priority = 0, applicable = ids =>Math.abs(factors(ids.length)[0][1]-factors(ids.length)[0][0]) <= 2){
            super({
                applicable,
                priority: 0,
                positions: function(id, index, arr){
                    const [rows, columns] = factors(arr.length)[0];
                    const frameWidth = this.width/columns;
                    const frameHeight = this.height/rows;
                    return {
                        x: (index % columns) * frameWidth,
                        y: ~~(index / columns) * frameHeight,
                        width: frameWidth,
                        height: frameHeight
                    };
                }
            });
        }
    }

    var Grid_1 = Grid;

    /**
     * Places 1 video in the middle and the other 4s in a grid around it
     * @extends VideoMixingConfiguration
     * @class
     * */
    class Middle extends VideoMixingConfiguration_1{

        /**
         * create a grid of streams where one stream (the last one) is in the middle. It is only applicable for 5 conference call members
         * @param {Number} [priority=0] the priority of the config
         * */
        constructor(priority = 0){
            super({
                priority,
                applicable: videos => videos.length === 5,
                positions: [
                    // since we cannot refer to 'this' to get width and height at the moment,
                    // we pass functions for values that will receive a stats object with width, height and id of the current stream.
                    // these functions are calculated just before the painting happens and can be used for dynamic updates on each frame
                    // 2x2 grid
                    {x: 0, y: 0, width: s => s.width/2, height: s => s.height/2},
                    {x: s => s.width/2, y: 0, width: s => s.width/2, height: s => s.height/2},
                    {x: 0, y: s => s.height/2, width: s => s.width/2, height: s => s.height/2},
                    {x: s => s.width/2, y: s => s.height/2, width: s => s.width/2, height: s => s.height/2},
                    // last video in the middle above all
                    {x: s => s.width/4, y: s => s.height/4, width: s => s.width/2, height: s => s.height/2}
                ]
            });
        }
    }

    var Middle_1 = Middle;

    /**
     * Places streams beside each other
     * @extends VideoMixingConfiguration
     * @class
     * */
    class Line extends VideoMixingConfiguration_1{

        /**
         * creates a new Line Mixing config for less or equal to 3 persons which places the videos right besides each other and skews them eventually
         * @param {Number} [priority=0]
         * @param {Boolean|Function} [applicable=ids=>ids.length<4]
         * */
        constructor(priority = 0, applicable = ids => ids.length < 3){
            super({
                applicable,
                priority,
                positions: function(id, index, arr){
                    return {
                        x: (this.width/arr.length) * index,
                        y: 0,
                        width: this.width/arr.length,
                        height: this.height
                    }
                }
            });
        }
    }

    var Line_1 = Line;

    var MediaServerUtilities = {
        Signaler: Signaler_1,
        Recorder: Recorder_1,
        VideoMixer: VideoMixer_1,
        AudioMixer: AudioMixer_1,
        Transcriber: Transcriber_1,
        Connection: ConnectionWithRollback,
        ConnectionManager: ConnectionManager_1,
        SpeechDetection: SpeechDetection_1,
        Conference: Conference_1,
        VideoMixingConfiguration: VideoMixingConfiguration_1,
        PlaceHolderMediaGenerator: PlaceholderMediaGenerator_1,
        VideoMixingConfigurations: {
            Grid: Grid_1,
            Middle: Middle_1,
            Line: Line_1,
            Speaker: Speaker_1
        },
        wrapTunnelAsSignaler: TunnelSignaler
    };
    var MediaServerUtilities_1 = MediaServerUtilities.Signaler;
    var MediaServerUtilities_2 = MediaServerUtilities.Recorder;
    var MediaServerUtilities_3 = MediaServerUtilities.VideoMixer;
    var MediaServerUtilities_4 = MediaServerUtilities.AudioMixer;
    var MediaServerUtilities_5 = MediaServerUtilities.Transcriber;
    var MediaServerUtilities_6 = MediaServerUtilities.Connection;
    var MediaServerUtilities_7 = MediaServerUtilities.ConnectionManager;
    var MediaServerUtilities_8 = MediaServerUtilities.SpeechDetection;
    var MediaServerUtilities_9 = MediaServerUtilities.Conference;
    var MediaServerUtilities_10 = MediaServerUtilities.VideoMixingConfiguration;
    var MediaServerUtilities_11 = MediaServerUtilities.PlaceHolderMediaGenerator;
    var MediaServerUtilities_12 = MediaServerUtilities.VideoMixingConfigurations;
    var MediaServerUtilities_13 = MediaServerUtilities.wrapTunnelAsSignaler;

    exports.AudioMixer = MediaServerUtilities_4;
    exports.Conference = MediaServerUtilities_9;
    exports.Connection = MediaServerUtilities_6;
    exports.ConnectionManager = MediaServerUtilities_7;
    exports.PlaceHolderMediaGenerator = MediaServerUtilities_11;
    exports.Recorder = MediaServerUtilities_2;
    exports.Signaler = MediaServerUtilities_1;
    exports.SpeechDetection = MediaServerUtilities_8;
    exports.Transcriber = MediaServerUtilities_5;
    exports.VideoMixer = MediaServerUtilities_3;
    exports.VideoMixingConfiguration = MediaServerUtilities_10;
    exports.VideoMixingConfigurations = MediaServerUtilities_12;
    exports.default = MediaServerUtilities;
    exports.wrapTunnelAsSignaler = MediaServerUtilities_13;

    return exports;

}({}));
//# sourceMappingURL=mediautils.js.map

var MediaUtilities = (function (exports) {
    'use strict';

    class AudioMixer{

        constructor(){
            this._context = new AudioContext();
            this._out = this._context.createMediaStreamDestination();
            this._in = {};
        }

        get out(){
            return this._out.stream;
        }

        get outputTrack(){
            return this._out.stream.getAudioTracks()[0];
        }

        addStream(mediaStream, id) {
            this._in[id] = this._context.createMediaStreamSource(mediaStream);
            this._rebuildGraph();
        }

        removeStream(mediaStream, id){
            delete this._in[id];
            this._rebuildGraph();
        }

        _rebuildGraph(){
            const inputs = Object.values(this._in);
            if(this._merger) this._merger.disconnect();
            this._merger = this._context.createChannelMerger(inputs.length);
            this._merger.connect(this._context.destination);
            inputs.forEach((input, i) => input.connect(this._merger, 0, i));
        }

    }

    var AudioMixer_1 = AudioMixer;

    class VideoMixingConfiguration {

        constructor(settings) {
            this.__isVideoMixingConfigurationObject = true;
            this.width = 0;
            this.height = 0;
            this._applicable = settings.applicable || true;
            this._positions = settings.positions || [];
            this._background = settings.background || 'rgb(20,20,20)';
            this.paint = settings.paint || null;
            this._priority = settings.priority || 0;
        }

        /**
         * @return boolean
         * */
        applicable(ids){
            if(typeof this._applicable === "function"){
                return this._applicable(ids);
            }else{
                return !!this._applicable;
            }
        }

        /**
         * @return number
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
         * @return string
         * */
        background(ids){
            if(typeof this._background === "function"){
                return this._background(ids);
            }else{
                return this._background;
            }
        }

        /**
         * @return object
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
     * @mixin
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
         * @param stream the MediaStream object to manage
         * @param id the unique identifier used for the mediaStream (useful for removal, custom grids, etc.).
         * */
        addStream(stream, id){
            const helper = document.createElement('video');
            helper.autoplay = true;
            helper.muted = true;
            helper.srcObject = stream;
            helper.style.visibility = "hidden";
            helper.style.pointerEvents = "none";
            helper.style.position = "absolute";
            helper.addEventListener('pause', () => helper.play());
            document.body.appendChild(helper);
            this._streams[id] = helper;
            this._onStreamChangeHandler(this.streamIds());
        }

        /**
         * removes a MediaStream from the mixing process
         * @param id the id used to add the media stream
         * @throws Error when there is no stream with the given id
         * */
        removeStream(id){
            if(!this._streams[id]) throw new Error('No stream with id ' + id);
            delete this._streams[id];
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
         * @private
         * set up a canvas to mix videos according to the optionally given width and height
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
         * @return MediaStream
         * */
        get out(){
            return this._out;
        }

        /**
         * mixed output as a MediaStreamTrack of kind video
         * @return MediaStreamTrack
         * */
        get outputTrack(){
            return this._out.getVideoTracks()[0];
        }

        /**
         * @readonly
         * the pixel width of the mixed video
         * */
        get width(){
            return this._width;
        }

        /**
         * @readonly
         * the pixel height of the mixed video
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
         * @private
         * draw the current streams on according to the current config in use on a canvas
         * */
        _draw(){
            if(!this.currentConfig) return;
            const ids = this.streamIds();
            if(this.currentConfig.paint){
                // let the custom paint function handle it
                this.currentConfig.paint(ids, this._canvas, this._context);
            }else{
                this._context.clearRect(0,0,this._width,this._height);
                // check if you have to resolve position functions
                const resolveFn = (v, s) => typeof v === "function" ? v(s) : v;
                this.currentConfig.calculatedPositions.forEach((pos) => {
                    const stats = {width: this.width, height: this.height, id: pos.assignedId};
                    if(pos.source) this._context.drawImage(pos.source, resolveFn(pos.x, stats), resolveFn(pos.y, stats), resolveFn(pos.width, stats), resolveFn(pos.height, stats));
                });
            }
        }

    }

    var VideoMixer_1 = VideoMixer;

    var Listenable = (superclass=Object) => class extends superclass{

        constructor(){
            super(...arguments);
            this._listeners = {};
        }

        addEventListener(event, fn){
            event = event.toLowerCase();
            if(typeof fn !== "function") throw new Error("Argument 1 is not of type function");
            if(!(this._listeners[event] instanceof Array)) this._listeners[event] = [];
            this._listeners[event].push(fn);
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

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function createCommonjsModule(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var loglevel = createCommonjsModule(function (module) {
    /*
    * loglevel - https://github.com/pimterry/loglevel
    *
    * Copyright (c) 2013 Tim Perry
    * Licensed under the MIT license.
    */
    (function (root, definition) {
        if ( module.exports) {
            module.exports = definition();
        } else {
            root.log = definition();
        }
    }(commonjsGlobal, function () {

        // Slightly dubious tricks to cut down minimized file size
        var noop = function() {};
        var undefinedType = "undefined";
        var isIE = (typeof window !== undefinedType) && (
            /Trident\/|MSIE /.test(window.navigator.userAgent)
        );

        var logMethods = [
            "trace",
            "debug",
            "info",
            "warn",
            "error"
        ];

        // Cross-browser bind equivalent that works at least back to IE6
        function bindMethod(obj, methodName) {
            var method = obj[methodName];
            if (typeof method.bind === 'function') {
                return method.bind(obj);
            } else {
                try {
                    return Function.prototype.bind.call(method, obj);
                } catch (e) {
                    // Missing bind shim or IE8 + Modernizr, fallback to wrapping
                    return function() {
                        return Function.prototype.apply.apply(method, [obj, arguments]);
                    };
                }
            }
        }

        // Trace() doesn't print the message in IE, so for that case we need to wrap it
        function traceForIE() {
            if (console.log) {
                if (console.log.apply) {
                    console.log.apply(console, arguments);
                } else {
                    // In old IE, native console methods themselves don't have apply().
                    Function.prototype.apply.apply(console.log, [console, arguments]);
                }
            }
            if (console.trace) console.trace();
        }

        // Build the best logging method possible for this env
        // Wherever possible we want to bind, not wrap, to preserve stack traces
        function realMethod(methodName) {
            if (methodName === 'debug') {
                methodName = 'log';
            }

            if (typeof console === undefinedType) {
                return false; // No method possible, for now - fixed later by enableLoggingWhenConsoleArrives
            } else if (methodName === 'trace' && isIE) {
                return traceForIE;
            } else if (console[methodName] !== undefined) {
                return bindMethod(console, methodName);
            } else if (console.log !== undefined) {
                return bindMethod(console, 'log');
            } else {
                return noop;
            }
        }

        // These private functions always need `this` to be set properly

        function replaceLoggingMethods(level, loggerName) {
            /*jshint validthis:true */
            for (var i = 0; i < logMethods.length; i++) {
                var methodName = logMethods[i];
                this[methodName] = (i < level) ?
                    noop :
                    this.methodFactory(methodName, level, loggerName);
            }

            // Define log.log as an alias for log.debug
            this.log = this.debug;
        }

        // In old IE versions, the console isn't present until you first open it.
        // We build realMethod() replacements here that regenerate logging methods
        function enableLoggingWhenConsoleArrives(methodName, level, loggerName) {
            return function () {
                if (typeof console !== undefinedType) {
                    replaceLoggingMethods.call(this, level, loggerName);
                    this[methodName].apply(this, arguments);
                }
            };
        }

        // By default, we use closely bound real methods wherever possible, and
        // otherwise we wait for a console to appear, and then try again.
        function defaultMethodFactory(methodName, level, loggerName) {
            /*jshint validthis:true */
            return realMethod(methodName) ||
                   enableLoggingWhenConsoleArrives.apply(this, arguments);
        }

        function Logger(name, defaultLevel, factory) {
          var self = this;
          var currentLevel;
          var storageKey = "loglevel";
          if (name) {
            storageKey += ":" + name;
          }

          function persistLevelIfPossible(levelNum) {
              var levelName = (logMethods[levelNum] || 'silent').toUpperCase();

              if (typeof window === undefinedType) return;

              // Use localStorage if available
              try {
                  window.localStorage[storageKey] = levelName;
                  return;
              } catch (ignore) {}

              // Use session cookie as fallback
              try {
                  window.document.cookie =
                    encodeURIComponent(storageKey) + "=" + levelName + ";";
              } catch (ignore) {}
          }

          function getPersistedLevel() {
              var storedLevel;

              if (typeof window === undefinedType) return;

              try {
                  storedLevel = window.localStorage[storageKey];
              } catch (ignore) {}

              // Fallback to cookies if local storage gives us nothing
              if (typeof storedLevel === undefinedType) {
                  try {
                      var cookie = window.document.cookie;
                      var location = cookie.indexOf(
                          encodeURIComponent(storageKey) + "=");
                      if (location !== -1) {
                          storedLevel = /^([^;]+)/.exec(cookie.slice(location))[1];
                      }
                  } catch (ignore) {}
              }

              // If the stored level is not valid, treat it as if nothing was stored.
              if (self.levels[storedLevel] === undefined) {
                  storedLevel = undefined;
              }

              return storedLevel;
          }

          /*
           *
           * Public logger API - see https://github.com/pimterry/loglevel for details
           *
           */

          self.name = name;

          self.levels = { "TRACE": 0, "DEBUG": 1, "INFO": 2, "WARN": 3,
              "ERROR": 4, "SILENT": 5};

          self.methodFactory = factory || defaultMethodFactory;

          self.getLevel = function () {
              return currentLevel;
          };

          self.setLevel = function (level, persist) {
              if (typeof level === "string" && self.levels[level.toUpperCase()] !== undefined) {
                  level = self.levels[level.toUpperCase()];
              }
              if (typeof level === "number" && level >= 0 && level <= self.levels.SILENT) {
                  currentLevel = level;
                  if (persist !== false) {  // defaults to true
                      persistLevelIfPossible(level);
                  }
                  replaceLoggingMethods.call(self, level, name);
                  if (typeof console === undefinedType && level < self.levels.SILENT) {
                      return "No console available for logging";
                  }
              } else {
                  throw "log.setLevel() called with invalid level: " + level;
              }
          };

          self.setDefaultLevel = function (level) {
              if (!getPersistedLevel()) {
                  self.setLevel(level, false);
              }
          };

          self.enableAll = function(persist) {
              self.setLevel(self.levels.TRACE, persist);
          };

          self.disableAll = function(persist) {
              self.setLevel(self.levels.SILENT, persist);
          };

          // Initialize with the right level
          var initialLevel = getPersistedLevel();
          if (initialLevel == null) {
              initialLevel = defaultLevel == null ? "WARN" : defaultLevel;
          }
          self.setLevel(initialLevel, false);
        }

        /*
         *
         * Top-level API
         *
         */

        var defaultLogger = new Logger();

        var _loggersByName = {};
        defaultLogger.getLogger = function getLogger(name) {
            if (typeof name !== "string" || name === "") {
              throw new TypeError("You must supply a name when creating a logger.");
            }

            var logger = _loggersByName[name];
            if (!logger) {
              logger = _loggersByName[name] = new Logger(
                name, defaultLogger.getLevel(), defaultLogger.methodFactory);
            }
            return logger;
        };

        // Grab the current global log variable in case of overwrite
        var _log = (typeof window !== undefinedType) ? window.log : undefined;
        defaultLogger.noConflict = function() {
            if (typeof window !== undefinedType &&
                   window.log === defaultLogger) {
                window.log = _log;
            }

            return defaultLogger;
        };

        defaultLogger.getLoggers = function getLoggers() {
            return _loggersByName;
        };

        return defaultLogger;
    }));
    });

    const ID = () => new Date().getTime().toString(32) + Math.random().toString(32).substr(2,7);
    const timestamp = () => new Date().toISOString();

    /**
     * Introduces an abstraction layer around the RTCPeerConnection.
     * It uses a predefined signalling mechanism, handles common problems (short-time state errors, race-conditions) and
     * comfort functions (like accepting media-streams and transforming them into tracks or transceivers)
     * */
    class Connection extends Listenable() {

        /**
         * create a new connection object which connects 2 users
         * @param config
         * @param config.id [string=(autogenerated)] any sort of unique identifier, defaults to a random alphanumeric string
         * @param config.peer [string=null] the name or id of the other endpoint of this connection
         * @param config.name [string=null] the name of the user that is on this endpoint of the connection
         * @param config.signaler [Signaler] the signaling connection to use
         * @param config.iceServers [array=[]] a list of ice servers to use to establish the connection
         * @param config.useUnifiedPlan [boolean=true] strongly recommended to not set this to false, Plan B semantic is deprecated and will not work with every funciton
         * @param config.isYielding [boolean=false]
         * @param config.verbose [boolean=false] set to true to log the steps in the signalling and media handling process
         * @param config.logger [Logger=loglevel] a logger to be used. Can be the widely used console object, defaults to an instance of the loglevel library
         * */
        constructor({id = ID(), peer = null, name = null, signaler, iceServers = [], useUnifiedPlan = true, isYielding = undefined, verbose = false, logger=loglevel} = {}) {
            super();
            this._signaler = signaler;
            this._connectionConfig = {iceServers, sdpSemantics: useUnifiedPlan ? 'unified-plan' : 'plan-b'};
            this._id = id;
            this._peer = peer;
            this._name = name || this._id;
            this._signaler.addEventListener('message', e => this._handleSignallingMessage(e.data));
            this._verbose = verbose;
            this._isYielding = isYielding === undefined ? (this._name ? this._name.localeCompare(this._peer) > 0 : false) : isYielding;
            this._offering = false;
            this._receivedStreams = [];
            this._receivedTracks = [];
            this._addedTracks = [];
            this._logger = logger;
            this._setupPeerConnection();
        }

        /**
         * @readonly
         * the id of the connection
         * */
        get id() {
            return this._id;
        }

        /**
         * @readonly
         * the peer id which is the other endpoint of the connection
         * */
        get peer() {
            return this._peer;
        }

        /**
         * is logging enabled?
         * */
        get verbose() {
            return this._verbose;
        }

        /**
         * enable / disable logging
         * */
        set verbose(makeVerbose) {
            this._verbose = !!makeVerbose;
        }

        /**
         * @private
         * Initiate all objects by registering the necessary event listeners
         */
        _setupPeerConnection() {
            this._connection = new RTCPeerConnection(this._connectionConfig);
            this._connection.addEventListener('icecandidate', e => this._forwardIceCandidate(e.candidate));
            this.addEventListener('negotiationneeded', () => this._startHandshake());
            this._connection.addEventListener('iceconnectionstatechange', () => this._handleIceChange());
            this._connection.addEventListener('track', ({track, streams}) => this._handleIncomingTrack(track, streams));
            if (this._verbose) this._logger.log('created new peer connection (' + this._id + ') using ' + (this._connectionConfig.sdpSemantics === 'unified-plan' ? 'the standard' : 'deprecated chrome plan b') + ' sdp semantics');
        }

        /**
         * @private
         * event handler that adds a newly received track to the list of received tracks, if it does not exist already.
         * Also checks, if a new Stream was added with the given track and adds this one, if necessary
         * */
        _handleIncomingTrack(track, streams) {
            const newStreams = [];
            this.dispatchEvent('trackadded', [track]);
            streams.forEach(stream => {
                if (this._receivedStreams.findIndex(s => s.id === stream.id) === -1) {
                    this._receivedStreams.push(stream);
                    newStreams.push(stream);
                    this.dispatchEvent('streamadded', [stream]);
                }
            });
            this._receivedTracks.push(track);
            this.dispatchEvent('mediachanged', [{change: 'added', track, streams, peer: this._peer}]);
            track.addEventListener('ended', () => {
                this._receivedTracks = this._receivedTracks.filter(t => t.id !== track.id);
                this.dispatchEvent('mediachanged', [{change: 'removed', track, peer: this._peer}]);
                this.dispatchEvent('trackremoved', [track]);
                streams.forEach(stream => {
                    if (!stream.active) {
                        this._receivedStreams = this._receivedStreams.filter(s => s.id !== stream.id);
                        this.dispatchEvent('streamremoved', [stream]);
                    }
                });
            });
            this.dispatchEvent('mediachanged', [{change: 'added', track, streams, newStreams, peer: this._peer}]);
        }


        _forwardIceCandidate(candidate) {
            if (candidate !== null) {
                this._signaler.send({
                    receiver: this._peer,
                    data: candidate,
                    sent: timestamp(),
                    type: 'ice'
                });
            }
        }

        /**
         * @private
         * handles incoming signalling messages
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
            }else{
                if(this._verbose) this._logger.log('could not find handle for msg type',type,msg);
            }
        }


        /**
         * @private
         * starts an attempt to establish a new peer connection to the other endpoint
         * */
        async _startHandshake(){
            try{
                this._offering = true;
                const offer = await this._connection.createOffer();
                if(this._connection.signalingState !== "stable") return;
                if (this._verbose) this._logger.log('set local description on connection ' + this._id + ':', this._connection.localDescription);
                await this._connection.setLocalDescription(offer);
                const msg = {
                    receiver: this._peer,
                    data: offer,
                    type: 'sdp',
                    sent: timestamp()
                };
                this._signaler.send(msg);
            }catch(err){
                this._logger.error(err);
            }finally{
                this._offering = false;
            }
        }

        async _handleRemoteIceCandidate(candidate) {
            if (candidate !== null) await this._connection.addIceCandidate(candidate);
        }

        /**
         * @private
         * handles incoming sdp messages by either setting or ignoring them (in case of a glare situation where this endpoint waits for the other sites answer)
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
                    this._signaler.send({type: 'sdp', receiver: this._peer, data: this._connection.localDescription, sent: timestamp()});
                }
            } catch (err) {
                this._logger.error(err);
            }
        }


        /**
         * @private
         * adds a media track to the connection, but with more options than addTrack, since transceiver based
         * @param track [MediaStreamTrack|MediaStreamTrackKind] what kind of media should be added
         * @param streams [Array|RTCTransceiverConfig] allows passing either the array of streams associated with this track or a config object
         * */
        _addTrackToConnection(track, streams = []) {
            this._addedTracks.push(track);
            if (this._verbose) this._logger.log('add track to connection ' + this._id, track);
            const config = {
                direction: "sendonly",
                streams
            };
            this._connection.addTransceiver(track, streams instanceof Array ? config : streams);
        }

        /**
         * @private
         * remove a transceiver for a track to a connection
         * Does not handle invalid or any kind of input, only the specified
         * track [MediaStreamTrack|string] the track or trackKind (a string equal to "video", "audio" or "*", case sensitive)
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
                            sent: timestamp()
                        });
                        removed++;
                    }
                }
            });
            if (this._verbose) this._logger.log('removed ' + removed + ' tracks from connection ' + this._id);
        }

        /**
         * @private
         * handles the missing stop call to transceivers in chrome by stopping the track on the remote side instead.
         * This method is called on the remote side
         * */
        _stopReceiver(mid){
            this._connection.getTransceivers().filter(tr => tr.mid === mid).map(tr => tr.receiver.track).forEach(track=> {
                track.stop();
                // we have to stop the track, since Chrome misses the transceiver.stop() implementation,
                // but calling stop will not fire the ended event, so we have to fire it instead...
                track.dispatchEvent(new Event('ended'));
            });
        }

        /**
         * @private
         * replaces a track or every track of a matching type with the given replacement track
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
                    }
                }
            });
        }

        /**
         * @private
         * mutes a given track or all tracks of the matching kind
         * @param track [MediaStreamTrack|MediaStreamTrackKind|'*']
         * @param muted [boolean=true] if set to false, this method unmutes a previously muted track
         * */
        _muteTrack(track, muted=true){
            const searchingActualTrack = track instanceof MediaStreamTrack;
            const searchingTrackKind = typeof track === "string" && (['audio', 'video', '*'].indexOf(track) >= 0);
            this._connection.getTransceivers().forEach(transceiver => {
                if((searchingActualTrack && transceiver.sender.track.id === track.id) || (searchingTrackKind && (track === '*' || transceiver.sender.track.kind === track))){
                    if(muted){
                        if(!transceiver.sender._muted){
                            transceiver.sender._muted = transceiver.sender.track;
                            transceiver.sender.replace(null);
                        }
                    }else{
                        if(transceiver.sender._muted){
                            transceiver.sender.replace(transceiver.sender._muted);
                            delete transceiver.sender['_muted'];
                        }
                    }
                }
            });
        }

        /**
         * @private
         * reacts to ice state changes. this is either used to detect disconnection or ice gathering problems and react accordingly
         * (by setting the state to closed or restart the ice process)
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

        /**
         * add media to the connection
         * @param trackOrKind [MediaStreamTrack|string] a track or its kind
         * @param streamsOrTransceiverConfig [Array|RTPTransceiverConfig]
         * */
        /**
         * add media to the connection
         * @param media [MediaStream|MediaStreamTrack|MediaStreamConstraints] a MediaStream, which tracks will be added, a single MediaStreamTrack, which will be added or the MediaStreamConstraints, which will be used to retrieve the local MediaStreamTracks
         * */
        async addMedia(media) {
            if (arguments.length === 2) {
                this._addTrackToConnection(arguments[0], arguments[1]);
            } else {
                if (media instanceof MediaStream) {
                    media.getTracks().forEach(track => this._addTrackToConnection(track, [media]));
                } else if (media instanceof MediaStreamTrack) {
                    this._addTrackToConnection(media, [new MediaStream([media])]);
                } else if (typeof media === "string" && ["audio", "video", "*"].indexOf(media) >= 0) {
                    this._addTrackToConnection(media, new MediaStream([]));
                } else if (media instanceof Object && (media.audio || media.video)) {
                    const stream = await navigator.mediaDevices.getUserMedia(media);
                    stream.getTracks().forEach(track => this._addTrackToConnection(track, [stream]));
                } else {
                    this._logger.error('unknown media type', typeof media, media);
                }
            }
        }

        /**
         * removes the given media from the connection
         * @param media [MediaStream|MediaStreamTrack|MediaStreamTrackKind|undefined]
         * allows to resume all media from the given stream or stream description ("audio" removing all tracks of kind audio, no argument or '*' removing all media)
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
         * @readonly
         * All non-muted received tracks of the given connection
         * */
        get tracks() {
            return this._receivedTracks;
        }

        /**
         * @readonly
         * All active received streams of the given connection
         * */
        get streams() {
            return this._receivedStreams.filter(stream => stream.active);
        }

        /**
         * @readonly
         * all locally added tracks of the given connection
         * */
        get addedTracks(){
            return this._addedTracks;
        }

        /**
         * @private
         * handles the command of the remote side to shut down the connection
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
                type: 'connection:close',
                sent: timestamp()
            };
            this._signaler.send(msg);
            this._connection.close();
            this.dispatchEvent('close');
        }

        /**
         * Is the connection closed or still open
         * */
        get closed() {
            return this._connection.connectionState === "closed" || this._connection.signalingState === "closed";
        }

    }

    var ConnectionWithRollback = Connection;

    class ConnectionManager extends Listenable(){

        /**
         * create a new peer connection manager who handles everything related to transmitting media via RTCPeerConnections
         * */
        constructor({name = null, signaler, iceServers = [{"urls": "stun:stun1.l.google.com:19302"}], useUnifiedPlan = true, verbose = false, isYielding = undefined} = {}){
            super();
            this._signaler = signaler;
            this._verbose = verbose;
            this.connections = {};
            this.localMediaStreams = [];
            this._signaler.addEventListener('message', e => {
                let msg = e.data;
                switch(msg.type){
                    case "user:connected":
                        if(this._verbose) console.log('new user connected', msg.data);
                        this.connections[msg.data] = new ConnectionWithRollback({peer: msg.data, name, iceServers, signaler: this._signaler, useUnifiedPlan, isYielding, verbose});
                        this.dispatchEvent('userconnected', [msg.data]);
                        this._forwardEvents(this.connections[msg.data]);
                        this.localMediaStreams.forEach(stream => this.connections[msg.data].addMedia(stream));
                        break;
                    case "user:disconnected":
                        if(this._verbose) console.log('user disconnected', msg.data);
                        delete this.connections[msg.data];
                        this.dispatchEvent('userdisconnected', [msg.data]);
                        break;
                    case "user:list":
                        if(this._verbose) console.log('list of users received', msg.data);
                        msg.data.filter(u => !this.connections[u]).forEach(u => {
                            this.connections[u] = new ConnectionWithRollback({peer: u, name, iceServers, signaler: this._signaler, useUnifiedPlan, isYielding, verbose});
                            if(this._verbose) console.log('new user (of list) connected', u);
                            this.dispatchEvent('userconnected', [u]);
                            this._forwardEvents(this.connections[u]);
                            this.localMediaStreams.forEach(stream => this.connections[u].addMedia(stream));
                        });
                        break;
                }
            });
        }

        _forwardEvents(connection){
            connection.addEventListener('mediachanged', e => this.dispatchEvent('mediachanged', [e]));
            connection.addEventListener('streamadded', stream => this.dispatchEvent('streamadded', [stream, connection.peer]));
            connection.addEventListener('streamremoved', stream => this.dispatchEvent('streamremoved', [stream, connection.peer]));
            connection.addEventListener('trackadded', track => this.dispatchEvent('trackadded', [track, connection.peer]));
            connection.addEventListener('trackremoved', track => this.dispatchEvent('trackremoved', [track, connection.peer]));
            connection.addEventListener('close', () => this.dispatchEvent('connectionclosed', [connection.peer]));
        }

        /**
         * @readonly
         * the ids of the registered / known users as a list
         * */
        get users(){
            return Object.keys(this.connections);
        }

        /**
         * @param id [string] the id of the user
         * @return [Connect|null] a connection or null, if none exists at the time
         * */
        get(id){
            return this.connections[id] || null;
        }

        /**
         * @readonly
         * get all remote media streams
         * @returns Array of MediaStreams
         * */
        get remoteMediaStreams(){
            return Object.values(this.connections).map(connection => connection.streams || []).reduce((all, streams) => all.concat(streams));
        }

        /**
         * adds media to the connections
         * */
        addMedia(media){
            if(media instanceof MediaStream){
                if(this._verbose) console.log('added media stream');
                this.localMediaStreams.push(media);
                Object.values(this.connections).forEach(con => con.addMedia(media));
            }else{
                if(this._verbose) console.log('added media stream track');
                const stream = new MediaStream([media]);
                this.localMediaStreams.push(stream);
                Object.values(this.connections).forEach(con => con.addMedia(media));
            }
        }

        removeMedia(){
            if(arguments.length === 0){
                if(this._verbose) console.log('removed all media');
                this.localMediaStreams = [];
                Object.values(this.connections).forEach(con => con.removeMedia());
            }else{
                if(this._verbose) console.log('remove single media stream');
                this.localMediaStreams = this.localMediaStreams.filter(s => s.id !== arguments[0].id);
                Object.values(this.connections).forEach(con => con.removeMedia(arguments[0]));
            }
        }

        close(){
            this._signaler.close();
            Object.values(this.connections).forEach(con => con.close());
        }

        forEach(fn){
            Object.values(this.connections).forEach(fn);
        }

    }

    var ConnectionManager_1 = ConnectionManager;

    class SpeechDetection{

        /**
         * creates a speech (or noise) detector,
         * which checks which given Streams are currently loud enough for typical human speech
         * (most parts of this were directly taken or inspired by hark.js https://github.com/latentflip/hark/)
         * @param config [object]
         * @param config.treshold [number=-70] a dBFS measure. Positive numbers will be made negative
         * @param config.samplingInterval [number=100] milliseconds between samples. Higher sample rate equals earlier detection but also more cpu cost
         * @param config.smoothingConstant [number=0.1] smoothes input to avoid peaks, set values with caution
         * @param config.requiredSamplesForSpeech [number=5] on how many consecutive samples must be a dBFS value over treshold to be considered speech
         * @param config.debug [boolean=false] logging on events if true
         * */
        constructor({threshold=-70, samplingInterval=100, smoothingConstant=0.1, requiredSamplesForSpeech=5, debug=false} = {}){
            this._smoothingConstant = 0.1;
            this._samplingInterval = 100; //ms
            this._treshold = -Math.abs(threshold);
            this.requiredSamplesForSpeech = 3;
            this._in = {};
            this._out = {};
            this._context = new AudioContext();
            this._onSpeechStartByStream = () => {};
            this._onSpeechEndByStream = () => {};
            this._onSpeechStart = () => {};
            this._onSpeechEnd = () => {};
            this._onSpeakerChange = () => {};
            this._lastSpeakers = [];
            this._silence = true;
            this._debug = debug;
            this._analyzerLoop = setInterval(() => {
                Object.keys(this._in).forEach(this._processForEachUser.bind(this));
                const currentSpeakers = Object.keys(this._out).reduce((speakers, id) => this._getStatsFor(id).speaking ? speakers.concat(id) : speakers, []).sort();
                const currentLength = currentSpeakers.length;
                const lastLength = this._lastSpeakers.length;
                const change = currentLength !== lastLength || !currentSpeakers.reduce((allSame, id, i) => currentSpeakers[i] === this._lastSpeakers[i] ? allSame : false, true);
                const speechEnd = currentLength === 0 && lastLength > 0;
                const speechStart = currentLength > 0 && lastLength === 0;
                if(speechStart){
                    if(this._debug) console.log('speech start');
                    this._onSpeechStart(currentSpeakers);
                    this._silence = false;
                }
                if(speechEnd){
                    if(this._debug) console.log('speech end');
                    this._onSpeechEnd(currentSpeakers);
                    this._silence = true;
                }
                if(change){
                    if(this._debug) console.log('speakers changed', currentSpeakers, this._lastSpeakers);
                    this._onSpeakerChange(currentSpeakers, this._lastSpeakers.slice());
                }
                this._lastSpeakers = currentSpeakers;
            }, this._samplingInterval);
        }

        /**
         * @param v [number] decibel (dBFS) value set as treshold for sound, non negative values will be made negative
         * */
        set treshold(v){
            this.treshold = -Math.abs(v);
        }

        /**
         * the current treshold for a stream to be considered not silent
         * */
        get treshold(){
            return this.treshold;
        }

        /**
         * @readonly
         * current stats by each registered stream
         * */
        get out(){
            return Object.assign({}, this._out);
        }

        /**
         * @readonly
         * if all registered streams are silent
         * */
        get silence(){
            return this._silence;
        }

        /**
         * @readonly
         * a list of the latest speakers (empty when no one spoke since the last sample)
         * */
        get speakers(){
            return this._lastSpeakers
        }

        _getStatsFor(id){
            if(!this._out[id]) this._out[id] = {consecutiveSamplesOverTreshold: 0, speaking: false, current: null};
            return this._out[id];
        }

        /**
         * add a stream to the current detection process
         * @param stream [MediaStream] a media stream to add (not checked, if it contains audio tracks at the current time or not)
         * @param id an id to reference the stream and its results
         * */
        addStream(stream, id){
            const analyzer = this._context.createAnalyser();
            analyzer.fftSize = 512;
            analyzer.smoothingTimeConstant = this._smoothingConstant;
            const fftBins = new Float32Array(analyzer.frequencyBinCount);
            const source = this._context.createMediaStreamSource(stream);
            source.connect(analyzer);
            this._in[id] = {analyzer, fftBins, source, stream};
        }

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

        _processForEachUser(id){
            const output = this._getStatsFor(id);
            const stats = this._analyzeVolume(this._in[id].analyzer, this._in[id].fftBins);
            output.current = stats;
            if(stats.maxVolume > this._treshold){
                output.consecutiveSamplesOverTreshold++;
                if(output.consecutiveSamplesOverTreshold > this.requiredSamplesForSpeech){
                    output.speaking = true;
                    this._onSpeechStartByStream(id);
                }
            }else{
                output.consecutiveSamplesOverTreshold = 0;
                if(output.speaking){
                    output.speaking = false;
                    this._onSpeechEndByStream(id);
                }
            }
        }

        static _checkCb(cb){
            if(typeof cb !== "function") throw new Error('Callback must be a function');
        }

        /**
         * callback triggers when any stream switches from silent to speaking,
         * the id of the stream is given to the callback function
         * @param cb [function]
         * */
        onSpeechStartByStream(cb){
            SpeechDetection._checkCb(cb);
            this._onSpeechStartByStream = cb;
        }

        /**
         * callback triggers when any stream switches from speaking to silent,
         * the id of the stream is given to the callback function
         * @param cb [function]
         * */
        onSpeechEndByStream(cb){
            SpeechDetection._checkCb(cb);
            this._onSpeechEndByStream = cb;
        }

        /**
         * callback triggers, when no one was speaking and now one stream went from silence to speaking.
         * The callback receives a list of ids of streams which are not silent any more
         * @param cb [function]
         * */
        onSpeechStart(cb){
            SpeechDetection._checkCb(cb);
            this._onSpeechStart = cb;
        }

        /**
         * callback triggers, when the last not silent stream goes silent
         * @param cb [function]
         * */
        onSpeechEnd(cb){
            SpeechDetection._checkCb(cb);
            this._onSpeechEnd = cb;
        }

        /**
         * callback triggers, as soon as another stream goes from silent to speaking or vice versa
         * */
        onSpeakerChange(cb){
            SpeechDetection._checkCb(cb);
            this._onSpeakerChange = cb;
        }
    }

    var SpeechDetection_1 = SpeechDetection;

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
     * */
    var Signaler_1 = class Signaler extends Listenable(){

        /**
         * construct a new signaller
         * @param endpoint [string] URL or connection string to connect the signaler client to the server
        * */
        constructor({endpoint} = {}){
            super();
            this._connection = new WebSocket(arguments.length && typeof arguments[0] === "string" ? arguments[0] : endpoint);
            this._queued = [];
            this._connection.addEventListener('open', () => this._queued.forEach(msg => this._connection.send(msg)));
            this._connection.addEventListener('message', e => this.dispatchEvent('message', [{type: 'message', data: JSON.parse(e.data)}]));
            this._connection.addEventListener('close', () => this.dispatchEvent('close', []));
        }

        /**
         * sends messages, if not closed
         * @param msg [serializable]
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
         * @readonly checks if the connection is closed (this means: no messages can be sent)
         * @returns boolean
         * */
        get closed(){
            return this._connection.readyState > 1;
        }

    };

    var TunnelSignaler = Tunnel => ({
        send: msg => {
            Tunnel.doExport('message', msg);
        },
        addEventListener: (_, cb) => {
            if(_.toLowerCase() !== 'message') return;
            Tunnel.onImport('message', function(data){
                const e = {type: 'message', data};
                cb(e);
            });
        }
    });

    /**
     * @private
     * @param n [UInt] the positive integer to factor
     * @return array of tuples of factoring numbers, unique (only a,b but not a,b and b,a) and sorted biggest factors first
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
     * Places Streams in a grid
     * */
    class Grid extends VideoMixingConfiguration_1{

        /**
         * Creates a grid of videos, which works best for square numbers but also for numbers which can be factored by a and b with |a-b| <= 2
         * Everything else seemed to look bad
         * @param priority [int=0]
         * @param applicable [function=differenceBetweenTwoBiggestFactors(ids.length) <= 2]
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
     * */
    class Middle extends VideoMixingConfiguration_1{

        /**
         * create a grid of streams where one stream (the last one) is in the middle
         * @param priority [int=0]
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
     * */
    class Line extends VideoMixingConfiguration_1{

        /**
         * creates a new Line Mixing config for less than 3 persons
         * @param priority [int=0]
         * @param applicable [ids => ids.length < 3]
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
        VideoMixer: VideoMixer_1,
        AudioMixer: AudioMixer_1,
        Transcriber: Transcriber_1,
        Connection: ConnectionWithRollback,
        ConnectionManager: ConnectionManager_1,
        SpeechDetection: SpeechDetection_1,
        VideoMixingConfiguration: VideoMixingConfiguration_1,
        VideoMixingConfigurations: {
            Grid: Grid_1,
            Middle: Middle_1,
            Line: Line_1
        },
        wrapTunnelAsSignaler: TunnelSignaler
    };
    var MediaServerUtilities_1 = MediaServerUtilities.Signaler;
    var MediaServerUtilities_2 = MediaServerUtilities.VideoMixer;
    var MediaServerUtilities_3 = MediaServerUtilities.AudioMixer;
    var MediaServerUtilities_4 = MediaServerUtilities.Transcriber;
    var MediaServerUtilities_5 = MediaServerUtilities.Connection;
    var MediaServerUtilities_6 = MediaServerUtilities.ConnectionManager;
    var MediaServerUtilities_7 = MediaServerUtilities.SpeechDetection;
    var MediaServerUtilities_8 = MediaServerUtilities.VideoMixingConfiguration;
    var MediaServerUtilities_9 = MediaServerUtilities.VideoMixingConfigurations;
    var MediaServerUtilities_10 = MediaServerUtilities.wrapTunnelAsSignaler;

    exports.AudioMixer = MediaServerUtilities_3;
    exports.Connection = MediaServerUtilities_5;
    exports.ConnectionManager = MediaServerUtilities_6;
    exports.Signaler = MediaServerUtilities_1;
    exports.SpeechDetection = MediaServerUtilities_7;
    exports.Transcriber = MediaServerUtilities_4;
    exports.VideoMixer = MediaServerUtilities_2;
    exports.VideoMixingConfiguration = MediaServerUtilities_8;
    exports.VideoMixingConfigurations = MediaServerUtilities_9;
    exports.default = MediaServerUtilities;
    exports.wrapTunnelAsSignaler = MediaServerUtilities_10;

    return exports;

}({}));

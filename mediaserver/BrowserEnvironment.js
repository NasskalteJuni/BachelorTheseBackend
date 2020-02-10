const puppeteer = require('puppeteer');
const read = require('fs').readFileSync;
const Tunnel = require('./Tunnel.js');
const Listenable = require('../utils/Listenable.js');

/**
 *
 * */
class BrowserEnvironment extends Listenable(){

    static set debug(bool) {
        BrowserEnvironment._debug = bool;
    }

    static get debug() {
        return !!BrowserEnvironment._debug;
    }

    static _getPuppet() {
        if (!BrowserEnvironment._browser) {
            const isDebug = BrowserEnvironment.debug;
            const flags = ["--allow-insecure-localhost","--autoplay-policy=no-user-gesture-required","--no-user-gesture-required"];
            if(isDebug) flags.push("--webrtc-event-logging");
            return puppeteer.launch({headless: !isDebug, devtools: isDebug, args: flags}).then(browser => {
                BrowserEnvironment._browser = browser;
                return browser;
            });
        }
        return Promise.resolve(BrowserEnvironment._browser);
    }

    constructor(id, config = {}) {
        super();
        this._id = id;
        this._isInitialized = false;
        this._onInitializedCb = config["onInitialized"] ? config["onInitialized"] : () => {
        };
        this._pageTemplate = config["template"] || null;
        this._customScripts = config["scripts"] || [];
        this._globals = config["globals"] || {};
        this._ignoreScriptOrder = config["ignoreScriptOrder"] || false;
        this._errorHandler = err => console.error(err);
    }

    async init() {
        if (this._isInitialized) throw new Error('ALREADY INITIALIZED');
        try {
            // load up a new browser context
            this._instance = await (await BrowserEnvironment._getPuppet()).newPage();
            const handleScript = script => this._instance.addScriptTag(typeof script === "string" ? {path: script.startsWith("http") ? script : require.resolve(script)} : script);
            /*
            * 1. open a tunnel to communicate between inside the browser context and outside (here, in the node module)
            * 1. insert the media utils
            * 2. set the globals
            * 3. add custom scripts either in given order or any order, according to config.ignoreScriptOrder
            * 4. set the page template, if defined
            */
            this.Tunnel = new Tunnel(this);
            await this.Tunnel.open();
            await Promise.all(Object.keys(this._globals).map(globalName => {
                this._instance.evaluate((globalName, globalValue) => window[globalName] = globalValue, [globalName, this._globals[globalName]])
            }));
            if (this._ignoreScriptOrder) {
                await Promise.all(this._customScripts.map(handleScript));
            } else {
                for (let script of this._customScripts) await handleScript(script);
            }
            if (this._pageTemplate) await this._instance.setContent(read(this._pageTemplate, 'utf-8'));
            await this._instance.evaluate(title => document.title = title, this._id);
            this._isInitialized = true;
            this._onInitializedCb();
            this.dispatchEvent('initialized');
        } catch (err) {
            this._errorHandler(err);
            this.dispatchEvent('error');
        }
    }


    set onInitialized(cb) {
        this._onInitializedCb = cb;
        if (this._isInitialized) cb();
    }

    get isInitialized() {
        return this._isInitialized;
    }

    async destroy() {
        this.dispatchEvent('destroy');
        return this._instance.close();
    }

}

module.exports = BrowserEnvironment;

/**
 * @module middleware
 * adds the 'sendStatusMessage' method to every response, which
 * 1. acts like send
 * 2. sets a HTTP response status message and the HTTP body with the given message
 * */
module.exports = function(req, res, next){
    res.sendStatusMessage = function(str){
        this.statusMessage = str;
        this.send(str);
    };
    next();
};
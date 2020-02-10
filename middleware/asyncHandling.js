/**
 * @module middleware
 * Defines an async await wrapper that handles errors
 * to be used like this:
 * a = require('<this script>')
 * app.get(a(async(req, res) => ...))
 * */
module.exports = handler => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(err => {
        console.error(err);
        return next(new Error('Internal Server Error'));
    })
};
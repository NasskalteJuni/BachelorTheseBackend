/**
 * @module middleware
 * @function
 * defines an authentication check based on the express session and its 'user' and the respective 'user.id' attribute'
 * */
module.exports = (req, res, next) => {
        if(!req.session || !req.session.user || !req.session.user.id){
                return res.status(401).sendStatusMessage('NOT AUTHENTICATED');
        }
        next();
};

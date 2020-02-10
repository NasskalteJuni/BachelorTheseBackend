/**
 * @middleware
 * @function
 * Allows an permission check for authenticated users. Users can only perform actions for themselves, except when they are admins
 * */
module.exports = (req, res, next) => {
    if(req.session.user.id !== req.params.id && req.session.user.role !== 'admin'){
        return res.status(401).sendStatusMessage('NOT ALLOWED');
    }
    next();
};
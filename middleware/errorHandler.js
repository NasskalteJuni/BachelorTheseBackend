module.exports = (err, req, res, next) => {
    if(err.message && err.message.toLowerCase().indexOf('invalid csrf token') >= 0){
        // handle errors produced the csrf middle ware as auth errors
        res.status(403).sendStatusMessage('INVALID CSRF TOKEN');
    }else{
        // log everything else to find problems
        console.error(req.method+' '+req.originalUrl+': ', err.message);
        console.error(err.stack);
        res.status(500).sendStatusMessage('INTERNAL SERVER ERROR');
    }
};
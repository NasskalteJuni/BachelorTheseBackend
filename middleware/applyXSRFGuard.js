const csurf = require('csurf');

module.exports = app => {
    app.use(csurf({cookie: false}));
    app.get('/api/csrf', (req, res) => res.send(req.csrfToken()));
    app.use((req, res, next) => {
        res.header('X-CSRF-TOKEN', req.csrfToken());
        next();
    });
};
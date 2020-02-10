const config = require('./config.js');
const app = require('./app.js');
const sockets = require('./sockets/sockets.js');
const port = process.argv.slice(2)[0] || process.env.port || config.web.port || 8888;
const host = config.web.host || '127.0.0.1';
sockets.bind(app.listen(port, () => console.log('http://'+host+':'+port+'/')));

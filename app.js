const config = require('./config.js').web;
const express = require('express');
const app = express();
const applyXSRFGuard = require('./middleware/applyXSRFGuard.js');

// set application wide variables
app.set('trust proxy', config.behindProxy);

// load middleware & plugins
app.use(require('cookie-parser')());
app.use(require('./session/session.js'));
app.use(require('./middleware/sessionSocket.js'));
app.use(require('./middleware/sendStatusMessage.js'));
app.use(express.static(__dirname+'/public'));
app.use(express.json());
app.use(require('helmet')());
if(app.get('env') !== 'production') app.use(require('cors')({credentials: true, origin: (origin, callback) => callback(null, true)}));
applyXSRFGuard(app);


// import routes
app.use('/api', require('./routes/auth.js'));
app.use('/api', require('./routes/user.js'));
app.use('/api', require('./routes/room.js'));
app.use('/api', require('./routes/turn.js'));

module.exports = app;
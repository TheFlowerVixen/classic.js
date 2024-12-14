const Server = require('./modules/server.js').Server;

global.server = new Server();
global.server.startServer(25565);
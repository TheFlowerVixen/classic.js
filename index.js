const Server = require('./modules/server.js').Server;

Error.stackTraceLimit = Infinity;
global.server = new Server();
global.server.addSupportedExtension("ClickDistance", 1);
global.server.addSupportedExtension("CustomBlocks", 1);
global.server.addSupportedExtension("MessageTypes", 1);
global.server.addSupportedExtension("LongerMessages", 1);
global.server.startServer(25565);
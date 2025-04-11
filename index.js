const Server = require('classicjs/server').Server;

Error.stackTraceLimit = Infinity;
const server = new Server();
server.addSupportedExtension("ClickDistance", 1);
server.addSupportedExtension("CustomBlocks", 1);
server.addSupportedExtension("MessageTypes", 1);
server.addSupportedExtension("LongerMessages", 1);
server.addSupportedExtension("ChangeModel", 1);
server.addSupportedExtension("FullCP437", 1);
server.addSupportedExtension("EnvMapAspect", 2);
server.addSupportedExtension("ExtPlayerList", 2);
server.addSupportedExtension("HackControl", 1);
server.addSupportedExtension("EnvWeatherType", 1);
server.addSupportedExtension("PlayerClick", 1);
server.startServer();
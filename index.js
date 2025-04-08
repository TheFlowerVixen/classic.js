const Server = require('classicjs/server').Server;

Error.stackTraceLimit = Infinity;
global.server = new Server();
global.server.addSupportedExtension("ClickDistance", 1);
global.server.addSupportedExtension("CustomBlocks", 1);
global.server.addSupportedExtension("MessageTypes", 1);
global.server.addSupportedExtension("LongerMessages", 1);
global.server.addSupportedExtension("ChangeModel", 1);
global.server.addSupportedExtension("FullCP437", 1);
global.server.addSupportedExtension("EnvMapAspect", 2);
global.server.addSupportedExtension("ExtPlayerList", 2);
global.server.addSupportedExtension("HackControl", 1);
global.server.addSupportedExtension("EnvWeatherType", 1);
global.server.startServer(25565);
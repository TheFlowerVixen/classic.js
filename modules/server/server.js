const net = require('node:net');
const fs = require('fs');
const crypto = require('crypto');
const PacketType = require('../network/packet.js').PacketType;
const serializePacket = require('../network/stream.js').serializePacket;
const Player = require('./player.js').Player;
const Level = require('../game/level.js').Level;
const LevelProperties = require('../game/level.js').LevelProperties;
const Broadcaster = require('./broadcast.js').Broadcaster;
const FlatLevelGenerator = require('../game/generator/flat.js').FlatLevelGenerator;
const Entity = require('../game/entity.js').Entity;
const CommandResult = require('./command.js').CommandResult;
const getDefaultCommands = require('./command.js').getDefaultCommands;

const DefaultProperties = {
    serverName: "classic.js Server",
    motd: "A Nice Server",
    port: 25565,
    maxPlayers: 20,

    mainLevel: "main",
    autosaveInterval: 10,
    allowVanillaClients: true,
    //allowWebClients: true,

    broadcast: true,
    broadcastInterval: 45,
    broadcastURL: 'classicube.net',
    useHTTPS: true,
    public: false,
    verifyNames: true,
    listName: "classic.js Server",
}

const NotifyFlags = {
    None: 0,
    LocalOnly: 1,
    NotMe: 2
};

class Server
{
    constructor()
    {
        this.netServer = null;
        
        this.properties = this.loadProperties('properties.json');
        this.serverKey = this.loadServerKey('SERVER_KEY');
        this.players = [];
        this.entities = [];
        this.levels = this.loadLevels('levels');
        this.plugins = this.loadPlugins('plugins');
        this.supportedExtensions = [];
        this.broadcaster = new Broadcaster(this);

        this.heartbeatInterval = null;
        this.updateInterval = null;
        this.autosaveInterval = null;
        this.ticksRan = 0;
    }

    loadProperties(filePath)
    {
        var finalProperties = DefaultProperties;
        if (!fs.existsSync(filePath))
            fs.writeFileSync(filePath, JSON.stringify(finalProperties, null, 4));
        else
        {
            finalProperties = Object.assign(finalProperties, JSON.parse(fs.readFileSync(filePath)));
            fs.writeFileSync(filePath, JSON.stringify(finalProperties, null, 4));
        }
        return finalProperties;
    }

    loadServerKey(filePath)
    {
        var finalKey = Buffer.concat([crypto.randomBytes(32), crypto.randomBytes(16)]);
        if (!fs.existsSync(filePath))
        {
            fs.writeFileSync(filePath, finalKey);
            console.warn(`${filePath} was generated. (NOTE: Do NOT lose this file or your users will not be able to authenticate!)`);
        }
        else
            finalKey = fs.readFileSync(filePath);
        return finalKey;
    }

    loadLevels(dirPath)
    {
        if (!fs.existsSync(dirPath))
            fs.mkdirSync(dirPath);
        var dir = fs.readdirSync(dirPath);
        var levels = {};
        for (var fileName of dir)
        {
            var lvlName = fileName.split('.')[0];
            var lvl = new Level(lvlName);
            lvl.loadLevel();
            levels[lvlName] = lvl;
        }
        if (levels[this.properties.mainLevel] == undefined)
            this.createLevel(this.properties.mainLevel, 256, 64, 256);
        return levels;
    }

    loadPlugins(dirPath)
    {
        if (!fs.existsSync(dirPath))
            fs.mkdirSync(dirPath);
        var dir = fs.readdirSync(dirPath);
        var plugins = [];
        for (var fileName of dir)
        {
            var pluginName = fileName;
            try
            {
                const PluginClass = require(`../../${dirPath}/${fileName}`);
                var plugin = new PluginClass();
                pluginName = plugin.name;
                plugin.onLoad(this);
                plugins.push(plugin);
                console.log(`${plugin.name} loaded successfully`);
            }
            catch (error)
            {
                console.error(`Failed to load plugin ${pluginName}:`, error);
            }
        }
        return plugins;
    }

    unloadPlugins()
    {
        for (var plugin of this.plugins)
            plugin.onUnload(this);
        this.plugins = [];
    }

    reload()
    {
        this.unloadPlugins();
        this.plugins = this.loadPlugins('plugins');
    }

    getCipherKeys()
    {
        return [ this.serverKey.subarray(0, 32), this.serverKey.subarray(32, 48) ];
    }

    startServer()
    {
        this.netServer = net.createServer(this.onClientConnected);
        this.netServer.on('error', this.onServerError);
        this.netServer.on('close', this.onServerClosed);
        this.netServer.listen(this.properties.port, this.onServerReady);
        this.heartbeatInterval = setInterval(this.heartbeat.bind(this), 20 * 50);
        this.updateInterval = setInterval(this.update.bind(this), 50);
        this.autosaveInterval = setInterval(this.autosave.bind(this), this.properties.autosaveInterval * 20 * 50);
        if (this.properties.broadcast)
            this.broadcaster.startBroadcasting();
    }

    onServerReady()
    {
        var server = global.server;
        console.log(`Server "${server.properties.serverName}" ready`);
        server.fireEvent('server-ready', server);
    }

    onServerClosed()
    {
        var server = global.server;
        server.shutDownServer();
        server.fireEvent('server-closed', server);
    }

    onServerError(err)
    {
        var server = global.server;
        console.log(err);
        server.shutDownServer(1);
    }

    onClientConnected(socket)
    {
        var server = global.server;
        //console.log("Client connected, awaiting information...");
        socket.on('close', server.onClientDisconnected);
        var player = new Player(server, socket);
        server.fireEvent('player-connected', player);
    }

    onClientDisconnected(abrupt)
    {
        var server = global.server;
        for (var player of server.players)
        {
            if (this === player.socket)
            {
                // remove user
                server.removePlayer(player);
            }
        }
    }

    heartbeat()
    {
        for (var player of this.players)
        {
            if (player.isLoggedIn() && !player.isDisconnected())
                player.sendPacket(PacketType.ClientPing);
        }
    }

    update()
    {
        this.ticksRan++;
        for (var player of this.players)
        {
            if (player.isDisconnected())
            {
                // remove user, destroy socket
                player.socket.end();
                this.players.splice(this.players.indexOf(player), 1);
            }
            else if (!player.tickResponse())
            {
                player.disconnect('Timed out');
            }
            else
            {
                player.networkUpdate();
            }
        }
        for (var level of Object.values(this.levels))
        {
            level.update();
        }
        this.fireEvent('server-update', this);
    }

    autosave()
    {
        for (var level of Object.values(this.levels))
            level.saveLevel();
    }

    addPlayer(player)
    {
        var collisionPlayer = this.getPlayer(player.username);
        if (collisionPlayer != null)
            collisionPlayer.disconnect('Name collision (you were logged in elsewhere)');

        player.sendPacket(PacketType.Handshake, {
            protocolVersion: 0x07,
            name: this.properties.serverName,
            extra: this.properties.motd,
            supportByte: 0x0
        });
        player.assignEntity(this.createEntity(player.username));
        this.players.push(player);
    }

    removePlayer(player)
    {
        player.onDisconnect();
        this.players.splice(this.players.indexOf(player), 1);
    }

    sendExtensionInfo(player)
    {
        // info
        player.sendPacket(PacketType.ExtInfo, {
           software: "classic.js Alpha 0",
           extensionCount: 0 
        });
        for (var extension of this.supportedExtensions)
            player.sendPacket(PacketType.ExtEntry, extension);

        player.sendPacket(PacketType.CustomBlockSupportLevel, {
            supportLevel: 1
        });
    }

    sendPlayerToLevel(player, level)
    {
        if (this.levels[level] == undefined)
            return 1;
        else if (player.currentLevel === this.levels[level])
            return 2;
        else
            player.sendToLevel(this.levels[level]);
        return 0;
    }

    shutDownServer(exitCode)
    {
        var server = global.server;
        console.log('Server closed');
        for (var level of Object.values(server.levels))
            level.saveLevel();
        for (var player of server.players)
            player.disconnect('Server shutting down');
        server.unloadPlugins();
        server.netServer.close();
        process.exit(exitCode);
    }

    addSupportedExtension(extName, version)
    {
        this.supportedExtensions.push({extName: extName, version: version});
    }

    getPlayerCount()
    {
        return this.players.length;
    }

    getPlayer(username)
    {
        for (var player of this.players)
        {
            if (player.username == username)
                return player;
        }
        return null;
    }

    createEntity(name)
    {
        var id = 0;
        for (var entity of this.entities)
        {
            if (entity.entityID == id)
                id++;
            else
                break;
        }
        var entity = new Entity(id, name);
        this.entities.push(entity);
        return entity;
    }

    removeEntity(entity)
    {
        var entityIndex = this.entities.indexOf(entity);
        if (entityIndex > -1)
        {
            if (entity.level != null)
                entity.level.removeEntity(entity);
            this.entities.splice(entityIndex, 1);
        }
    }

    createLevel(name, sizeX, sizeY, sizeZ)
    {
        if (this.levels[name] != undefined)
            return false;
        var level = new Level(name, sizeX, sizeY, sizeZ);
        level.generateLevel(new FlatLevelGenerator([7, 1], [1, (sizeY / 2) - 4], [3, 2], [2, 1]));
        this.levels[name] = level;
        level.saveLevel();
        return true;
    }

    broadcastMessage(message, messageType)
    {
        for (var player of this.players)
            player.sendMessage(message, messageType);
    }

    getAllCommands()
    {
        var commands = [...getDefaultCommands()];
        for (var plugin of this.plugins)
        {
            for (var command of plugin.getCommands())
            {
                // Override default/other commands
                var override = false;
                for (var oldCmdIdx in commands)
                {
                    if (commands[oldCmdIdx].name == command.name)
                    {
                        commands[oldCmdIdx] = command;
                        override = true;
                        break;
                    }
                }
                if (!override)
                    commands.push(command);
            }
        }
        return commands;
    }

    doCommand(sender, commandName, args)
    {
        var result = CommandResult.NoSuchCommand;
        for (var command of this.getAllCommands())
        {
            if (command.name == commandName || command.aliases.indexOf(commandName) > -1)
                result = command.executor.bind(this)(sender, args);
        }
        if (result == CommandResult.InvalidArguments)
            sender.sendMessage(`Usage: ${command.usage.replace('<command>', command.name)}`);
        return result;
    }

    sendMessage(message)
    {
        console.log(message)
    }

    fireEvent(eventName, ...args)
    {
        var retValue = true;
        for (var plugin of this.plugins)
        {
            if (plugin.emit(eventName, ...args))
            {
                if (plugin.eventCancelled)
                {
                    plugin.eventCancelled = false;
                    retValue = false;
                }
            }
        }
        return retValue;
    }

    notify(func)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.isLoggedIn())
                func(otherPlayer);
        }
    }

    notifyLocal(level, func)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.isLoggedIn() && otherPlayer.currentLevel === level)
                func(otherPlayer);
        }
    }

    notifyOthers(player, func)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.isLoggedIn() && otherPlayer !== player)
                func(otherPlayer);
        }
    }

    notifyOthersLocal(player, level, func)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.isLoggedIn() && otherPlayer.currentLevel == level && otherPlayer !== player)
                func(otherPlayer);
        }
    }

    notifyPlayerConnected(player)
    {
        this.notifyOthers(player, (otherPlayer) => {
            otherPlayer.sendMessage(`&e${player.username} joined the game`);
        });
    }

    notifyPlayerDisconnected(player)
    {
        this.notifyOthers(player, (otherPlayer) => {
            otherPlayer.sendMessage(`&e${player.username} left the game`);
        });
    }
    
    notifyPlayerChangeLevel(player)
    {
        this.notifyOthers(player, (otherPlayer) => {
            player.sendPlayerListAdded(otherPlayer);
        });
    }

    notifyPlayerMessage(player, message, messageType)
    {
        this.notify((otherPlayer) => {
            if (player.localChat && otherPlayer.currentLevel === player.currentLevel)
                otherPlayer.sendMessage(`(LOCAL) <${player.username}> ${message}`);
            else
                otherPlayer.sendMessage(`<${player.username}> ${message}`);
        });
    }

    notifyEntityAdded(entity)
    {
        this.notifyOthersLocal(entity.player, entity.level, (otherPlayer) => {
            entity.sendEntityAdded(otherPlayer);
        });
    }

    notifyEntityRemoved(entity)
    {
        this.notifyOthersLocal(entity.player, entity.level, (otherPlayer) => {
            entity.sendEntityRemoved(otherPlayer);
        });
    }

    notifyEntityPosition(entity)
    {
        this.notifyOthersLocal(entity.player, entity.level, (otherPlayer) => {
            if (entity.position.posRotEquals(entity.lastPosition))
                return;
            entity.sendEntityPosition(otherPlayer);
        });
    }

    notifyEntityTeleport(entity)
    {
        this.notifyLocal(entity.level, (otherPlayer) => {
            entity.sendEntityPosition(otherPlayer);
        });
    }

    notifyEntityModelChange(entity, model)
    {
        this.notifyLocal(entity.level, (otherPlayer) => {
            if (otherPlayer.supportsExtension("ChangeModel", 1))
            {
                otherPlayer.sendPacket(PacketType.ChangeModel, {
                    entityID: entity.getIDFor(otherPlayer),
                    model: model
                });
            }
        });
    }

    notifyBlockPlaced(player, x, y, z, type)
    {
        this.notifyLocal(player.currentLevel, (otherPlayer) => {
            otherPlayer.sendPacket(PacketType.SetBlockServer, {
                posX: x,
                posY: y,
                posZ: z,
                blockType: otherPlayer.getPlayerSpecificBlock(type)
            });
        });
    }

    notifyBlockRemoved(player, x, y, z, type)
    {
        this.notifyLocal(player.currentLevel, (otherPlayer) => {
            otherPlayer.sendPacket(PacketType.SetBlockServer, {
                posX: x,
                posY: y,
                posZ: z,
                blockType: 0
            });
        });
    }

    notifyLevelWeatherChange(level, weather)
    {
        this.notifyLocal(level, (otherPlayer) => {
            if (otherPlayer.supportsExtension("EnvWeatherType", 1))
                otherPlayer.sendPacket(PacketType.EnvSetWeatherType, { weather: weather });
        });
    }

    notifyLevelTexturesChange(level, textures)
    {
        this.notifyLocal(level, (otherPlayer) => {
            if (otherPlayer.supportsExtension("EnvMapAspect", 2))
                otherPlayer.sendPacket(PacketType.SetMapEnvUrl, { url: textures });
        });
    }

    notifyLevelPropertyChange(level, propertyName, propertyValue)
    {
        this.notifyLocal(level, (otherPlayer) => {
            if (otherPlayer.supportsExtension("EnvMapAspect", 2))
            {
                var value = propertyValue;
                switch (propertyName) {
                    case 'sideBlockID':
                    case 'edgeBlockID':
                        value = otherPlayer.getPlayerSpecificBlock(value);
                        break;
                    
                    case 'cloudsSpeed':
                    case 'weatherSpeed':
                        value = value * 256;
                        break;
                    
                    case 'weatherFade':
                        value = value * 128;
                        break;
                    
                    case 'useExpFog':
                        value = value ? 1 : 0;
                        break;
                }
                otherPlayer.sendPacket(PacketType.SetMapEnvProperty, { propertyID: LevelProperties.indexOf(propertyName), propertyValue: value });
            }
        });
    }
}

module.exports = { Server };
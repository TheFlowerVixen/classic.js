// @ts-check

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
const DefaultCommands = require('./command.js').DefaultCommands;
const Console = require('./console.js').Console;
const ansiColorMessage = require('./console.js').ansiColorMessage;

const DefaultProperties = {
    serverName: "classic.js Server",
    motd: "A Nice Server",
    port: 25565,
    maxPlayers: 20,

    mainLevel: "main",
    autosaveInterval: 10,
    allowVanillaClients: true,
    requiredExtensions: [],
    //allowWebClients: true,

    broadcast: true,
    broadcastInterval: 45,
    broadcastURL: 'classicube.net',
    useHTTPS: true,
    public: false,
    verifyNames: true,
    listName: "classic.js Server",
}

class Server
{
    constructor()
    {
        this.netServer = null;
        
        this.players = [];
        this.entities = [];

        this.properties = {};
        this.serverKey = null;
        this.levels = {};
        this.plugins = [];
        this.commands = [];
        this.bans = [];
        this.loadServer();

        this.supportedExtensions = [];
        this.broadcaster = new Broadcaster(this);

        this.heartbeatInterval = null;
        this.updateInterval = null;
        this.autosaveInterval = null;
        this.ticksRan = 0;
    }

    loadServer()
    {
        this.properties = this.loadProperties('properties.json');
        this.serverKey = this.loadServerKey('SERVER_KEY');
        this.levels = this.loadLevels('levels');
        this.plugins = this.loadPlugins('plugins');
        this.commands = this.loadCommands();
        this.bans = this.loadBans('bans.json');
    }

    loadProperties(filePath)
    {
        var finalProperties = DefaultProperties;
        if (!fs.existsSync(filePath))
            fs.writeFileSync(filePath, JSON.stringify(finalProperties, null, 4));
        else
        {
            finalProperties = Object.assign(finalProperties, JSON.parse(fs.readFileSync(filePath).toString()));
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

    loadCommands()
    {
        var commands = [...DefaultCommands];
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

    loadBans(filePath)
    {
        var finalBans = [];
        if (!fs.existsSync(filePath))
            fs.writeFileSync(filePath, JSON.stringify(finalBans, null, 4));
        else
        {
            finalBans = JSON.parse(fs.readFileSync(filePath).toString());
            fs.writeFileSync(filePath, JSON.stringify(finalBans, null, 4));
        }
        return finalBans;
    }

    reload()
    {
        this.unloadPlugins();

        // Reload server
        this.loadServer();

        // Reload players
        for (var player of this.players)
        {
            player.loadUserData(`users/${player.username}.json`);
            player.currentLevel.sendLevelData(player, false);
        }
    }

    getCipherKeys()
    {
        if (this.serverKey != null)
            return [this.serverKey.subarray(0, 32), this.serverKey.subarray(32, 48)];
        return null;
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
        this.serverConsole = new Console();
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
        var id = 0;
        for (var player of server.players)
        {
            if (player.playerID == id)
                id++;
            else
                break;
        }
        var newPlayer = new Player(server, socket, id);
        server.fireEvent('player-connected', newPlayer);
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
        this.players.splice(this.players.indexOf(player), 1);
        if (player.isLoggedIn())
            // Don't know if this will ever happen
            player.disconnect('You were forcefully removed!');
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

    sendPlayerToLevel(player, level, resetPosition = true)
    {
        if (this.levels[level] == undefined)
            return 1;
        else if (player.currentLevel === this.levels[level])
            return 2;
        else
            player.sendToLevel(this.levels[level], resetPosition);
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
        fs.writeFileSync('bans.json', JSON.stringify(this.bans, null, 4));
        server.netServer.close();
        process.exit(exitCode);
    }

    banPlayer(player, reason)
    {
        if (this.isPlayerBanned(player))
            return false;
        var ban = {
            name: player.username,
            ip: player.socket.remoteAddress,
            reason: reason
        };
        this.bans.push(ban);
        console.log(this.bans);
        fs.writeFileSync('bans.json', JSON.stringify(this.bans, null, 4));
        player.disconnect(`You are banned from this server! Reason: ${reason}`);
        return true;
    }

    pardonPlayer(playerName)
    {
        for (var i = 0; i < this.bans.length; i++)
        {
            if (this.bans[i].name == playerName)
            {
                this.bans.splice(i, 1);
                fs.writeFileSync('bans.json', JSON.stringify(this.bans, null, 4));
                return true;
            }
        }
        return false;
    }

    isPlayerBanned(player)
    {
        for (var ban of this.bans)
        {
            if (ban.name == player.username || ban.ip == player.socket.remoteAddress)
                return true;
        }
        return false;
    }

    getBanReason(player)
    {
        for (var ban of this.bans)
        {
            if (ban.name == player.username || ban.ip == player.socket.remoteAddress)
                return ban.reason;
        }
        return "";
    }

    addSupportedExtension(extName, version)
    {
        if (!this.supportsExtension(extName, version))
        {
            this.supportedExtensions.push({ extName: extName, version: version });
            return true;
        }
        return false;
    }

    removeSupportedExtension(extName, version)
    {
        if (this.requiresExtension(extName, version))
            return false;
        if (this.supportsExtension(extName, version))
        {
            for (var i = 0; i < this.supportedExtensions.length; i++)
            {
                var extension = this.supportedExtensions[i];
                if (extension.extName == extName && extension.version == version)
                {
                    this.supportedExtensions.splice(i, 1);
                    return true;
                }
            }
        }
        return false;
    }

    supportsExtension(extName, version)
    {
        for (var extension of this.supportedExtensions)
        {
            if (extension.extName == extName && extension.version == version)
                return true;
        }
        return false;
    }

    addRequiredExtension(extName, version)
    {
        if (!this.supportsExtension(extName, version))
            return false;
        if (!this.requiresExtension(extName, version))
        {
            this.properties.requiredExtensions.push({ extName: extName, version: version });
            fs.writeFileSync('properties.json', JSON.stringify(this.properties, null, 4));
            return true;
        }
        return false;
    }

    removeRequiredExtension(extName, version)
    {
        if (!this.supportsExtension(extName, version))
            return false;
        if (this.requiresExtension(extName, version))
        {
            for (var i = 0; i < this.properties.requiredExtensions.length; i++)
            {
                var extension = this.properties.requiredExtensions[i];
                if (extension.extName == extName && extension.version == version)
                {
                    this.properties.requiredExtensions.splice(i, 1);
                    fs.writeFileSync('properties.json', JSON.stringify(this.properties, null, 4));
                    return true;
                }
            }
        }
        return false;
    }

    requiresExtension(extName, version)
    {
        for (var extension of this.properties.requiredExtensions)
        {
            if (extension.extName == extName && extension.version == version)
                return true;
        }
        return false;
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
        var newEntity = new Entity(id, name);
        this.entities.push(newEntity);
        return newEntity;
    }

    removeEntity(entity)
    {
        var entityIndex = this.entities.indexOf(entity);
        if (entityIndex > -1)
        {
            if (entity.player != null && entity.player.isLoggedIn())
                // Failsafe if a player entity is removed while logged in
                entity.player.disconnect('Your link has been severed!');
            else
            {
                if (entity.level != null)
                    entity.level.removeEntity(entity);
                this.entities.splice(entityIndex, 1);
            }
        }
    }

    getEntityByName(name)
    {
        for (var entity of this.entities)
        {
            if (entity.name == name)
                return entity;
        }
        return null;
    }

    getEntityByID(id)
    {
        for (var entity of this.entities)
        {
            if (entity.entityID == id)
                return entity;
        }
        return null;
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
        console.log(ansiColorMessage(message));
    }

    doCommand(sender, commandName, args)
    {
        var result = CommandResult.NoSuchCommand;
        var errorMessage = "";
        var usageMessage = "";
        for (var command of this.commands)
        {
            if (command.name == commandName || command.aliases.indexOf(commandName) > -1)
            {
                try
                {
                    usageMessage = command.usage.replace('<command>', command.name);
                    if (command.requiredRank != undefined)
                    {
                        if (sender.hasRank(command.requiredRank))
                            result = command.executor.bind(this)(sender, args);
                        else
                            result = CommandResult.NoPermission;
                    }
                    else
                        result = command.executor.bind(this)(sender, args);
                }
                catch (error)
                {
                    errorMessage = error.message;
                    console.error(error);
                    result = CommandResult.Error;
                }
            }
        }
        switch (result)
        {
            case CommandResult.InvalidArguments:
                sender.sendMessage(`Usage: ${usageMessage}`);
                break;
            
            case CommandResult.NoSuchCommand:
                sender.sendMessage('&cUnknown command - type /help for a list of commands');
                break;
            
            case CommandResult.NoPermission:
                sender.sendMessage('&cInsufficient permissions!');
                console.warn(`${sender.getName()} tried to run a command they didn't have permission to: ${commandName}`);
                break;
            
            case CommandResult.Error:
                sender.sendMessage(`&cAn error occurred running this command: ${errorMessage}`);
                break;
        }
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
            try
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
            catch (error)
            {
                console.error(`Error occurred firing event ${eventName}:`, error);
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
        this.notify(player.sendPlayerListAdded);
        this.notifyOthers(player, (otherPlayer) => {
            otherPlayer.sendMessage(`&e${player.username} joined the game`);
        });
    }

    notifyPlayerDisconnected(player)
    {
        this.notify(player.sendPlayerListRemoved);
        this.notifyOthers(player, (otherPlayer) => {
            otherPlayer.sendMessage(`&e${player.username} left the game`);
        });
    }
    
    notifyPlayerInfoUpdate(player)
    {
        this.notify(player.sendPlayerListAdded);
    }

    notifyPlayerMessage(player, message, messageType)
    {
        if (player.localChat)
        {
            this.notifyLocal((otherPlayer) => {
                otherPlayer.sendMessage(`(LOCAL) <${player.username}> ${message}`);
            });
        }
        else
        {
            this.notify((otherPlayer) => {
                otherPlayer.sendMessage(`<${player.username}> ${message}`);
            });
        }
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
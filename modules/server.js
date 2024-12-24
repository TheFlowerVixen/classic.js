const net = require('node:net');
const fs = require('fs');
const crypto = require('crypto');
const WebConsole = require('./webconsole.js').WebConsole;
const PacketType = require('./network/packet.js').PacketType;
const serializePacket = require('./network/stream.js').serializePacket;
const Player = require('./player.js').Player;
const Level = require('./level.js').Level;
const LevelProperties = require('./level.js').LevelProperties;
const Broadcaster = require('./broadcast.js').Broadcaster;
const FlatLevelGenerator = require('./generator/flat.js').FlatLevelGenerator;

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

class Server
{
    constructor()
    {
        this.netServer = null;
        
        this.properties = this.loadProperties('properties.json');
        this.serverKey = this.loadServerKey('SERVER_KEY');
        this.players = [];
        this.levels = this.loadLevels('levels');
        this.plugins = [];
        this.supportedExtensions = [];
        this.broadcaster = new Broadcaster(this);
        this.webConsole = new WebConsole();

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
        this.webConsole.openConsole();
    }

    onServerReady()
    {
        var server = global.server;
        console.log(`Server "${server.properties.serverName}" ready`);
    }

    onServerClosed()
    {
        global.server.shutDownServer();
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
        new Player(server, socket);
    }

    onClientDisconnected(abrupt)
    {
        var server = global.server;
        for (var player of server.players)
        {
            if (this === player.socket)
            {
                // remove user
                player.onDisconnect();
                server.players.splice(server.players.indexOf(player));
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
                this.players.splice(this.players.indexOf(player));
            }
            else if (!player.tickResponse())
            {
                player.disconnect('Timed out');
            }
            else
            {
                if (this.ticksRan % 2 == 0)
                {
                    this.notifyPlayerPosition(player);
                }
            }
        }
    }

    autosave()
    {
        for (var level of Object.values(this.levels))
            level.saveLevel();
    }

    logInPlayer(player)
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
        player.assignPlayerID(this.players.length);
        this.players.push(player);
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
        this.notifyPlayerLevelChange(player, this.levels[level]);
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

    notifyPlayerConnected(player)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.supportsExtension("ExtPlayerList", 2))
            {
                otherPlayer.sendPacket(PacketType.ExtAddPlayerName, {
                    nameID: player.getIDFor(otherPlayer),
                    playerName: player.username,
                    listName: player.username,
                    groupName: player.currentLevel.levelName,
                    groupRank: 0
                });
            }
            if (otherPlayer !== player)
                otherPlayer.sendMessage(`&e${player.username} joined the game`);
        }
    }

    notifyPlayerDisconnected(player)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player)
            {
                if (otherPlayer.supportsExtension("ExtPlayerList", 2))
                {
                    otherPlayer.sendPacket(PacketType.ExtRemovePlayerName, {
                        nameID: player.getIDFor(otherPlayer)
                    });
                }
                otherPlayer.sendMessage(`&e${player.username} left the game`);
            }
        }
    }

    notifyPlayerAdded(player)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player && otherPlayer.currentLevel === player.currentLevel)
            {
                if (otherPlayer.supportsExtension("ExtPlayerList", 2))
                {
                    otherPlayer.sendPacket(PacketType.ExtAddEntity2, {
                        entityID: player.playerID,
                        inGameName: player.username,
                        skinName: player.username,
                        spawnX: player.position.posX,
                        spawnY: player.position.posY,
                        spawnZ: player.position.posZ,
                        spawnYaw: player.position.yaw,
                        spawnPitch: player.position.pitch
                    });
                }
                else
                {
                    otherPlayer.sendPacket(PacketType.AddPlayer, {
                        playerID: player.playerID,
                        playerName: player.username,
                        posX: player.position.posX,
                        posY: player.position.posY,
                        posZ: player.position.posZ,
                        yaw: player.position.yaw,
                        pitch: player.position.pitch
                    });
                }
            }
        }
    }

    notifyPlayerRemoved(player)
    {
        var playerRemove = serializePacket(PacketType.RemovePlayer, {
            playerID: player.playerID
        });
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.playerID != player.playerID && otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
                otherPlayer.sendPacketChunk(playerRemove);
        }
    }

    notifyPlayerMessage(player, message, messageType)
    {
        for (var otherPlayer of this.players)
        {
            if (player.localChat && otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
                otherPlayer.sendMessage(`(LOCAL) <${player.username}> ${message}`);
            else
                otherPlayer.sendMessage(`<${player.username}> ${message}`);
        }
    }

    notifyPlayerPosition(player)
    {
        if (player.position.posRotEquals(player.lastPosition))
            return;

        var movePacket = serializePacket(PacketType.PlayerPosition, {
            playerID: player.playerID,
            posX: player.position.posX,
            posY: player.position.posY,
            posZ: player.position.posZ,
            yaw: player.position.yaw,
            pitch: player.position.pitch
        });

        for (var otherPlayer of this.players)
        {
            if (otherPlayer.playerID != player.playerID && otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
                otherPlayer.sendPacketChunk(movePacket);
        }
    }

    notifyPlayerTeleport(player, position)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
            {
                otherPlayer.sendPacket(PacketType.PlayerPosition, {
                    playerID: player.getIDFor(otherPlayer),
                    posX: position.posX,
                    posY: position.posY,
                    posZ: position.posZ,
                    yaw: position.yaw,
                    pitch: position.pitch
                });
            }
        }
    }

    notifyPlayerLevelChange(player, level)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.supportsExtension("ExtPlayerList", 1) && otherPlayer.currentLevel === player.currentLevel)
            {
                otherPlayer.sendPacket(PacketType.ExtAddPlayerName, {
                    nameID: player.getIDFor(otherPlayer),
                    playerName: player.username,
                    listName: player.username,
                    groupName: level.levelName,
                    groupRank: 0
                });
            }
        }
    }

    notifyPlayerModelChange(player, model)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.supportsExtension("ChangeModel", 1) && otherPlayer.currentLevel === player.currentLevel)
            {
                otherPlayer.sendPacket(PacketType.ChangeModel, {
                    entityID: player.getIDFor(otherPlayer),
                    model: model
                });
            }
        }
    }

    notifyBlockPlaced(player, x, y, z, type)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
            {
                otherPlayer.sendPacket(PacketType.SetBlockServer, {
                    posX: x,
                    posY: y,
                    posZ: z,
                    blockType: otherPlayer.getPlayerSpecificBlock(type)
                });
            }
        }
    }

    notifyBlockRemoved(player, x, y, z, type)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
            {
                otherPlayer.sendPacket(PacketType.SetBlockServer, {
                    posX: x,
                    posY: y,
                    posZ: z,
                    blockType: 0
                });
            }
        }
    }

    notifyLevelWeatherChange(level, weather)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.supportsExtension("EnvWeatherType", 1) && otherPlayer.currentLevel.levelName == level.levelName)
                otherPlayer.sendPacket(PacketType.EnvSetWeatherType, { weather: weather });
        }
    }

    notifyLevelTexturesChange(level, textures)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.supportsExtension("EnvMapAspect", 2) && otherPlayer.currentLevel.levelName == level.levelName)
                otherPlayer.sendPacket(PacketType.SetMapEnvUrl, { url: textures });
        }
    }

    notifyLevelPropertyChange(level, propertyName, propertyValue)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.supportsExtension("EnvMapAspect", 2) && otherPlayer.currentLevel.levelName == level.levelName)
            {
                var value = propertyValue;
                switch (propertyName)
                {
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
        }
    }
}

module.exports = { Server };
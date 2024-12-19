const net = require('node:net');
const fs = require('fs');
const crypto = require('crypto');
const PacketType = require('./packet.js').PacketType;
const serializePacket = require('./packet.js').serializePacket;
const Player = require('./player.js').Player;
const Level = require('./game/level.js').Level;
const EventType = require('./event.js').EventType;

// temp
const ExtensionsPlugin = require('../plugins/extensions.js').ExtensionsPlugin;

const DefaultProperties = {
    serverName: "classic.js Server",
    motd: "A Nice Server",
    password: "",
    port: 25565,
    maxPlayers: 20,

    mainLevel: "main",
    autosaveInterval: 10,
    disallowVanillaClients: false
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

        this.heartbeatInterval = null;
        this.updateInterval = null;
        this.autosaveInterval = null;
        this.ticksRan = 0;

        //var extPlugin = new ExtensionsPlugin();
        //extPlugin.onInit(this);
        //this.plugins.push(extPlugin);
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
        {
            var main = new Level(this.properties.mainLevel, 256, 64, 256);
            main.fillFlatGrass();
            levels[this.properties.mainLevel] = main;
            main.saveLevel();
        }
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
        var player = new Player(server.players.length, socket);
        server.players.push(player);
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
                player.socket.write(serializePacket(PacketType.ClientPing, {}));
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

    sendServerHandshake(player)
    {
        var handshake = serializePacket(PacketType.Handshake, {
            protocolVersion: 0x07,
            name: this.properties.serverName,
            extra: this.properties.motd,
            supportByte: 0x0
        });
        player.socket.write(handshake);
    }

    sendExtensionInfo(player)
    {
        // info
        var extensionInfo = serializePacket(PacketType.ExtInfo, {
           software: "classic.js Alpha 0",
           extensionCount: 0 
        });
        player.socket.write(extensionInfo);
        for (var extension of this.supportedExtensions)
            player.socket.write(serializePacket(PacketType.ExtEntry, extension));

        var blockSupportPacket = serializePacket(PacketType.CustomBlockSupportLevel, {
            supportLevel: 1
        });
        player.socket.write(blockSupportPacket);
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

    /*
        TODO: turn these into events
    */

    handleEventViaPlugin(id, args)
    {
        var result = true;
        for (var plugin of this.plugins)
        {
            if (plugin.hasEventHandler(id))
            {
                var pluginResult = plugin.getEventHandler(id)(args);
                if (!pluginResult)
                    result = false;
            }
        }
        return result;
    }

    notifyPlayerConnected(player)
    {
        if (!this.handleEventViaPlugin(EventType.PlayerConnected, {player: player}))
            return false;

        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player)
                otherPlayer.sendMessage(`&e${player.username} joined the game`);
        }

        return true;
    }

    notifyPlayerDisconnected(player)
    {
        if (!this.handleEventViaPlugin(EventType.PlayerDisconnected, {player: player}))
            return false;

        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player)
                otherPlayer.sendMessage(`&e${player.username} left the game`);
        }

        return true;
    }

    notifyPlayerAdded(player)
    {
        if (!this.handleEventViaPlugin(EventType.PlayerAdded, {player: player}))
            return false;

        var playerAdd = serializePacket(PacketType.AddPlayer, {
            playerID: player.playerID,
            playerName: player.username,
            posX: player.position.posX,
            posY: player.position.posY,
            posZ: player.position.posZ,
            yaw: player.position.yaw,
            pitch: player.position.pitch
        });
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.playerID != player.playerID && otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
                otherPlayer.socket.write(playerAdd);
        }

        return true;
    }

    notifyPlayerRemoved(player)
    {
        if (!this.handleEventViaPlugin(EventType.PlayerRemoved, {player: player}))
            return false;

        var playerRemove = serializePacket(PacketType.RemovePlayer, {
            playerID: player.playerID
        });
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.playerID != player.playerID && otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
                otherPlayer.socket.write(playerRemove);
        }

        return true;
    }

    notifyPlayerMessage(player, message, messageType)
    {
        if (!this.handleEventViaPlugin(EventType.PlayerMessage, {player: player, message: message, messageType: messageType}))
            return false;

        for (var otherPlayer of this.players)
        {
            if (player.localChat && otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
                otherPlayer.sendMessage(`(LOCAL) <${player.username}> ${message}`);
            else
                otherPlayer.sendMessage(`<${player.username}> ${message}`);
        }

        return true;
    }

    notifyPlayerPosition(player)
    {
        // check difference
        /*
        var movedPos = !player.position.positionEquals(player.lastPosition);
        var movedRot = !player.position.rotationEquals(player.lastPosition);
        var xDiff = player.position.posXDifference(player.lastPosition);
        var yDiff = player.position.posYDifference(player.lastPosition);
        var zDiff = player.position.posZDifference(player.lastPosition);
        var pitchDiff = player.position.pitchDifference(player.lastPosition);
        var yawDiff = player.position.yawDifference(player.lastPosition);
        var movePacket;
        if (movedPos && movedRot)
        {
            movePacket = serializePacket(PacketType.PosRotUpdate, {
                playerID: player.playerID,
                deltaX: player.lastPosition.posX - player.position.posX,
                deltaY: player.lastPosition.posY - player.position.posY,
                deltaZ: player.lastPosition.posZ - player.position.posZ,
                deltaYaw: player.lastPosition.yaw - player.position.yaw,
                deltaPitch: player.lastPosition.pitch - player.position.pitch
            });
        }
        else if (movedPos)
        {
            movePacket = serializePacket(PacketType.PosUpdate, {
                playerID: player.playerID,
                deltaX: player.lastPosition.posX - player.position.posX,
                deltaY: player.lastPosition.posY - player.position.posY,
                deltaZ: player.lastPosition.posZ - player.position.posZ
            });
        }
        else if (movedRot)
        {
            movePacket = serializePacket(PacketType.PosRotUpdate, {
                playerID: player.playerID,
                deltaYaw: player.lastPosition.yaw - player.position.yaw,
                deltaPitch: player.lastPosition.pitch - player.position.pitch
            });
        }
        else
            return; // no schmovement
        */
        if (player.position.posRotEquals(player.lastPosition))
            return true;

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
                otherPlayer.socket.write(movePacket);
        }

        return true;
    }

    notifyPlayerTeleport(player, position)
    {
        if (!this.handleEventViaPlugin(EventType.PlayerAdded, {player: player}))
            return false;

        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
            {
                var id = player.playerID;
                if (player === otherPlayer)
                    id = -1;
                var tpPacket = serializePacket(PacketType.PlayerPosition, {
                    playerID: id,
                    posX: position.posX,
                    posY: position.posY,
                    posZ: position.posZ,
                    yaw: position.yaw,
                    pitch: position.pitch
                });
                otherPlayer.socket.write(tpPacket);
            }
        }

        return true;
    }

    notifyBlockPlaced(player, x, y, z, type)
    {
        if (!this.handleEventViaPlugin(EventType.BlockPlaced, {player: player, posX: x, posY: y, posZ: z, type: type}))
        {
            var setBlock = serializePacket(PacketType.SetBlockServer, {
                posX: x,
                posY: y,
                posZ: z,
                blockType: 0
            });
            player.socket.write(setBlock);
            return false;
        }

        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
            {
                var setBlock = serializePacket(PacketType.SetBlockServer, {
                    posX: x,
                    posY: y,
                    posZ: z,
                    blockType: otherPlayer.getPlayerSpecificBlock(type)
                });
                otherPlayer.socket.write(setBlock);
            }
        }

        return true;
    }

    notifyBlockRemoved(player, x, y, z, type)
    {
        if (!this.handleEventViaPlugin(EventType.BlockRemoved, {player: player, posX: x, posY: y, posZ: z}))
        {
            var setBlock = serializePacket(PacketType.SetBlockServer, {
                posX: x,
                posY: y,
                posZ: z,
                blockType: type
            });
            player.socket.write(setBlock);
            return false;
        }

        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
            {
                var setBlock = serializePacket(PacketType.SetBlockServer, {
                    posX: x,
                    posY: y,
                    posZ: z,
                    blockType: 0
                });
                otherPlayer.socket.write(setBlock);
            }
        }

        return true;
    }
}

module.exports = { Server };
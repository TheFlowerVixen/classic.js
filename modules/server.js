const net = require('node:net');
const fs = require('fs');
const crypto = require('crypto');
const PacketType = require('./packet.js').PacketType;
const serializePacket = require('./packet.js').serializePacket;
const Player = require('./player.js').Player;
const Level = require('./game/level.js').Level;

const DefaultProperties = {
    serverName: "classic.js Server",
    motd: "A Nice Server",
    password: "",
    port: 25565,
    maxPlayers: 20,

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

        this.heartbeatInterval = null;
        this.updateInterval = null;
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
            console.log(`${filePath} was generated. (NOTE: Do NOT lose this file or your users will not be able to authenticate!)`);
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
        if (dir.length == 0)
        {
            var main = new Level("main", 256, 64, 256);
            main.fillFlatGrass();
            levels['main'] = main;
            main.saveLevel();
        }
        else
        {
            for (var fileName of dir)
            {
                var lvlName = fileName.split('.')[0];
                var lvl = new Level(lvlName);
                lvl.loadLevel();
                levels[lvlName] = lvl;
            }
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
        this.netServer.listen(this.properties.port, this.onServerReady);
        this.heartbeatInterval = setInterval(this.heartbeat.bind(this), 20 * 50);
        this.updateInterval = setInterval(this.update.bind(this), 50);
    }

    onServerReady()
    {
        var server = global.server;
        console.log(`Server "${server.properties.serverName}' ready`);
    }

    onServerError(err)
    {
        var server = global.server;
        console.log(err);
        server.netServer.close();
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
        for (var player of this.players)
        {
            if (player.isDisconnected())
            {
                // remove user, destroy socket
                player.socket.end();
                this.players.splice(this.players.indexOf(player));
            }
            if (!player.tickResponse())
            {
                player.disconnect('Timed out');
            }
        }
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
    }

    sendPlayerToLevel(player, level)
    {
        if (player.currentLevel === this.levels[level])
            return false;
        else
            player.sendToLevel(this.levels[level]);
        return true;
    }

    getPlayerCount()
    {
        return this.players.length;
    }

    /*
        TODO: turn these into events
    */

    notifyPlayerConnected(player)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player)
                otherPlayer.sendMessage(`&e${player.username} joined the game`);
        }
    }

    notifyPlayerDisconnected(player)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player)
                otherPlayer.sendMessage(`&e${player.username} left the game`);
        }
    }

    notifyPlayerAdded(player)
    {
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
            if (otherPlayer !== player && otherPlayer.currentLevel === player.currentLevel)
                otherPlayer.socket.write(playerAdd);
        }
    }

    notifyPlayerRemoved(player)
    {
        var playerRemove = serializePacket(PacketType.RemovePlayer, {
            playerID: player.playerID
        });
        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player && otherPlayer.currentLevel === player.currentLevel)
                otherPlayer.socket.write(playerRemove);
        }
    }

    notifyPlayerMessage(player, message)
    {
        for (var otherPlayer of this.players)
        {
            if (player.localChat && otherPlayer.currentLevel === player.currentLevel)
                otherPlayer.sendMessage(`(LOCAL) <${player.username}> ${message}`);
            else
                otherPlayer.sendMessage(`<${player.username}> ${message}`);
        }
    }

    notifyPlayerPosition(player)
    {
        // check difference
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

        for (var otherPlayer of this.players)
        {
            if (otherPlayer != player && otherPlayer.currentLevel === player.currentLevel)
                otherPlayer.socket.write(movePacket);
        }
    }

    notifyBlockPlaced(player, x, y, z, type)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel === player.currentLevel)
            {
                var setBlock = serializePacket(PacketType.SetBlockServer, {
                    posX: x,
                    posY: y,
                    posZ: z,
                    blockType: type
                });
                otherPlayer.socket.write(setBlock);
            }
        }
    }

    notifyBlockRemoved(player, x, y, z)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel === player.currentLevel)
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
    }
}

module.exports = { Server };
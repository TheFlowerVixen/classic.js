const net = require('node:net');
const fs = require('fs');
const crypto = require('crypto');
const NetStream = require('./packet.js').NetStream;
const PacketType = require('./packet.js').PacketType;
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
        this.outStream = new NetStream();
        this.netServer = null;
        
        this.properties = this.loadProperties('properties.json');
        this.serverKey = this.loadServerKey('SERVER_KEY');
        this.players = [];
        this.levels = [new Level(0, 256, 64, 256), new Level(1, 64, 64, 64)];
        this.levels[0].fillFlatGrass();

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
            {
                this.outStream.newPacket(PacketType.ClientPing);
                this.outStream.sendPacket(player.socket);
            }
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
                player.disconnect(this.outStream, 'Timed out');
            }
        }
    }

    sendServerHandshake(player)
    {
        this.outStream.newPacket(PacketType.Handshake);
        this.outStream.writeByte(0x07);
        this.outStream.writeString(this.properties.serverName);
        this.outStream.writeString(this.properties.motd);
        this.outStream.writeByte(0);
        this.outStream.sendPacket(player.socket);
    }

    sendExtensionInfo(player)
    {
        // info
        this.outStream.newPacket(PacketType.ExtInfo);
        this.outStream.writeString("classic.js Alpha 0");
        this.outStream.writeUShort(0);
        this.outStream.sendPacket(player.socket);
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

    notifyPlayerAdded(level, player)
    {
        this.outStream.newPacket(PacketType.AddPlayer);
        this.outStream.writeByte(player.playerID);
        this.outStream.writeString(player.username);
        this.outStream.writeUShort(player.posX);
        this.outStream.writeUShort(player.posY);
        this.outStream.writeUShort(player.posZ);
        this.outStream.writeUByte(player.yaw);
        this.outStream.writeUByte(player.pitch);
        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player && otherPlayer.currentLevel === level)
                this.outStream.sendPacket(otherPlayer.socket);
        }
        this.outStream.reset();
    }

    notifyPlayerRemoved(level, player)
    {
        this.outStream.newPacket(PacketType.RemovePlayer);
        this.outStream.writeByte(player.playerID);
        for (var otherPlayer of this.players)
        {
            if (otherPlayer !== player && otherPlayer.currentLevel === level)
                this.outStream.sendPacket(otherPlayer.socket);
        }
        this.outStream.reset();
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

    notifyBlockPlaced(player, x, y, z, type)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel === player.currentLevel)
            {
                this.outStream.newPacket(PacketType.SetBlockServer);
                this.outStream.writeUShort(x);
                this.outStream.writeUShort(y);
                this.outStream.writeUShort(z);
                this.outStream.writeUByte(type);
                this.outStream.sendPacket(otherPlayer.socket);
            }
        }
    }

    notifyBlockRemoved(player, x, y, z)
    {
        for (var otherPlayer of this.players)
        {
            if (otherPlayer.currentLevel === player.currentLevel)
            {
                this.outStream.newPacket(PacketType.SetBlockServer);
                this.outStream.writeUShort(x);
                this.outStream.writeUShort(y);
                this.outStream.writeUShort(z);
                this.outStream.writeUByte(0);
                this.outStream.sendPacket(otherPlayer.socket);
            }
        }
    }
}

module.exports = { Server };
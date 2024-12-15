const net = require('node:net');
const fs = require('fs');
const NetStream = require('./packet.js').NetStream;
const PacketType = require('./packet.js').PacketType;
const Client = require('./client.js').Client;
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
        this.netStream = new NetStream();
        this.netServer = null;
        
        this.properties = this.loadProperties('properties.json');
        this.clients = [];
        this.levels = [new Level(8, 16, 8)];
        this.levels[0].fillFlatGrass();

        this.heartbeatInterval = null;
        this.updateInterval = null;

        this.disallowVanillaClients = false;
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

    startServer()
    {
        this.server = net.createServer(this.onClientConnected.bind(this));
        this.server.on('error', this.onServerError.bind(this));
        this.server.listen(this.properties.port, this.onServerReady.bind(this));
        this.heartbeatInterval = setInterval(this.heartbeat.bind(this), 20 * 50);
        this.updateInterval = setInterval(this.update.bind(this), 50);
    }

    onServerReady()
    {
        console.log(`Server "${this.properties.serverName}' ready`);
    }

    onServerError(err)
    {
        console.log(err);
        this.server.close();
    }

    onClientConnected(socket)
    {
        console.log("Client connected, awaiting information...");
        socket.on('close', this.onClientDisconnected.bind(this));
        var client = new Client(this.clients.length, socket);
        this.clients.push(client);
    }

    onClientDisconnected(socket)
    {
        console.log("Client disconnected");
        for (var client of this.clients)
        {
            if (client.isLoggedIn() && socket == client.socket)
            {
                // remove client
                this.clients.splice(this.clients.indexOf(client));
            }
        }
    }

    heartbeat()
    {
        for (var client of this.clients)
        {
            if (client.isLoggedIn() && !client.isDisconnected())
            {
                this.netStream.newPacket(PacketType.ClientPing);
                this.netStream.sendPacket(client.socket);
            }
        }
    }

    update()
    {
        for (var client of this.clients)
        {
            if (client.isDisconnected())
            {
                // remove client, destroy socket
                client.socket.end();
                this.clients.splice(this.clients.indexOf(client));
            }
            if (!client.tickResponse())
            {
                client.disconnect(this.netStream, 'Timed out');
            }
        }
    }

    sendServerHandshake(client)
    {
        this.netStream.newPacket(PacketType.Handshake);
        this.netStream.writeByte(0x07);
        this.netStream.writeString(this.properties.serverName);
        this.netStream.writeString(this.properties.motd);
        this.netStream.writeByte(0);
        this.netStream.sendPacket(client.socket);
    }

    sendExtensionInfo(client)
    {
        // info
        this.netStream.newPacket(PacketType.ExtInfo);
        this.netStream.writeString("classic.js Alpha 0");
        this.netStream.writeUShort(0);
        this.netStream.sendPacket(client.socket);
    }

    sendClientToLevel(client, level)
    {
        client.sendToLevel(this.levels[level]);
    }

    notifyPlayerAdded(level, player)
    {
        console.log('added');
        this.netStream.newPacket(PacketType.AddPlayer);
        this.netStream.writeByte(player.client.clientID);
        this.netStream.writeString(player.client.username);
        this.netStream.writeUShort(player.posX);
        this.netStream.writeUShort(player.posY);
        this.netStream.writeUShort(player.posZ);
        this.netStream.writeByte(player.yaw);
        this.netStream.writeByte(player.pitch);
        for (var client of this.clients)
        {
            if (client.currentLevel === level)
                this.netStream.sendPacket(client);
        }
        this.netStream.reset();
    }

    notifyPlayerRemoved(level, player)
    {
        this.netStream.newPacket(PacketType.RemovePlayer);
        this.netStream.writeByte(player.client.clientID);
        for (var client of this.clients)
        {
            if (client.currentLevel === level)
                this.netStream.sendPacket(client);
        }
        this.netStream.reset();
    }
    
    getPlayerCount()
    {
        return this.clients.length;
    }
}

module.exports = { Server };
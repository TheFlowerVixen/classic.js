const net = require('node:net');
const NetStream = require('./packet.js').NetStream;
const PacketType = require('./packet.js').PacketType;
const Client = require('./client.js').Client;
const Level = require('./game/level.js').Level;

class Server
{
    constructor()
    {
        this.netStream = new NetStream();
        this.netServer = null;
        
        this.serverName = "classic.js Server";
        this.motd = "A Nice Server";
        this.clients = [];
        this.levels = [];

        this.heartbeatInterval = null;
        this.updateInterval = null;

        this.disallowVanillaClients = false;
    }

    startServer(port)
    {
        this.server = net.createServer(this.onClientConnected.bind(this));
        this.server.on('error', this.onServerError.bind(this));
        this.server.listen(port, this.onServerReady.bind(this));
        this.heartbeatInterval = setInterval(this.heartbeat.bind(this), 20 * 50);
        this.updateInterval = setInterval(this.update.bind(this), 50);
    }

    onServerReady()
    {
        console.log(`Server "${this.serverName}" ready`);
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
                // remove client
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
        this.netStream.newPacket(PacketType.Login);
        this.netStream.writeByte(0x07);
        this.netStream.writeString(this.serverName);
        this.netStream.writeString(this.motd);
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
        client.player.sendToLevel(level);
    }

    notifyPlayerAdded(level, player)
    {
        for (var client of this.clients)
        {
            //this.netStream.newPacket(PacketType.AddPlayer);
            //this.netStream.writeUByte(player.client.clientID);
            //this.netStream.
        }
    }

    notifyPlayerRemoved(level, player)
    {

    }
}

module.exports = { Server };
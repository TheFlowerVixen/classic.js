const PacketType = require('./packet.js').PacketType;
const NetStream = require('./packet.js').NetStream;
const Player = require('./player.js').Player;

const ClientState = {
    Connected: 0,
    SentHandshake: 1,
    SendingExtensions: 2,
    LoggedIn: 3,
    Disconnected: 4
};

class Client
{
    constructor(clientID, socket)
    {
        this.socket = socket;
        this.clientID = clientID;

        this.socket.on('data', this.handleData.bind(this));
        this.socket.on('error', this.handleError.bind(this));

        this.netStream = new NetStream();
        this.clientSoftware = "Minecraft Classic 0.30";
        this.username = "";
        this.authKey = "";
        this.player = new Player(this);
        this.currentLevel = null;

        this.responseTime = 0;
        this.clientState = ClientState.Connected;

        this.supportsCPE = false;
        this.supportedExtensions = [];
        this.supportedExtensionVersions = [];
        this.extensionCount = -1;
    }

    handleData(data)
    {
        while (this.netStream.getPosition() < data.length)
        {
            var packetID = this.netStream.readByte(data);
            console.log(`Received packet ID 0x${packetID.toString(16)}`);
            if (this.clientState == ClientState.Connected && packetID != 0)
            {
                // was supposed to send a handshake...
                this.socket.end();
                this.clientState == ClientState.Disconnected;
                return;
            }
            switch (packetID)
            {		
                case PacketType.Handshake:
                    if (this.clientState == ClientState.Connected)
                        this.clientState = ClientState.SentHandshake;
                    else if (this.clientState != ClientState.SentHandshake)
                    {
                        // client shouldn't have sent another handshake, bail
                        this.socket.destroy();
                        this.clientState == ClientState.Disconnected;
                        break;
                    }

                    if (global.server.getPlayerCount() > global.server.properties.maxPlayers)
                    {
                        this.disconnect(this.netStream, "Server is full!");
                        break;
                    }

                    var protocolVer = this.netStream.readByte(data);
                    if (protocolVer != 0x07)
                    {
                        this.disconnect(this.netStream, "Unknown protocol version!");
                        break;
                    }

                    this.username = this.netStream.readString(data);
                    this.authKey = this.netStream.readString(data);
                    if (global.server.properties.password != "" && this.authKey != global.server.properties.password)
                    {
                        this.disconnect(this.netStream, "Invalid password!");
                        break;
                    }

                    var supportByte = this.netStream.readByte(data);
                    if (supportByte == 0x42)
                    {
                        this.supportsCPE = true;
                        this.extensionCount = 0;
                    }
                    else if (global.server.properties.disallowVanillaClients)
                    {
                        this.disconnect(this.netStream, "Your client is unsupported!");
                        break;
                    }
    
                    if (this.supportsCPE)
                    {
                        global.server.sendExtensionInfo(this);
                        this.clientState = ClientState.SendingExtensions;
                    }
                    else
                    {
                        this.logIn();
                    }
                    
                    break;
                
                // chat packet
                /*
                case PacketType.Message:
                    var byte = netStream.readByte(data);
                    var str = netStream.readString(data);
                    this.netStream.newPacket(PacketType.Message);
                    this.netStream.writeByte(0x0);
                    this.netStream.writeString("<" + this.username + "> " + str);
                    this.netStream.sendPacket(this.socket);
                    break;
                */
                
                // extension info packet
                case PacketType.ExtInfo:
                    this.clientSoftware = this.netStream.readString(data);
                    this.extensionCount = this.netStream.readUShort(data);
                    console.log(`Client software: ${this.clientSoftware}`);
                    console.log(`Number of extensions: ${this.extensionCount}`);
                    // no extensions supported...?
                    if (this.extensionCount == 0)
                    {
                        //console.log('No supported extensions, send handshake');
                        this.logIn();
                    }
                    break;
                
                // extension entry packet
                case PacketType.ExtEntry:
                    var extensionName = this.netStream.readString(data);
                    var extensionVersion = this.netStream.readInt(data);
                    this.supportedExtensions.push(extensionName);
                    this.supportedExtensionVersions.push(extensionVersion);
                    //console.log('Extension: ' + extensionName + ' (v' + extensionVersion + ')');
                    this.extensionCount--;
                    if (this.extensionCount == 0)
                    {
                        //console.log('Done, send handshake');
                        this.logIn();
                    }
                    break;
    
    
            }
            //console.log(this.netStream.getPosition() + ' < ' + data.length);
        }
        this.netStream.reset();
        this.resetResponse();
    }

    handleError(err)
    {
        console.log(err);
        this.disconnect(`Internal error: ${err}`);
    }

    logIn()
    {
        console.log(`Client id ${this.clientID} logged in as ${this.username} (auth key ${this.authKey}, supports CPE: ${this.supportsCPE})`);
        global.server.sendServerHandshake(this);
        global.server.sendClientToLevel(this, 0);
        this.clientState = ClientState.LoggedIn;
    }

    tickResponse()
    {
        this.responseTime++;
        return this.responseTime < 1200 && this.socket;
    }

    resetResponse()
    {
        this.responseTime = 0;
    }

    disconnect(reason)
    {
        this.netStream.newPacket(PacketType.DisconnectPlayer);
        this.netStream.writeString(reason);
        this.netStream.sendPacket(this.socket);
        this.socket.end();
        this.clientState = ClientState.Disconnected;
    }

    isLoggedIn()
    {
        return this.clientState == ClientState.LoggedIn;
    }

    isDisconnected()
    {
        return this.clientState == ClientState.Disconnected;
    }

    sendToLevel(level)
    {
        if (this.isLoggedIn())
        {
            if (this.currentLevel != null)
                this.currentLevel.removePlayer(this.player);
            this.currentLevel = level;
            level.addPlayer(this.player);
            level.sendLevelData(this.netStream, this);
        }
    }
}

module.exports = { Client, ClientState };
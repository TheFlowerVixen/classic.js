const PacketType = require('./packet.js').PacketType;
const NetStream = require('./packet.js').NetStream;
const Player = require('./player.js').Player;

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
        this.responseTime = 0;
        this.loggedIn = false;
        this.disconnected = false;
        this.player = new Player(this);
        this.currentLevel = null;

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
            switch (packetID)
            {		
                case PacketType.Login:
                    var protocolVer = this.netStream.readByte(data);
                    if (protocolVer != 0x07)
                    {
                        this.disconnect(this.netStream, "Unknown protocol version!");
                        break;
                    }
                    this.username = this.netStream.readString(data);
                    this.authKey = this.netStream.readString(data);
                    var supportByte = this.netStream.readByte(data);
                    if (supportByte == 0x42)
                    {
                        this.supportsCPE = true;
                        this.extensionCount = 0;
                    }
                    else if (global.server.disallowVanillaClients)
                    {
                        this.disconnect(this.netStream, "Your client is unsupported!");
                        break;
                    }
                    
                    console.log(`Client id ${this.clientID} logged in as ${this.username} (auth key ${this.authKey}, supports CPE: ${this.supportsCPE})`);
    
                    if (this.supportsCPE)
                    {
                        global.server.sendExtensionInfo(this);
                        // wait for extensions
                    }
                    else
                    {
                        global.server.sendServerHandshake(this);
                        this.loggedIn = true;
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
                        global.server.sendServerHandshake(this);
                        this.loggedIn = true;
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
                        console.log(this.supportedExtensions);
                        //console.log('Done, send handshake');
                        global.server.sendServerHandshake(this);
                        this.loggedIn = true;
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
        this.socket.destroy();
        this.disconnected = true;
    }

    isLoggedIn()
    {
        return this.loggedIn;
    }

    isDisconnected()
    {
        return this.disconnected;
    }

    sendToLevel(level)
    {
        if (this.loggedIn && !this.disconnected)
        {
            if (this.currentLevel != null)
                this.currentLevel.removePlayer(this.player);
            this.currentLevel = level;
            level.addPlayer(this.player);
        }
    }
}

module.exports = { Client };
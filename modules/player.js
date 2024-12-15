const crypto = require('crypto');
const fs = require('fs');
const PacketType = require('./packet.js').PacketType;
const NetStream = require('./packet.js').NetStream;

const PlayerState = {
    Connected: 0,
    SentHandshake: 1,
    SendingExtensions: 2,
    LoggedIn: 3,
    Disconnected: 4
};

const DefaultUserData = {
    rank: 0,
    password: "",
    lastLevel: 0,
    lastPosition: {
        x: 0,
        y: 0,
        z: 0,
        pitch: 0,
        yaw: 0
    }
}

class Player
{
    constructor(playerID, socket)
    {
        this.socket = socket;
        this.playerID = playerID;

        this.socket.on('data', this.handleData.bind(this));
        this.socket.on('error', this.handleError.bind(this));

        this.inStream = new NetStream();
        this.outStream = new NetStream();
        this.clientSoftware = "Minecraft Classic 0.30";
        this.username = "";
        this.authKey = "";
        this.userData = null;
        this.currentLevel = null;
        this.localChat = false;

        this.posX = 0.0;
        this.posY = 0.0;
        this.posZ = 0.0;
        this.pitch = 0.0;
        this.yaw = 0.0;

        this.responseTime = 0;
        this.playerState = PlayerState.Connected;

        this.supportsCPE = false;
        this.supportedExtensions = [];
        this.supportedExtensionVersions = [];
        this.extensionCount = -1;
    }
    
    loadUserData(filePath)
    {
        var finalData = DefaultUserData;
        if (!fs.existsSync(filePath))
            fs.writeFileSync(filePath, JSON.stringify(finalData, null, 4));
        else
        {
            finalData = Object.assign(finalData, JSON.parse(fs.readFileSync(filePath)));
            fs.writeFileSync(filePath, JSON.stringify(finalData, null, 4));
        }
        return finalData;
    }

    saveUserData(filePath, userData)
    {
        fs.writeFileSync(filePath, JSON.stringify(userData, null, 4));
    }

    setPassword(password)
    {
        var keys = global.server.getCipherKeys();
        const cipher = crypto.createCipheriv('aes-256-cbc', keys[0], keys[1]);
        var encrypted = cipher.update(password, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        this.userData.password = encrypted;
    }

    isValidPassword(password)
    {
        try
        {
            var keys = global.server.getCipherKeys();
            const decipher = crypto.createDecipheriv('aes-256-cbc', keys[0], keys[1]);
            var decrypted = decipher.update(this.userData.password, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted == password; 
        }
        catch (error)
        {
            console.error(`Error decrypting ${this.username}'s password - server keys may have changed!!!`);
            return false;
        }
    }

    onLogin()
    {
        console.log(`Player id ${this.playerID} logged in as ${this.username} (auth key ${this.authKey}, supports CPE: ${this.supportsCPE})`);
        this.userData = this.loadUserData(`users/${this.username}.json`);
        this.playerState = PlayerState.LoggedIn;
        this.updatePositionAndRotation(
            this.userData.lastPosition.x,
            this.userData.lastPosition.y,
            this.userData.lastPosition.z,
            this.userData.lastPosition.pitch,
            this.userData.lastPosition.yaw
        );
        global.server.notifyPlayerConnected(this);
        global.server.sendServerHandshake(this);
        global.server.sendPlayerToLevel(this, 0);
    }

    onDisconnect()
    {
        console.log(`Player id ${this.playerID} disconnected`);
        this.playerState == PlayerState.Disconnected;
        this.userData.lastPosition = {
            x: this.posX,
            y: this.posY,
            z: this.posZ,
            pitch: this.pitch,
            yaw: this.yaw
        };
        this.saveUserData(`users/${this.username}.json`, this.userData);
        global.server.notifyPlayerDisconnected(this);
    }

    updatePositionAndRotation(x, y, z, pitch, yaw)
    {
        this.posX = x;
        this.posY = y;
        this.posZ = z;
        this.pitch = pitch;
        this.yaw = yaw;
    }

    handleData(data)
    {
        while (this.inStream.getPosition() < data.length)
        {
            var packetID = this.inStream.readByte(data);
            if (packetID > 0x11 || packetID < 0)
            {
                this.disconnect(this.outStream, `Invalid packet 0x${packetID.toString('hex')}`);
                return;
            }
            //console.log(`Received packet ID 0x${packetID.toString(16)}`);
            if (this.playerState == PlayerState.Connected && packetID != 0)
            {
                // was supposed to send a handshake...
                this.socket.end();
                this.playerState == PlayerState.Disconnected;
                return;
            }
            switch (packetID)
            {		    
                case PacketType.Handshake:
                    this.handleHandshake(data);
                    break;
                
                case PacketType.Teleport:
                    this.handlePosition(data);
                    break;

                case PacketType.Message:
                    this.handleMessage(data);
                    break;
                
                case PacketType.SetBlockClient:
                    this.handleSetBlock(data);
                    break;
                
                case PacketType.ExtInfo:
                    this.handleExtInfo(data);
                    break;
                
                case PacketType.ExtEntry:
                    this.handleExtEntry(data);
                    break;
            }
            this.outStream.reset();
            //console.log(this.netStream.getPosition() + ' < ' + data.length);
        }
        this.inStream.reset();
        this.resetResponse();
    }

    handleHandshake(data)
    {
        if (this.playerState == PlayerState.Connected)
            this.playerState = PlayerState.SentHandshake;
        else if (this.playerState != PlayerState.SentHandshake)
        {
            // client shouldn't have sent another handshake, bail
            this.socket.destroy();
            this.playerState == PlayerState.Disconnected;
            return;
        }

        if (global.server.getPlayerCount() > global.server.properties.maxPlayers)
        {
            this.disconnect(this.outStream, "Server is full!");
            return;
        }

        var protocolVer = this.inStream.readByte(data);
        if (protocolVer != 0x07)
        {
            this.disconnect(this.outStream, "Unknown protocol version!");
            return;
        }

        this.username = this.inStream.readString(data);
        this.authKey = this.inStream.readString(data);
        if (global.server.properties.password != "" && this.authKey != global.server.properties.password)
        {
            this.disconnect(this.outStream, "Invalid password!");
            return;
        }

        var supportByte = this.inStream.readByte(data);
        if (supportByte == 0x42)
        {
            this.supportsCPE = true;
            this.extensionCount = 0;
        }
        else if (global.server.properties.disallowVanillaClients)
        {
            this.disconnect(this.outStream, "Your client is unsupported!");
            return;
        }

        if (this.supportsCPE)
        {
            global.server.sendExtensionInfo(this);
            this.playerState = PlayerState.SendingExtensions;
        }
        else
        {
            this.onLogin();
        }
    }

    handlePosition(data)
    {
        var playerId = this.inStream.readUByte(data);
        var x = this.inStream.readUShort(data);
        var y = this.inStream.readUShort(data);
        var z = this.inStream.readUShort(data);
        var yaw = this.inStream.readUByte(data);
        var pitch = this.inStream.readUByte(data);
        this.updatePositionAndRotation(x, y, z, pitch, yaw);
    }

    handleMessage(data)
    {
        var byte = this.inStream.readByte(data);
        var str = this.inStream.readString(data);
        console.log(`${this.username}: ${str}`);
        if (str.startsWith('/'))
            this.handleCommand(str.split(' '));
        else
            global.server.notifyPlayerMessage(this, str);
    }

    handleCommand(args)
    {
        switch (args[0])
        {
            case '/level':
                if (!global.server.sendPlayerToLevel(this, parseInt(args[1])))
                    this.sendMessage('&cYou are already in this level!');
                break;
            
            case '/local':
                if (!this.localChat)
                {
                    this.localChat = true;
                    this.sendMessage('&eYou are now chatting locally');
                }
                break;
            
            case '/global':
                if (this.localChat)
                {
                    this.localChat = false;
                    this.sendMessage('&eYou are now chatting globally');
                }
                break;
        }
    }

    handleSetBlock(data)
    {
        // for now just echo it
        var x = this.inStream.readUShort(data);
        var y = this.inStream.readUShort(data);
        var z = this.inStream.readUShort(data);
        var mode = this.inStream.readUByte(data);
        var blockType = this.inStream.readUByte(data);
        console.log(`${x} ${y} ${z} ${mode} ${blockType}`);

        var oldBlock = this.currentLevel.getBlock(x, y, z);
        if (mode == 0x1)
        {
            this.currentLevel.setBlock(x, y, z, blockType);
            global.server.notifyBlockPlaced(this, x, y, z, blockType);
            return;
        }
        if (mode == 0x0 && oldBlock == blockType)
        {
            this.currentLevel.setBlock(x, y, z, 0);
            global.server.notifyBlockRemoved(this, x, y, z);
        }
        else
        {
            console.log('Discrepancy detected');
        }
    }

    handleExtInfo(data)
    {
        this.clientSoftware = this.inStream.readString(data);
        this.extensionCount = this.inStream.readUShort(data);
        console.log(`Client software: ${this.clientSoftware}`);
        console.log(`Number of extensions: ${this.extensionCount}`);
        // no extensions supported...?
        if (this.extensionCount == 0)
        {
            //console.log('No supported extensions, send handshake');
            this.onLogin();
        }
    }

    handleExtEntry(data)
    {
        var extensionName = this.inStream.readString(data);
        var extensionVersion = this.inStream.readInt(data);
        this.supportedExtensions.push(extensionName);
        this.supportedExtensionVersions.push(extensionVersion);
        //console.log('Extension: ' + extensionName + ' (v' + extensionVersion + ')');
        this.extensionCount--;
        if (this.extensionCount == 0)
        {
            console.log(this.supportedExtensions);
            //console.log('Done, send handshake');
            this.onLogin();
        }
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
        this.outStream.newPacket(PacketType.DisconnectPlayer);
        this.outStream.writeString(reason);
        this.outStream.sendPacket(this.socket);
        this.socket.end();
    }

    isLoggedIn()
    {
        return this.playerState == PlayerState.LoggedIn;
    }

    isDisconnected()
    {
        return this.playerState == PlayerState.Disconnected;
    }

    sendToLevel(level)
    {
        if (this.isLoggedIn())
        {
            if (this.currentLevel != null)
                this.currentLevel.removePlayer(this);
            this.currentLevel = level;
            level.addPlayer(this);
            level.sendLevelData(this.outStream, this);
        }
    }

    sendMessage(message)
    {
        this.outStream.newPacket(PacketType.Message);
        this.outStream.writeByte(0x0);
        this.outStream.writeString(message);
        this.outStream.sendPacket(this.socket);
    }
}

module.exports = { Player, PlayerState };
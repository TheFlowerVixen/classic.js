const crypto = require('crypto');
const fs = require('fs');
const PacketType = require('./packet.js').PacketType;
const PacketError = require('./packet.js').PacketError;
const serializePacket = require('./packet.js').serializePacket;
const deserializePacket = require('./packet.js').deserializePacket;

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

class PlayerPosition
{
    constructor(posX, posY, posZ, pitch, yaw)
    {
        this.posX = posX;
        this.posY = posY;
        this.posZ = posZ;
        this.pitch = pitch;
        this.yaw = yaw;
    }
    
    positionEquals(otherPos)
    {
        return this.posX == otherPos.posX && this.posY == otherPos.posY && this.posZ == otherPos.posZ;
    }

    rotationEquals(otherPos)
    {
        return this.pitch == otherPos.pitch && this.yaw == otherPos.yaw;
    }

    posXDifference(otherPos)
    {
        return otherPos.posX - this.posX;
    }

    posYDifference(otherPos)
    {
        return otherPos.posY - this.posY;
    }

    posZDifference(otherPos)
    {
        return otherPos.posZ - this.posZ;
    }

    pitchDifference(otherPos)
    {
        return otherPos.pitch - this.pitch;
    }

    yawDifference(otherPos)
    {
        return otherPos.yaw - this.yaw;
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

        this.clientSoftware = "Minecraft Classic 0.30";
        this.username = "";
        this.authKey = "";
        this.userData = null;
        this.currentLevel = null;
        this.localChat = false;

        this.position = new PlayerPosition(0.0, 0.0, 0.0, 0.0, 0.0);
        this.lastPosition = this.position;

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
            this.userData.lastPosition.posX,
            this.userData.lastPosition.posY,
            this.userData.lastPosition.posZ,
            this.userData.lastPosition.pitch,
            this.userData.lastPosition.yaw
        );
        global.server.notifyPlayerConnected(this);
        global.server.sendServerHandshake(this);
        global.server.sendPlayerToLevel(this, "main");
    }

    onDisconnect()
    {
        console.log(`Player id ${this.playerID} disconnected`);
        this.playerState == PlayerState.Disconnected;
        if (this.userData != null)
        {
            this.userData.lastPosition = this.position;
            this.saveUserData(`users/${this.username}.json`, this.userData);
        }
        global.server.notifyPlayerDisconnected(this);
        this.currentLevel.removePlayer(this);
    }

    updatePositionAndRotation(x, y, z, pitch, yaw)
    {
        this.lastPosition = this.position;
        this.position = new PlayerPosition(x, y, z, pitch, yaw);
    }

    handleData(data)
    {
        var offset = 0;
        while (offset < data.length)
        {
            var packet = deserializePacket(data, offset);
            offset += packet.size;
            
            // error check
            if (packet.length == 2)
            {
                this.handlePacketError(packet);
                return;
            }

            //console.log(`Received packet ID 0x${packetID.toString(16)}`);
            if (this.playerState == PlayerState.Connected && packet.id != 0)
            {
                // was supposed to send a handshake...
                this.disconnect('You need to log in!');
                return;
            }

            switch (packet.id)
            {
                case PacketType.Handshake:
                    this.handleHandshake(packet.data);
                    break;
                
                case PacketType.PlayerPosition:
                    this.handlePosition(packet.data);
                    break;

                case PacketType.Message:
                    this.handleMessage(packet.data);
                    break;
                
                case PacketType.SetBlockClient:
                    this.handleSetBlock(packet.data);
                    break;
                
                case PacketType.ExtInfo:
                    this.handleExtInfo(packet.data);
                    break;
                
                case PacketType.ExtEntry:
                    this.handleExtEntry(packet.data);
                    break;
            }
        }
        this.resetResponse();
    }

    handlePacketError(error)
    {
        switch (error[0])
        {
            case PacketError.InvalidID:
                this.disconnect(`Invalid packet ${error[1]}`);
                break;
            
            case PacketError.EndOfStream:
                this.disconnect(`End of stream (reading packet ${error[1]})`);
                break;
        }
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
            this.disconnect("Server is full!");
            return;
        }

        if (data.protocolVersion != 0x07)
        {
            this.disconnect("Unknown protocol version!");
            return;
        }

        this.username = data.name;
        this.authKey = data.extra;
        if (global.server.properties.password != "" && this.authKey != global.server.properties.password)
        {
            this.disconnect("Invalid password!");
            return;
        }

        if (data.supportByte == 0x42)
        {
            this.supportsCPE = true;
            this.extensionCount = 0;
        }
        else if (global.server.properties.disallowVanillaClients)
        {
            this.disconnect("Your client is unsupported!");
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
        if (data.playerID == 0xFF)
        {
            this.updatePositionAndRotation(data.posX, data.posY, data.posZ, data.pitch, data.yaw);
            global.server.notifyPlayerPosition(this);
        }
    }

    handleMessage(data)
    {
        console.log(`${this.username}: ${data.message}`);
        if (data.message.startsWith('/'))
            this.handleCommand(data.message.split(' '));
        else
            global.server.notifyPlayerMessage(this, data.message);
    }

    handleCommand(args)
    {
        switch (args[0])
        {
            case '/level':
                if (!global.server.sendPlayerToLevel(this, args[1]))
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
            
            case '/leave':
                this.disconnect('See ya!');
                break;
            
            case '/tp':
                var x = parseInt(args[1]);
                var y = parseInt(args[2]);
                var z = parseInt(args[3]);
                var tpPacket = serializePacket(PacketType.PlayerPosition, {
                    playerID: -1,
                    posX: x,
                    posY: y,
                    posZ: z,
                    yaw: 0,
                    pitch: 0
                });
                this.socket.write(tpPacket);
                break;
        }
    }

    handleSetBlock(data)
    {
        if (data.mode == 0x1)
        {
            this.currentLevel.setBlock(data.posX, data.posY, data.posZ, data.blockType);
            global.server.notifyBlockPlaced(this, data.posX, data.posY, data.posZ, data.blockType);
            return;
        }
        if (data.mode == 0x0)
        {
            this.currentLevel.setBlock(data.posX, data.posY, data.posZ, 0);
            global.server.notifyBlockRemoved(this, data.posX, data.posY, data.posZ);
        }
    }

    handleExtInfo(data)
    {
        this.clientSoftware = data.software;
        this.extensionCount = data.extensionCount;
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
        this.supportedExtensions.push(data.extName);
        this.supportedExtensionVersions.push(data.version);
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
        var disconnectPacket = serializePacket(PacketType.DisconnectPlayer, {
            reason: reason
        });
        this.socket.write(disconnectPacket);
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
            level.sendLevelData(this);
        }
    }

    sendMessage(message)
    {
        var messagePacket = serializePacket(PacketType.Message, {
            playerID: 0x0,
            message: message
        });
        this.socket.write(messagePacket);
    }
}

module.exports = { Player, PlayerState };
const crypto = require('crypto');
const fs = require('fs');
const PacketType = require('./packet.js').PacketType;
const PacketError = require('./packet.js').PacketError;
const serializePacket = require('./packet.js').serializePacket;
const deserializePacket = require('./packet.js').deserializePacket;
const EventType = require('./event.js').EventType;

const PlayerState = {
    Connected: 0,
    SentHandshake: 1,
    SendingExtensions: 2,
    LoggedIn: 3,
    Disconnected: 4
};

const DefaultUserData = {
    rank: 0,
    password: ""
}

// Source: https://www.30secondsofcode.org/js/s/word-wrap/
const wordWrap = /(?![^\n]{1,64}$)([^\n]{1,64})\s/g;

const FallbackBlocksLevel1 = [
    0x2C,
    0x27,
    0x0C,
    0x00,
    0x0A,
    0x21,
    0x19,
    0x03,
    0x1d,
    0x1c,
    0x14,
    0x2a,
    0x31,
    0x24,
    0x05,
    0x01
]

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

    posRotEquals(otherPos)
    {
        return this.positionEquals(otherPos) && this.rotationEquals(otherPos);
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
        this.extensionCount = -1;
        this.packetWaitingFor = -1;
        this.clickDistance = 3.75;
        this.storedMessage = "";
        this.blockSupportLevel = 0;
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
        this.packetWaitingFor = -1;
        console.log(`Player id ${this.playerID} logged in as ${this.username} (auth key ${this.authKey}, supports CPE: ${this.supportsCPE})`);
        this.userData = this.loadUserData(`users/${this.username}.json`);
        this.playerState = PlayerState.LoggedIn;
        if (!global.server.notifyPlayerConnected(this))
        {
            // limbo (event is expected to disconnect player)
            return;
        }

        global.server.sendServerHandshake(this);
        global.server.sendPlayerToLevel(this, global.server.properties.mainLevel);
    }

    onDisconnect()
    {
        console.log(`Player id ${this.playerID} disconnected`);
        this.playerState == PlayerState.Disconnected;
        if (this.isLoggedIn())
        {
            this.userData.lastPosition = this.position;
            this.saveUserData(`users/${this.username}.json`, this.userData);
            global.server.notifyPlayerDisconnected(this);
            this.currentLevel.removePlayer(this);
        }
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

            if (!this.handlePacketViaPlugin(packet))
                continue;

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
                
                case PacketType.CustomBlockSupportLevel:
                    this.handleCustomBlockSupportLevel(packet.data);
                    break;
            }
        }
        this.resetResponse();
    }

    handlePacketViaPlugin(packet)
    {
        var result = true;
        for (var plugin of global.server.plugins)
        {
            if (plugin.hasPacketHandler(packet.id))
            {
                var pluginResult = plugin.getPacketHandler(packet.id)(this, packet.data);
                if (!pluginResult)
                    result = false;
            }
        }
        return result;
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
            this.disconnect('You need to log in!');
            return;
        }

        if (global.server.getPlayerCount() > global.server.properties.maxPlayers)
        {
            this.disconnect(`Server is full! (max ${global.server.properties.maxPlayers})`);
            return;
        }

        if (data.protocolVersion != 0x07)
        {
            this.disconnect(`Unknown protocol version! (${data.protocolVersion})`);
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
        this.updatePositionAndRotation(data.posX, data.posY, data.posZ, data.pitch, data.yaw);
        //global.server.notifyPlayerPosition(this);
    }

    handleMessage(data)
    {
        var message = data.message.trimEnd();
        if (this.supportsExtension("LongerMessages", 1))
        {
            this.storedMessage += data.message;
            if (data.messageType != 0x0)
                return false;
            else
            {
                message = this.storedMessage.trimEnd();
                this.storedMessage = "";
            }
        }

        console.log(`${this.username}: ${message}`);
        if (message.startsWith('/'))
            this.handleCommand(message.split(' '));
        else
            global.server.notifyPlayerMessage(this, message, data.messageType);
    }

    handleCommand(args)
    {
        if (!global.server.handleEventViaPlugin(EventType.PlayerCommand, {player: this, cmdArgs: args}))
            return;

        switch (args[0])
        {
            case '/pos':
            case '/position':
                this.sendMessage(`&ePosition: &cX &e${this.position.posX}, &aY &e${this.position.posY}, &9Z &e${this.position.posZ}`)
                break;

            case '/lvl':
            case '/level':
                var code = global.server.sendPlayerToLevel(this, args[1]);
                if (code == 1)
                    this.sendMessage('&cThat level does not exist!');
                if (code == 2)
                    this.sendMessage('&cYou are already in this level!');
                break;
            
            case '/lc':
            case '/local':
                if (!this.localChat)
                {
                    this.localChat = true;
                    this.sendMessage('&eYou are now chatting locally');
                }
                break;
            
            case '/gc':
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
            
            case '/teleport':
            case '/tp':
                var x = parseInt(args[1]);
                var y = parseInt(args[2]);
                var z = parseInt(args[3]);
                this.teleportCentered(x, y, z);
                break;
            
            case '/stop':
                global.server.shutDownServer(0);
                break;
        }
    }

    handleSetBlock(data)
    {
        if (data.mode == 0x1)
        {
            if (global.server.notifyBlockPlaced(this, data.posX, data.posY, data.posZ, data.blockType))
                this.currentLevel.setBlock(data.posX, data.posY, data.posZ, data.blockType);
        }
        if (data.mode == 0x0)
        {
            var oldBlock = this.currentLevel.getBlock(data.posX, data.posY, data.posZ);
            if (global.server.notifyBlockRemoved(this, data.posX, data.posY, data.posZ, oldBlock))
                this.currentLevel.setBlock(data.posX, data.posY, data.posZ, 0);
        }
    }

    handleExtInfo(data)
    {
        this.clientSoftware = data.software;
        this.extensionCount = data.extensionCount;
        console.log(`Client software: ${this.clientSoftware}`);
        console.log(`Number of extensions: ${this.extensionCount}`);
        if (this.extensionCount == 0)
            this.packetWaitingFor = PacketType.CustomBlockSupportLevel;
    }

    handleExtEntry(data)
    {
        this.supportedExtensions.push(data);
        this.extensionCount--;
        if (this.extensionCount == 0)
            this.packetWaitingFor = PacketType.CustomBlockSupportLevel;
    }

    handleCustomBlockSupportLevel(data)
    {
        this.blockSupportLevel = data.supportLevel;
        if (this.packetWaitingFor == PacketType.CustomBlockSupportLevel)
            this.onLogin();
    }

    handleError(err)
    {
        console.log(err);
        this.disconnect(`Internal error: "${err}"`);
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
        console.log(`Disconnecting ${this.username} with reason "${reason}"`)
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

    sendMessage(message, type = 0)
    {
        if (this.supportsExtension("MessageTypes", 1) && type != 0)
        {
            var messagePacket = serializePacket(PacketType.Message, {
                messageType: type,
                message: message
            });
            this.socket.write(messagePacket);
        }
        else
        {
            for (var messagePart of message.replace(wordWrap, '$1\n').split('\n'))
            {
                var messagePacket = serializePacket(PacketType.Message, {
                    messageType: type,
                    message: messagePart
                });
                this.socket.write(messagePacket);
            }
        }
    }

    teleport(x, y, z)
    {
        if (global.server.notifyPlayerTeleport(this, this.position))
            this.updatePositionAndRotation(x, y, z, 0, 0);
    }

    teleportCentered(x, y, z)
    {
        this.teleport(x + 0.5, y + 1.59375, z + 0.5);
    }

    supportsExtension(name, version)
    {
        if (!this.supportsCPE)
            return false;
        for (var extension of this.supportedExtensions)
        {
            if (extension.extName == name && extension.version == version)
                return true;
        }
        return false;
    }

    changeClickDistance(clickDistance)
    {
        if (this.supportsExtension("ClickDistance", 1))
        {
            this.clickDistance = clickDistance;
            var clickPacket = serializePacket(PacketType.ClickDistance, {
                distance: clickDistance
            });
            this.socket.write(clickPacket);
            return true;
        }
        return false;
    }

    changeHeldBlock(block, preventChange = false)
    {
        if (this.supportsExtension("HeldBlock", 1))
        {
            var holdPacket = serializePacket(PacketType.HoldThis, {
                blockToHold: block,
                preventChange: preventChange ? 1 : 0
            });
            this.socket.write(holdPacket);
            return true;
        }
        return false;
    }

    getPlayerSpecificBlock(blockType)
    {
        if (blockType > 0x31 && this.blockSupportLevel < 1)
            return FallbackBlocksLevel1[blockType - 0x32];
        else
            return blockType;
    }
}

module.exports = { Player, PlayerState };
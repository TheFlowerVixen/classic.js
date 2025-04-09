const crypto = require('crypto');
const fs = require('fs');
const PacketType = require('../network/packet.js').PacketType;
const PacketError = require('../network/stream.js').PacketError;
const serializePacket = require('../network/stream.js').serializePacket;
const deserializePacket = require('../network/stream.js').deserializePacket;

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
    model: "humanoid"
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

class Player
{
    constructor(server, socket)
    {
        this.server = server;
        this.socket = socket;

        this.socket.on('data', this.handleData.bind(this));
        this.socket.on('error', this.handleError.bind(this));

        this.playerState = PlayerState.Connected;
        this.clientSoftware = "";
        this.playerID = -1;
        this.username = "";
        this.authKey = "";
        this.entity = null;
        this.userData = null;
        this.currentLevel = null;
        this.localChat = false;

        this.responseTime = 0;
        this.packetsSent = 0;

        this.supportsCPE = false;
        this.supportedExtensions = [];
        this.extensionCount = -1;
        this.packetWaitingFor = -1;
        this.clickDistance = 3.75;
        this.storedMessage = "";
        this.blockSupportLevel = 0;
        this.hacks = {
            fly: true,
            noclip: true,
            speed: true,
            spawn: true,
            perspective: true,
            jumpHeight: -1
        };
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
        var keys = this.server.getCipherKeys();
        const cipher = crypto.createCipheriv('aes-256-cbc', keys[0], keys[1]);
        var encrypted = cipher.update(password, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        this.userData.password = encrypted;
    }

    isValidPassword(password)
    {
        try
        {
            var keys = this.server.getCipherKeys();
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

    assignEntity(entity)
    {
        this.entity = entity;
        if (this.entity.player == null)
            this.entity.player = this;
    }

    onLogin()
    {
        this.packetWaitingFor = -1;
        console.log(`Player logged in as ${this.username} (auth key ${this.authKey}, supports CPE: ${this.supportsCPE})`);
        this.userData = this.loadUserData(`users/${this.username}.json`);
        this.playerState = PlayerState.LoggedIn;
        this.server.logInPlayer(this);
        this.server.sendPlayerToLevel(this, this.server.properties.mainLevel);
        if (this.supportsExtension("HackControl"))
            this.sendPacket(PacketType.HackControl, this.hacks);
        this.server.notifyPlayerConnected(this);
        this.server.fireEvent('player-login', this);
    }

    onDisconnect()
    {
        console.log(`Player ${this.username} disconnected`);
        if (this.isLoggedIn())
        {
            this.playerState = PlayerState.Disconnected;
            this.userData.lastPosition = this.entity.position;
            this.saveUserData(`users/${this.username}.json`, this.userData);
            this.currentLevel.removeEntity(this.entity);
            this.server.removeEntity(this.entity);
            this.server.notifyPlayerDisconnected(this);
            this.server.fireEvent('player-disconnect', this);
        }
    }

    networkUpdate()
    {
        if (this.currentLevel != null)
            this.currentLevel.networkUpdate(this);
    }

    handleData(data)
    {
        if (data.toString('utf8').startsWith('GET'))
        {
            this.socket.write("Web clients aren't supported yet!");
            return;
        }

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

            // Plugins may handle packets individually if they wish
            this.server.fireEvent('player-packet', this, packet);
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
            this.disconnect('You need to log in!');
            return;
        }

        if (this.server.getPlayerCount() > this.server.properties.maxPlayers)
        {
            this.disconnect(`Server is full! (max ${this.server.properties.maxPlayers})`);
            return;
        }

        if (data.protocolVersion != 0x07)
        {
            this.disconnect(`Unknown protocol version! (${data.protocolVersion})`);
            return;
        }

        this.username = data.name;
        this.authKey = data.extra;
        if (this.server.properties.broadcast && this.server.properties.verifyNames)
        {
            var hashCheck = crypto.hash('md5', this.server.broadcaster.salt + this.username);
            if (hashCheck != this.authKey)
            {
                this.disconnect("Unable to authenticate! Please try logging in again");
                return;
            }
        }

        if (data.supportByte == 0x42)
        {
            this.supportsCPE = true;
            this.extensionCount = 0;
        }
        else if (!this.server.properties.allowVanillaClients)
        {
            this.disconnect("Your client is unsupported!");
            return;
        }

        if (this.supportsCPE)
        {
            this.server.sendExtensionInfo(this);
            this.playerState = PlayerState.SendingExtensions;
        }
        else
        {
            this.clientSoftware = "Vanilla";
            this.onLogin();
        }
    }

    handlePosition(data)
    {
        if (this.entity != null)
        {
            if (this.server.fireEvent('player-move', this, data))
                this.entity.updatePositionAndRotation(data.posX, data.posY, data.posZ, data.pitch, data.yaw);
            else
                // Reject
                this.sendPacket(PacketType.PlayerPosition, {
                    playerID: 255,
                    posX: this.entity.position.posX,
                    posY: this.entity.position.posY,
                    posZ: this.entity.position.posZ,
                    yaw: this.entity.position.yaw,
                    pitch: this.entity.position.pitch
                })
        }
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
        {
            if (this.server.fireEvent('player-message', this, message))
                this.server.notifyPlayerMessage(this, message, data.messageType);
        }
    }

    handleCommand(args)
    {
        var commandName = args.splice(0, 1)[0].substring(1);
        this.server.doCommand(this, commandName, args);
        this.server.fireEvent('player-command', commandName, args);
    }

    handleSetBlock(data)
    {
        var oldBlock = this.currentLevel.getBlock(data.posX, data.posY, data.posZ);
        if (!this.server.fireEvent('player-edit', this, data))
        {
            // Reject event
            if (data.mode == 0x0)
                data.blockType = oldBlock;
            if (data.mode == 0x1)
                data.blockType = 0;
            this.sendPacket(PacketType.SetBlockServer, data);
        }
        else
        {
            if (data.mode == 0x1)
            {
                this.server.notifyBlockPlaced(this, data.posX, data.posY, data.posZ, data.blockType);
                this.currentLevel.setBlock(data.posX, data.posY, data.posZ, data.blockType);
            }
            if (data.mode == 0x0)
            {
                this.server.notifyBlockRemoved(this, data.posX, data.posY, data.posZ, oldBlock)
                this.currentLevel.setBlock(data.posX, data.posY, data.posZ, 0);
            }   
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
        if (this.isLoggedIn())
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

    adjustString(str)
    {
        if (!this.supportsExtension("FullCP437", 1))
        {
            var newString = "";
            for (var i in str)
            {
                if (str.charCodeAt(i) > 127)
                    newString += "?";
                else
                    newString += str[i];
            }
            return newString;
        }
        else
            return str;
    }

    disconnect(reason)
    {
        if (this.playerState == PlayerState.Disconnected)
        {
            console.warn(`Tried to disconnect ${this.username}, but they were already disconnected`);
            return;
        }
        this.playerState == PlayerState.Disconnected;
        console.log(`Disconnecting ${this.username} with reason "${reason}"`)
        this.sendPacket(PacketType.DisconnectPlayer, {
            reason: this.adjustString(reason)
        });
        this.server.fireEvent('player-disconnect', this);
    }

    isLoggedIn()
    {
        return this.playerState == PlayerState.LoggedIn;
    }

    isDisconnected()
    {
        return this.playerState == PlayerState.Disconnected;
    }
    
    sendPacketChunk(chunk)
    {
        this.socket.write(chunk, function(err) {
            if (err)
                console.log(err);
            else
                this.packetsSent++;
        }.bind(this));
        //console.log(`${this.username} has been sent ${this.packetsSent} packets`);
    }

    sendPacket(id, data = {})
    {
        var packet = serializePacket(id, data);
        if (Array.isArray(packet))
        {
            console.error(`Error serializing packet id ${packet[1]}: ${packet[0]}`);
            console.log(data);
            console.trace();
            return;
        }
        this.sendPacketChunk(packet);
    }

    sendToLevel(level)
    {
        if (this.isLoggedIn())
        {
            if (this.currentLevel != null)
                this.currentLevel.removeEntity(this.entity);
            this.currentLevel = level;
            this.entity.joinLevel(level);
            this.server.notifyPlayerChangeLevel(this);
        }
    }

    sendMessage(message, type = 0)
    {
        if (this.supportsExtension("MessageTypes", 1) && type != 0)
        {
            this.sendPacket(PacketType.Message, {
                messageType: type,
                message: this.adjustString(message)
            });
        }
        else
        {
            var lastColorCode = "";
            for (var messagePart of message.replace(wordWrap, '$1\n').split('\n'))
            {
                this.sendPacket(PacketType.Message, {
                    messageType: type,
                    message: this.adjustString(lastColorCode + messagePart)
                });
                var codeIndex = messagePart.lastIndexOf("&");
                if (codeIndex > -1 && codeIndex < messagePart.length)
                    lastColorCode = messagePart.substring(codeIndex, codeIndex + 2);
            }
        }
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
            this.sendPacket(PacketType.ClickDistance, {
                distance: clickDistance
            });
            return true;
        }
        return false;
    }

    changeHeldBlock(block, preventChange = false)
    {
        if (this.supportsExtension("HeldBlock", 1))
        {
            this.sendPacket(PacketType.HoldThis, {
                blockToHold: block,
                preventChange: preventChange ? 1 : 0
            });
            return true;
        }
        return false;
    }

    setHotbar(block, slot)
    {
        if (this.supportsExtension("SetHotbar", 1))
        {
            this.sendPacket(PacketType.SetHotbar, {
                blockID: block,
                index: slot
            });
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

    setBlockPermission(block, allowed)
    {

    }

    setHack(hack, value)
    {
        if (this.supportsExtension("HackControl", 1) && this.hacks[hack] != undefined)
        {
            this.hacks[hack] = value;
            this.sendPacket(PacketType.HackControl, this.hacks);
            return true;
        }
        return false;
    }

    sendPlayerListAdded(otherPlayer)
    {
        if (otherPlayer.supportsExtension("ExtPlayerList", 1) && otherPlayer.currentLevel === entity.currentLevel)
        {
            otherPlayer.sendPacket(PacketType.ExtAddPlayerName, {
                nameID: this.entity.getIDFor(otherPlayer),
                playerName: this.entity.name,
                listName: this.entity.name,
                groupName: this.currentLevel.levelName,
                groupRank: 0
            });
        }
    }

    sendPlayerListRemoved(otherPlayer)
    {
        otherPlayer.sendPacket(PacketType.ExtRemovePlayerName, {
            nameID: this.entity.getIDFor(otherPlayer)
        });
    }
}

module.exports = { Player, PlayerState };
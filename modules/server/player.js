// @ts-check

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isNumberObject } = require('util/types');
const PacketType = require('../network/packet.js').PacketType;
const PacketError = require('../network/stream.js').PacketError;
const serializePacket = require('../network/stream.js').serializePacket;
const deserializePacket = require('../network/stream.js').deserializePacket;
const CommandSender = require('./command.js').CommandSender;
const ansiColorMessage = require('./console.js').ansiColorMessage;
const EntityPosition = require('../game/entity.js').EntityPosition;

const PlayerState = {
    Connected: 0,
    SentHandshake: 1,
    SendingExtensions: 2,
    LoggedIn: 3,
    Disconnecting: 4,
    Disconnected: 5
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

const AdminBlocks = [
    0x7,
    0x8,
    0x9,
    0xA,
    0xB
];

class Player extends CommandSender
{
    constructor(server, socket, playerID)
    {
        // CommandSender
        super();
        this.isPlayer = true;

        this.playerID = playerID;
        this.server = server;
        this.socket = socket;

        this.socket.on('data', this.handleData.bind(this));
        this.socket.on('error', this.handleError.bind(this));
        this.socket.on('close', this.handleDisconnect.bind(this));

        this.playerState = PlayerState.Connected;
        this.clientSoftware = "";
        this.username = "";
        this.authKey = "";
        this.entity = null;
        this.userData = {};
        this.currentLevel = null;
        this.localChat = false;

        this.responseTime = 0;
        this.packetsSent = 0;
        this.disconnectTimeout = 0;

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

            // error check
            if (packet.error != undefined)
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

            offset += packet.size;

            // Plugins may handle packets individually if they wish
            this.server.fireEvent('player-packet', this, packet);
        }
        this.resetResponse();
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

        this.username = data.name;
        this.authKey = data.extra;

        if (this.server.isPlayerBanned(this))
        {
            this.disconnect(`You are banned from this server! Reason: ${this.server.getBanReason(this)}`);
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

        if (this.server.properties.broadcast && this.server.properties.verifyNames)
        {
            var hashCheck = crypto.hash('md5', this.server.broadcaster.salt + this.username);
            console.log(hashCheck);
            console.log(this.authKey);
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
            this.login();
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
        const codes = "0123456789abcdef";
        for (var code of codes)
            message = message.replace(`%${code}`, `&${code}`);

        console.log(ansiColorMessage(`${this.username}: ${message}`));
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
        this.server.fireEvent('player-command', this, commandName, args);
    }

    handleSetBlock(data)
    {
        var oldBlock = this.currentLevel.getBlock(data.posX, data.posY, data.posZ);
        var newBlock = data.blockType;
        if (data.mode == 0x0)
            newBlock = oldBlock;
        
        // Verify blocks being placed are allowed
        var blockPermissions = this.getBlockPermissions();
        if (blockPermissions[newBlock] != undefined)
        {
            if (data.mode == 0x0 ? !blockPermissions[newBlock].break : !blockPermissions[newBlock].place)
            {
                this.sendMessage("&cYou're not allowed to do that!");
                this.handleSetBlockReject(data, oldBlock);
                return;
            }
        }

        if (this.server.fireEvent('player-edit', this, data))
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
        else
            this.handleSetBlockReject(data, oldBlock);
    }

    handleSetBlockReject(data, oldBlock)
    {
        if (data.mode == 0x0)
            data.blockType = oldBlock;
        if (data.mode == 0x1)
            data.blockType = 0;
        this.sendPacket(PacketType.SetBlockServer, data);
    }

    handleExtInfo(data)
    {
        this.clientSoftware = data.software;
        this.extensionCount = data.extensionCount;
        console.log(`Client software: ${this.clientSoftware}`);
        console.log(`Number of extensions: ${this.extensionCount}`);
        if (this.extensionCount == 0)
        {
            if (this.verifyExtensions())
                this.packetWaitingFor = PacketType.CustomBlockSupportLevel;
        }
    }

    handleExtEntry(data)
    {
        this.supportedExtensions.push(data);
        this.extensionCount--;
        if (this.extensionCount == 0)
        {
            if (this.verifyExtensions())
                this.packetWaitingFor = PacketType.CustomBlockSupportLevel;
        }
    }

    handleCustomBlockSupportLevel(data)
    {
        this.blockSupportLevel = data.supportLevel;
        if (this.packetWaitingFor == PacketType.CustomBlockSupportLevel)
            this.login();
    }

    handleError(err)
    {
        console.log(err);
        if (this.isLoggedIn())
            this.disconnect(`Internal error: "${err}"`);
    }

    handlePacketError(packet)
    {
        switch (packet.error)
        {
            case PacketError.InvalidID:
                this.disconnect(`Invalid packet ${packet.id}`);
                break;
            
            case PacketError.EndOfStream:
                this.disconnect(`End of stream (reading packet ${packet.id})`);
                break;
        }
    }

    handleDisconnect(wasAbrupt)
    {
        console.log(`Player ${this.username} disconnected`);
        this.playerState = PlayerState.Disconnected;
        if (this.entity != null)
        {
            this.userData.lastPosition = this.entity.position;
            this.currentLevel.removeEntity(this.entity);
        }
        this.saveUserData(`users/${this.username}.json`, this.userData);
        this.server.removePlayer(this);
        this.server.notifyPlayerDisconnected(this);
        this.server.fireEvent('player-disconnect', this);
    }

    login()
    {
        this.packetWaitingFor = -1;
        console.log(`Player logged in as ${this.username} (auth key ${this.authKey}, supports CPE: ${this.supportsCPE})`);
        this.userData = this.loadUserData(`users/${this.username}.json`);
        this.playerState = PlayerState.LoggedIn;
        this.sendPacket(PacketType.Handshake, {
            protocolVersion: 0x07,
            name: this.server.properties.serverName,
            extra: this.server.properties.motd,
            supportByte: this.userData.rank
        });
        this.server.addPlayer(this);
        this.server.sendPlayerToLevel(this, this.server.properties.mainLevel, false);
        this.sendOtherData(true);
        this.server.notifyPlayerConnected(this);
        for (var otherPlayer of this.server.players)
        {
            if (otherPlayer !== this)
                otherPlayer.sendPlayerListAdded(this);
        }
        this.server.fireEvent('player-login', this);
    }

    assignEntity(entity)
    {
        this.entity = entity;
        if (this.entity.player == null)
            this.entity.player = this;
    }

    loadUserData(filePath)
    {
        var finalData = DefaultUserData;
        var dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath))
            fs.mkdirSync(dirPath);
        if (!fs.existsSync(filePath))
            fs.writeFileSync(filePath, JSON.stringify(finalData, null, 4));
        else
        {
            finalData = Object.assign(finalData, JSON.parse(fs.readFileSync(filePath).toString()));
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

    networkUpdate()
    {
        if (this.playerState == PlayerState.Disconnecting)
        {
            this.disconnectTimeout++;
            if (this.disconnectTimeout == 20 && this.socket.readyState == 1)
            {
                // Forcefully close the socket if the client hasn't disconnected on their own yet
                this.socket.close();
            }
            return;
        }
        if (this.currentLevel != null)
            this.currentLevel.networkUpdate(this);
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
        if (this.playerState >= PlayerState.Disconnecting)
        {
            console.warn(`Tried to disconnect ${this.username}, but they were already disconnected or are being disconnected`);
            return;
        }
        this.playerState == PlayerState.Disconnecting;
        console.log(`Disconnecting ${this.username} with reason "${reason}"`)
        this.sendPacket(PacketType.DisconnectPlayer, {
            reason: this.adjustString(reason)
        });
    }

    ban(reason)
    {
        this.server.banPlayer(this, reason);
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
        var chunk = serializePacket(id, data);
        if (isNumberObject(chunk))
        {
            console.error(`Error serializing packet ${Object.keys(PacketType)[id]}: ${Object.keys(PacketError)[chunk]}`);
            console.log(data);
            console.trace();
            return;
        }
        if (this.server.fireEvent('server-packet', this.server, this, {id: id, data: data, size: chunk.length}))
            this.sendPacketChunk(chunk);
    }

    sendToLevel(level, resetPosition = true)
    {
        if (this.isLoggedIn())
        {
            if (resetPosition)
                this.userData.lastPosition = new EntityPosition(0, 0, 0, 0, 0);
            if (this.currentLevel != null)
                this.currentLevel.removeEntity(this.entity);
            this.currentLevel = level;
            this.entity.joinLevel(level);
            this.currentLevel.sendLevelData(this);
            this.server.notifyPlayerInfoUpdate(this);
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

    verifyExtensions()
    {
        // Check if the player supports required extensions
        for (var requiredExt of this.server.properties.requiredExtensions)
        {
            if (!this.supportsExtension(requiredExt.extName, requiredExt.version))
            {
                this.disconnect(`Your client doesn't support ${requiredExt.extName} v${requiredExt.version}!`);
                return false;
            }
        }
        return true;
    }

    getName()
    {
        return this.username;
    }

    getCurrentLevel()
    {
        return this.currentLevel;
    }

    getIDFor(player)
    {
        if (this === player)
            return 255; // You!
        return this.playerID;
    }

    hasRank(rank)
    {
        return this.userData.rank >= rank;
    }

    setRank(rank)
    {
        this.userData.rank = rank;
        this.sendOtherData();
        this.sendMessage('&eYour rank has been updated');
        this.server.notifyPlayerInfoUpdate(this);
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

    getBlockPermissions()
    {
        var perms = {};
        if (this.hasRank(100))
        {
            for (var block of AdminBlocks)
                perms[block] = { place: true, break: true };
        }
        return perms;
    }

    setHack(hack, value)
    {
        if (this.supportsExtension("HackControl", 1) && this.hacks[hack] != undefined)
        {
            this.hacks[hack] = value;
            this.sendOtherData();
            return true;
        }
        return false;
    }

    sendPlayerListAdded(otherPlayer)
    {
        if (otherPlayer.supportsExtension("ExtPlayerList", 2))
        {
            otherPlayer.sendPacket(PacketType.ExtAddPlayerName, {
                nameID: this.getIDFor(otherPlayer),
                playerName: this.entity.name,
                listName: this.entity.name,
                groupName: this.currentLevel.levelName,
                groupRank: this.userData.rank
            });
        }
    }

    sendPlayerListRemoved(otherPlayer)
    {
        otherPlayer.sendPacket(PacketType.ExtRemovePlayerName, {
            nameID: this.playerID
        });
    }

    sendOtherData(doNotSendRank = false)
    {
        this.socket.cork();
        if (!doNotSendRank)
        {
            this.sendPacket(PacketType.SetRank, {
                rank: this.userData.rank
            });
        }
        if (this.supportsExtension("HackControl"))
            this.sendPacket(PacketType.HackControl, this.hacks);
        if (this.supportsExtension("BlockPermissions", 1))
        {
            var blockPerms = this.getBlockPermissions();
            for (var block of Object.keys(blockPerms))
            {
                this.sendPacket(PacketType.SetBlockPermission, {
                    blockType: block,
                    allowPlace: blockPerms[block].place,
                    allowBreak: blockPerms[block].break
                });
            }
        }
        this.socket.uncork();
    }
}

module.exports = { Player, PlayerState };
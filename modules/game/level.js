const zlib = require('node:zlib');
const fs = require('fs');
const PacketType = require('../packet.js').PacketType;
const serializePacket = require('../packet.js').serializePacket;

class Level
{
    constructor(levelName, sizeX = 256, sizeY = 64, sizeZ = 256)
    {    
        this.levelName = levelName;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.sizeZ = sizeZ;

        this.spawnX = this.sizeX / 2;
        this.spawnY = this.sizeY / 2;
        this.spawnZ = this.sizeZ / 2;

        this.players = [];
        this.blocks = new Array(this.sizeX * this.sizeY * this.sizeZ);
    }

    flattenCoordinate(x, y, z)
    {
        return (this.sizeZ * this.sizeX) * y + this.sizeX * z + x;
    }

    setBlock(x, y, z, type)
    {
        this.blocks[this.flattenCoordinate(x, y, z)] = type;
    }

    getBlock(x, y, z)
    {
        return this.blocks[this.flattenCoordinate(x, y, z)];
    }

    addPlayer(player)
    {
        this.players.push(player);
        global.server.notifyPlayerAdded(player);
    }

    removePlayer(player)
    {
        var playerIndex = this.players.indexOf(player);
        if (playerIndex > -1)
            this.players.splice(playerIndex);
        global.server.notifyPlayerRemoved(player);
    }

    loadLevel()
    {
        var path = `levels/${this.levelName}.lvl`;
        if (fs.existsSync(path))
        {
            var levelBuffer = zlib.gunzipSync(fs.readFileSync(path));
            this.sizeX = levelBuffer.readUInt16BE(0);
            this.sizeY = levelBuffer.readUInt16BE(2);
            this.sizeZ = levelBuffer.readUInt16BE(4);
            this.blocks = new Array(this.sizeX * this.sizeY * this.sizeZ);
            for (var i = 0; i < this.blocks.length; i++)
                this.blocks[i] = levelBuffer.readUInt8(6 + i);
        }
    }

    saveLevel()
    {
        var dataBuffer = Buffer.alloc(6 + this.blocks.length);
        dataBuffer.writeUInt16BE(this.sizeX, 0);
        dataBuffer.writeUInt16BE(this.sizeY, 2);
        dataBuffer.writeUInt16BE(this.sizeZ, 4);
        for (var i = 0; i < this.blocks.length; i++)
            dataBuffer.writeUInt8(this.blocks[i], 6 + i);
        fs.writeFileSync(`levels/${this.levelName}.lvl`, zlib.gzipSync(dataBuffer));
    }

    compressBlockData(blockData)
    {
        var sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeUInt32BE(blockData.length);
        var blockBuffer = Buffer.from(blockData);
        var compressedBlocks = zlib.gzipSync(Buffer.concat([sizeBuffer, blockBuffer]), {level: 1});
        return compressedBlocks;
    }

    decompressBlockData(compressedBlocks)
    {
        var decompressedBlocks = zlib.gunzipSync(compressedBlocks);
        var blockSize = decompressedBlocks.readUInt32BE();
        this.blocks = new Array(blockSize);
        for (var i = 0; i < blockSize; i++)
            this.blocks[i] = decompressedBlocks.readUInt8(4 + i);
    }

    sendLevelData(player)
    {
        var levelPackets = [];

        // level init
        levelPackets.push(serializePacket(PacketType.LevelInit, {}));

        // compress block data
        var blocksCopy = [];
        for (var i = 0; i < this.blocks.length; i++)
            blocksCopy[i] = player.getPlayerSpecificBlock(this.blocks[i]);
        var compressedBlocks = this.compressBlockData(blocksCopy);
        
        // level chunks
        var position = 0;
        var remainingBlocks = compressedBlocks.length;

        var chunkSize = 0;
        while (remainingBlocks > 0)
        {
            var chunkBuffer = Buffer.alloc(1024, 0x00);
            chunkSize = Math.min(remainingBlocks, chunkBuffer.length);
            compressedBlocks.copy(chunkBuffer, 0, position, position + chunkSize);
            
            var chunkPacket = serializePacket(PacketType.LevelChunk, {
                chunkLength: chunkSize,
                chunkData: chunkBuffer,
                percentComplete: (position + chunkSize) * 100 / compressedBlocks.length
            });
            levelPackets.push(chunkPacket);

            remainingBlocks -= chunkSize;
            position += chunkSize;
        }

        // level finalize
        var finalPacket = serializePacket(PacketType.LevelEnd, {
            sizeX: this.sizeX,
            sizeY: this.sizeY,
            sizeZ: this.sizeZ
        });
        levelPackets.push(finalPacket);

        player.socket.write(Buffer.concat(levelPackets));

        // sending it twice; once for initial position, once for spawn position
        player.teleportCentered(this.spawnX, this.spawnY, this.spawnZ);
        player.teleportCentered(this.spawnX, this.spawnY, this.spawnZ);

        // delayed other players (doesnt work otherwise)
        setTimeout(function() {
            for (var otherPlayer of this.players)
            {
                if (otherPlayer.playerID != player.playerID && otherPlayer.isLoggedIn() && otherPlayer.currentLevel.levelName == player.currentLevel.levelName)
                {
                    var playerAdd = serializePacket(PacketType.AddPlayer, {
                        playerID: otherPlayer.playerID,
                        playerName: otherPlayer.username,
                        posX: otherPlayer.position.posX,
                        posY: otherPlayer.position.posY,
                        posZ: otherPlayer.position.posZ,
                        yaw: otherPlayer.position.yaw,
                        pitch: otherPlayer.position.pitch
                    });
                    player.socket.write(playerAdd);
                }
            }
        }.bind(this), 50);
    }

    getFlatBlockAtY(y)
    {
        if (y == 0)
            return 7;
        else if (y > 0 && y < 29)
            return 1;
        else if (y > 28 && y < 31)
            return 3;
        else if (y == 31)
            return 2;
        else
            return 0;
    }

    fillFlatGrass()
    {
        for (var x = 0; x < this.sizeX; x++)
        {
            for (var z = 0; z < this.sizeZ; z++)
            {
                for (var y = 0; y < this.sizeY; y++)
                {
                    var index = this.flattenCoordinate(x, y, z);
                    this.blocks[index] = this.getFlatBlockAtY(y);
                }
            }
        }
    }
}

module.exports = { Level };
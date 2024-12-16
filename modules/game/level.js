const zlib = require('node:zlib');
const fs = require('fs');
const PacketType = require('../packet.js').PacketType;

class Level
{
    constructor(levelName, sizeX, sizeY, sizeZ)
    {    
        this.levelName = levelName;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.sizeZ = sizeZ;

        this.spawnX = this.sizeX / 2;
        this.spawnY = 64;
        this.spawnZ = this.sizeZ / 2;

        this.players = [];
        this.blocks = new Array(this.sizeX * this.sizeY * this.sizeZ);
    }

    flattenCoordinate(x, y, z)
    {
        return (this.sizeX * this.sizeZ) * y + (this.sizeX) * z + x;
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
        global.server.notifyPlayerAdded(this, player);
    }

    removePlayer(player)
    {
        var playerIndex = this.players.indexOf(player);
        if (playerIndex > -1)
            this.players.splice(playerIndex);
        global.server.notifyPlayerRemoved(this, player);
    }

    loadLevel()
    {
        var path = `levels/${this.levelName}.lvl`;
        if (fs.existsSync(path))
        {
            var levelBuffer = fs.readFileSync(path);
            this.sizeX = levelBuffer.readUInt16BE(0);
            this.sizeY = levelBuffer.readUInt16BE(2);
            this.sizeZ = levelBuffer.readUInt16BE(4);
            this.decompressBlockData(levelBuffer.subarray(6));
        }
    }

    saveLevel()
    {
        var dataBuffer = Buffer.alloc(6);
        dataBuffer.writeUInt16BE(this.sizeX, 0);
        dataBuffer.writeUInt16BE(this.sizeY, 2);
        dataBuffer.writeUInt16BE(this.sizeZ, 4);
        var finalData = Buffer.concat([dataBuffer, this.compressBlockData()]);
        fs.writeFileSync(`levels/${this.levelName}.lvl`, finalData);
    }

    compressBlockData()
    {
        var sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeUInt32BE(this.blocks.length);
        var blockBuffer = Buffer.from(this.blocks);
        var compressedBlocks = zlib.gzipSync(Buffer.concat([sizeBuffer, blockBuffer]), {level: -1});
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

    sendLevelData(netStream, player)
    {
        // level init
        netStream.newPacket(PacketType.LevelInit);
        netStream.sendPacket(player.socket);

        // compress block data
        var compressedBlocks = this.compressBlockData();
        
        // level chunks
        var chunkBuffer = Buffer.alloc(1024, 0x00);
        var position = 0;
        var remainingBlocks = compressedBlocks.length;

        var chunkSize = 0;
        while (remainingBlocks > 0)
        {
            chunkSize = Math.min(remainingBlocks, chunkBuffer.length);
            compressedBlocks.copy(chunkBuffer, 0, position, chunkSize);

            netStream.newPacket(PacketType.LevelChunk);
            netStream.writeUShort(chunkSize);
            netStream.write(chunkBuffer);
            netStream.writeUByte((position + chunkSize) * 100 / compressedBlocks.length);
            netStream.sendPacket(player.socket);

            chunkBuffer.fill(0x00);
            remainingBlocks -= chunkSize;
            position += chunkSize;
        }

        // level finalize
        netStream.newPacket(PacketType.LevelEnd);
        netStream.writeUShort(this.sizeX);
        netStream.writeUShort(this.sizeY);
        netStream.writeUShort(this.sizeZ);
        netStream.sendPacket(player.socket);

        // first position
        netStream.newPacket(PacketType.PlayerPosition);
        netStream.writeByte(player.playerID);
        netStream.writeUShort(this.spawnX);
        netStream.writeUShort(this.spawnY);
        netStream.writeUShort(this.spawnZ);
        netStream.writeUByte(0);
        netStream.writeUByte(0);

        // other players
        if (this.players.legnth > 0)
        {
            for (var otherPlayer in this.players)
                {
                    if (otherPlayer != player)
                    {
                        netStream.newPacket(PacketType.AddPlayer);
                        netStream.writeByte(otherPlayer.playerID);
                        netStream.writeString(otherPlayer.username);
                        netStream.writeUShort(otherPlayer.posX);
                        netStream.writeUShort(otherPlayer.posY);
                        netStream.writeUShort(otherPlayer.posZ);
                        netStream.writeByte(otherPlayer.yaw);
                        netStream.writeByte(otherPlayer.pitch);
                        netStream.sendPacket(player.socket);
                    }
                }
        }
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
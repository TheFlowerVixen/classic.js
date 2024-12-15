const zlib = require('node:zlib');
const PacketType = require('../packet.js').PacketType;

class Level
{
    constructor(levelID, sizeX, sizeY, sizeZ)
    {    
        this.levelID = levelID;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.sizeZ = sizeZ;

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

    sendLevelData(netStream, player)
    {
        // level init
        netStream.newPacket(PacketType.LevelInit);
        netStream.sendPacket(player.socket);

        // compress block data
        var sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeUInt32BE(this.blocks.length);
        var blockBuffer = Buffer.from(this.blocks);
        var compressedBlocks = zlib.gzipSync(Buffer.concat([sizeBuffer, blockBuffer]), {level: -1});
        //console.log(compressedBlocks.length);
        
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

        // other players
        /*
        for (var player in this.players)
        {
            if (player != user.player)
            {
                netStream.newPacket(PacketType.AddPlayer);
                netStream.writeByte(player.user.userID);
                netStream.writeString(player.user.username);
                netStream.writeUShort(player.posX);
                netStream.writeUShort(player.posY);
                netStream.writeUShort(player.posZ);
                netStream.writeByte(player.yaw);
                netStream.writeByte(player.pitch);
                netStream.sendPacket(user.socket);
            }
        }
        */
    }

    fillFlatGrass()
    {
        for (var x = 0; x < this.sizeX; x++)
        {
            for (var y = 0; y < this.sizeY; y++)
            {
                for (var z = 0; z < this.sizeZ; z++)
                {
                    var block = 0;
                    if (y == 0)
                        block = 7;
                    else if (y < 3)
                        block = 1;
                    else if (y < 5)
                        block = 3;
                    else if (y < 6)
                        block = 2;
                    var index = this.flattenCoordinate(x, y, z);
                    this.blocks[index] = block;
                }
            }
        }
    }
}

module.exports = { Level };
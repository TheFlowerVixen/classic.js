const zlib = require('node:zlib');
const PacketType = require('../packet.js').PacketType;

class Level
{
    constructor(sizeX, sizeY, sizeZ)
    {    
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.sizeZ = sizeZ;

        this.players = [];
        this.blocks = new Array(this.sizeX * this.sizeY * this.sizeZ);
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

    sendLevelData(netStream, client)
    {
        // level init
        netStream.newPacket(PacketType.LevelInit);
        
        // level chunk
        netStream.writeUByte(PacketType.LevelChunk);
        const chunkData = writeAndDeflate();
        netStream.writeUShort(chunkData.length);
        netStream.write(chunkData);
        netStream.writeUByte(0xFF);

        // level finalize
        netStream.writeUByte(PacketType.LevelEnd);
        netStream.writeUShort(this.sizeX);
        netStream.writeUShort(this.sizeY);
        netStream.writeUShort(this.sizeZ);

        netStream.sendPacket(client.socket);
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
                    var index = y + (z * (this.sizeY)) + (x * (this.sizeY) * (this.sizeZ));
                    this.blocks[index] = block;
                }
            }
        }
    }

    writeAndDeflate()
    {
        var dataBuffer = Buffer.alloc(1024, 0x00);
        dataBuffer.writeInt32BE(this.blocks.length);
        for (var i = 0; i < this.blocks.length; i++)
            dataBuffer.writeInt8(this.blocks[i]);
        return zlib.deflateSync(dataBuffer, {level: -1});
    }
}

module.exports = { Level };
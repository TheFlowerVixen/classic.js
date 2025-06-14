// @ts-check

const zlib = require('node:zlib');
const fs = require('fs');
const PacketType = require('../network/packet.js').PacketType;
const serializePacket = require('../network/stream.js').serializePacket;

const LevelProperties = [
    'sideBlockID',
    'edgeBlockID',
    'edgeHeight',
    'cloudsHeight',
    'maxFog',
    'cloudsSpeed',
    'weatherSpeed',
    'weatherFade',
    'useExpFog',
    'sideHeight'
];

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

        this.entities = [];
        this.blocks = Buffer.alloc(this.sizeX * this.sizeY * this.sizeZ);
        this.customTextures = "";
        this.customWeather = 0;
        this.customProperties = {
            sideBlockID: 7,
            edgeBlockID: 8,
            edgeHeight: this.sizeY / 2,
            cloudsHeight: this.sizeY + 2,
            maxFog: 0,
            cloudsSpeed: 1.0,
            weatherSpeed: 1.0,
            weatherFade: 1.0,
            useExpFog: false,
            sideHeight: -2
        };
    }

    update()
    {
        // local update
        global.server.fireEvent('level-update', this);
    }

    networkUpdate(player)
    {
        if (global.server.ticksRan % 2 == 0)
        {
            player.socket.cork();
            for (var entity of this.entities)
            {
                if (entity != player.entity)
                    entity.sendEntityPosition(player);
            }
            player.socket.uncork();
        }
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

    addEntity(entity)
    {
        this.entities.push(entity);
        global.server.notifyEntityAdded(entity);
        global.server.fireEvent('level-entityAdded', entity);
    }

    removeEntity(entity)
    {
        var entityIndex = this.entities.indexOf(entity);
        if (entityIndex > -1)
            this.entities.splice(entityIndex, 1);
        global.server.notifyEntityRemoved(entity);
        global.server.fireEvent('level-entityRemoved', entity);
    }

    getEntityByName(name)
    {
        for (var entity of this.entities)
        {
            if (entity.name == name)
                return entity;
        }
        return null;
    }

    getEntityByID(id)
    {
        for (var entity of this.entities)
        {
            if (entity.entityID == id)
                return entity;
        }
        return null;
    }

    loadLevel()
    {
        var binPath = `levels/${this.levelName}.lvl`;
        var jsonPath = `levels/${this.levelName}.json`;
        if (fs.existsSync(binPath) && fs.existsSync(jsonPath))
        {
            Object.assign(this, JSON.parse(fs.readFileSync(jsonPath).toString()));
            this.decompressBlockData(fs.readFileSync(binPath));
        }
    }

    saveLevel()
    {
        fs.writeFileSync(`levels/${this.levelName}.json`, JSON.stringify({
            sizeX: this.sizeX,
            sizeY: this.sizeY,
            sizeZ: this.sizeZ,
            spawnX: this.spawnX,
            spawnY: this.spawnY,
            spawnZ: this.spawnZ,
            customTextures: this.customTextures,
            customWeather: this.customWeather,
            customProperties: this.customProperties
        }, null, 4));
        fs.writeFileSync(`levels/${this.levelName}.lvl`, this.compressBlockData(this.blocks));
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
        this.blocks = Buffer.alloc(blockSize);
        decompressedBlocks.copy(this.blocks, 0, 4);
    }

    sendLevelData(player, sendPosition = true)
    {
        player.socket.cork();

        // level init
        player.sendPacket(PacketType.LevelInit);

        // compress block data
        var blocksCopy = Buffer.alloc(this.blocks.length);
        this.blocks.forEach((block, index) => { blocksCopy[index] = player.getPlayerSpecificBlock(block); });
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
            
            player.sendPacket(PacketType.LevelChunk, {
                chunkLength: chunkSize,
                chunkData: chunkBuffer,
                percentComplete: (position + chunkSize) * 100 / compressedBlocks.length
            });

            remainingBlocks -= chunkSize;
            position += chunkSize;
        }

        // level finalize
        player.sendPacket(PacketType.LevelEnd, {
            sizeX: this.sizeX,
            sizeY: this.sizeY,
            sizeZ: this.sizeZ
        });

        // custom properties
        if (player.supportsExtension("EnvWeatherType", 1))
        {
            player.sendPacket(PacketType.EnvSetWeatherType, {
                weather: this.customWeather
            });
        }
        if (player.supportsExtension("EnvMapAspect", 2))
        {
            if (this.customTextures != "")
            {
                player.sendPacket(PacketType.SetMapEnvUrl, {
                    url: this.customTextures
                });
            }

            for (var j in LevelProperties)
            {
                var property = LevelProperties[j];
                var value = this.customProperties[property];
                switch (property)
                {
                    case 'sideBlockID':
                    case 'edgeBlockID':
                        value = player.getPlayerSpecificBlock(value);
                        break;
                    
                    case 'cloudsSpeed':
                    case 'weatherSpeed':
                        value = value * 256;
                        break;
                    
                    case 'weatherFade':
                        value = value * 128;
                        break;
                    
                    case 'useExpFog':
                        value = value ? 1 : 0;
                        break;
                }
                player.sendPacket(PacketType.SetMapEnvProperty, {
                    propertyID: j,
                    propertyValue: value
                });
            }
        }

        // sending it twice; once for initial position, once for spawn position
        if (sendPosition)
        {
            // Level spawn
            player.entity.teleportCentered(this.spawnX, this.spawnY, this.spawnZ);

            // Last position
            var lastPos = player.userData.lastPosition;
            if (lastPos != undefined)
                player.entity.updatePositionAndRotation(lastPos.posX, lastPos.posY, lastPos.posZ, lastPos.pitch, lastPos.yaw);
        }

        player.socket.uncork();

        // delayed other players (doesnt work otherwise)
        setTimeout(function () {
            player.socket.cork();
            for (var entity of this.entities)
                entity.sendEntityAdded(player);
            player.socket.uncork();
        }.bind(this), 50);
    }

    generateLevel(generator)
    {
        for (var x = 0; x < this.sizeX; x++)
        {
            for (var z = 0; z < this.sizeZ; z++)
            {
                for (var y = 0; y < this.sizeY; y++)
                {
                    var index = this.flattenCoordinate(x, y, z);
                    this.blocks[index] = generator.getBlock(x, y, z);
                }
            }
        }
    }

    setWeather(weather)
    {
        if (weather >= 0 && weather < 3)
        {
            this.customWeather = weather;
            global.server.notifyLevelWeatherChange(this, weather);
            return true;
        }
        return false;
    }

    setTextures(url)
    {
        if (url == "none")
        {
            this.customTextures = "";
            global.server.notifyLevelTexturesChange(this, "");
            return true;
        }
        try
        {
            new URL(url);
            this.customTextures = url;
            global.server.notifyLevelTexturesChange(this, url);
            return true;
        }
        catch (error)
        {
            return false;
        }
    }

    setProperty(propertyName, propertyValue)
    {
        if (this.customProperties[propertyName] != undefined)
        {
            this.customProperties[propertyName] = propertyValue;
            global.server.notifyLevelPropertyChange(this, propertyName, propertyValue);
            return true;
        }
        return false;
    }
}

module.exports = { Level, LevelProperties };
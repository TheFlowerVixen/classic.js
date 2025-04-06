const PacketType = require('../network/packet.js').PacketType;

class EntityPosition
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

class Entity
{
    constructor(entityID, name)
    {
        this.entityID = entityID;
        this.name = name;
        this.skin = name;
        this.model = "humanoid";
        this.level = null;
        this.position = new EntityPosition(0.0, 0.0, 0.0, 0.0, 0.0);
        this.lastPosition = this.position;
        this.player = null;
    }

    joinLevel(newLevel)
    {
        if (this.level != null)
            this.level.removeEntity(this);
        this.level = newLevel;
        this.level.addEntity(this);
        if (this.player != null)
            this.level.sendLevelData(this.player);
    }

    updatePositionAndRotation(x, y, z, pitch, yaw)
    {
        this.lastPosition = this.position;
        this.position = new EntityPosition(x, y, z, pitch, yaw);
        global.server.notifyEntityPosition(this);
    }

    teleport(x, y, z)
    {
        this.updatePositionAndRotation(x, y, z, 0, 0);
        global.server.notifyEntityTeleport(this);
    }

    teleportCentered(x, y, z)
    {
        this.teleport(x + 0.5, y + 1.59375, z + 0.5);
    }

    changeModel(model)
    {
        this.model = model;
        global.server.notifyEntityModelChange(this, model);
    }

    getIDFor(player)
    {
        if (player === this.player)
            return 255; // You!
        return this.entityID;
    }

    sendEntityAdded(player)
    {
        if (player.supportsExtension("ExtPlayerList", 2))
        {
            player.sendPacket(PacketType.ExtAddEntity2, {
                entityID: this.getIDFor(player),
                inGameName: this.name,
                skinName: this.skin,
                spawnX: this.position.posX,
                spawnY: this.position.posY,
                spawnZ: this.position.posZ,
                spawnYaw: this.position.yaw,
                spawnPitch: this.position.pitch
            });
        }
        else
        {
            player.sendPacket(PacketType.AddPlayer, {
                playerID: this.getIDFor(player),
                playerName: this.name,
                posX: this.position.posX,
                posY: this.position.posY,
                posZ: this.position.posZ,
                yaw: this.position.yaw,
                pitch: this.position.pitch
            });
        }

        if (player.supportsExtension("ChangeModel", 1))
        {
            player.sendPacket(PacketType.ChangeModel, {
                entityID: this.getIDFor(player),
                model: this.model
            });
        }
    }

    sendEntityRemoved(player)
    {
        player.sendPacket(PacketType.RemovePlayer, {
            playerID: this.getIDFor(player)
        });
    }

    sendEntityPosition(player)
    {
        player.sendPacket(PacketType.PlayerPosition, {
            playerID: this.getIDFor(player),
            posX: this.position.posX,
            posY: this.position.posY,
            posZ: this.position.posZ,
            yaw: this.position.yaw,
            pitch: this.position.pitch
        });
    }
}

module.exports = { Entity, EntityPosition };
class Player
{
    constructor(client)
    {
        this.client = client;
        this.posX = 0.0;
        this.posY = 0.0;
        this.posZ = 0.0;
        this.pitch = 0.0;
        this.yaw = 0.0;
        this.onGround = false;
    }

    updatePosition(x, y, z)
    {
        this.posX = x;
        this.posY = y;
        this.posZ = z;
    }

    updateRotation(p, yw)
    {
        this.pitch = p;
        this.yaw = yw;
    }

    updatePositionAndRotation(x, y, z, p, yw)
    {
        this.posX = x;
        this.posY = y;
        this.posZ = z;
        this.pitch = p;
        this.yaw = yw;
    }
}

module.exports = { Player };
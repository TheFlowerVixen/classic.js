class Plugin
{
    constructor(name)
    {
        this.name = name;
        this.packetHandlers = {};
        this.eventHandlers = {};
    }

    onLoad(server)
    {

    }

    onUnload(server)
    {

    }

    registerPacketHandler(id, func)
    {
        this.packetHandlers[id] = func;
    }

    hasPacketHandler(id)
    {
        return this.packetHandlers[id] != undefined;
    }

    getPacketHandler(id)
    {
        return this.packetHandlers[id];
    }

    registerEventHandler(id, func)
    {
        this.eventHandlers[id] = func;
    }

    hasEventHandler(id)
    {
        return this.eventHandlers[id] != undefined;
    }

    getEventHandler(id)
    {
        return this.eventHandlers[id];
    }
}

module.exports = { Plugin };
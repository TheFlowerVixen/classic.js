const EventType = {
    PlayerConnected: 0,
    PlayerAdded: 1,
    PlayerRemoved: 2,
    PlayerDisconnected: 3,
    PlayerMessage: 4,
    PlayerCommand: 5,
    ServerSendLevelData: 6,
    BlockPlaced: 7,
    BlockRemoved: 8,
}

module.exports = { EventType };
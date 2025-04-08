const EventType = {
    PlayerConnected: 0,
    PlayerDisconnected: 1,
    PlayerChangeLevel: 2,
    PlayerMessage: 3
}

const EventData = [];

EventData[EventType.PlayerConnected] = {
    cancellable: false,
    onRemote: (otherPlayer) => {
        otherPlayer.sendMessage(`&e${this.username} joined the game`);
    }
}

EventData[EventType.PlayerDisconnected] = {
    cancellable: false,
    onRemote: (otherPlayer) => {
        otherPlayer.sendMessage(`&e${this.username} left the game`);
    }
}

EventData[EventType.PlayerChangeLevel] = {
    cancellable: false,
    onRemote: (otherPlayer) => {
        player.sendPlayerListAdded(otherPlayer);
    }
};

EventData[EventType.PlayerMessage] = {
    cancellable: true,
    onRemote: (otherPlayer) => {
        if (player.localChat && otherPlayer.currentLevel === player.currentLevel)
            otherPlayer.sendMessage(`(LOCAL) <${player.username}> ${message}`);
        else
            otherPlayer.sendMessage(`<${player.username}> ${message}`);
    }
};
const DataType = require('../modules/packet.js').DataType;
const PacketType = require('../modules/packet.js').PacketType;
const definePacketType = require('../modules/packet.js').definePacketType;
const serializePacket = require('../modules/packet.js').serializePacket;
const Plugin = require('../modules/plugin.js').Plugin;
const EventType = require('../modules/event.js').EventType;

const ExtendedPacketType = {
    ClickDistance: 0x12,
    HoldThis: 0x14
}

class ExtensionsPlugin extends Plugin
{
    constructor()
    {
        super("Extensions");
    }

    onInit(server)
    {
        /*
        // Click Distance
        server.addSupportedExtension("ClickDistance", 1);
        definePacketType(ExtendedPacketType.ClickDistance, {
            distance: DataType.Fixed
        });

        // Held Block
        server.addSupportedExtension("HeldBlock", 1);
        definePacketType(ExtendedPacketType.HoldThis, {
            blockToHold: DataType.UByte,
            preventChange: DataType.UByte
        });

        // Message Types
        server.addSupportedExtension("MessageTypes", 1);

        // Longer Messages
        server.addSupportedExtension("LongerMessages", 1);
        definePacketType(PacketType.Message, { // override packet type example
            messageType: DataType.UByte,
            message: DataType.UntrimmedString
        });
        this.registerPacketHandler(PacketType.Message, function(player, data) {
            var message = data.message.trimEnd();
            if (player.supportsExtension("LongerMessages", 1))
            {
                if (data.messageType != 0x0)
                {
                    player.storedMessage += data.message;
                    return false;
                }
                else if (player.storedMessage != "")
                {
                    message = player.storedMessage.trimEnd();
                    player.storedMessage = "";
                }
            }

            console.log(`${player.username}: ${message}`);
            if (message.startsWith('/'))
                player.handleCommand(message.split(' '));
            else
                global.server.notifyPlayerMessage(player, message, data.messageType);

            return false;
        });
        */

        // Commands
        this.registerEventHandler(EventType.PlayerCommand, function(args) {
            switch (args.cmdArgs[0])
            {
                case '/clickdistance':
                case '/cd':
                    if (args.player.supportsExtension("ClickDistance", 1))
                    {
                        var value = 3.75;
                        if (args.cmdArgs[1] != undefined && typeof args.cmdArgs[1] === "string")
                            value = parseFloat(args.cmdArgs[1]);
                        args.player.sendMessage(`&eClick distance set to ${value}`);
                        args.player.clickDistance = value;
                        args.player.socket.write(serializePacket(ExtendedPacketType.ClickDistance, { distance: args.player.clickDistance }));
                    }
                    break;
                case '/hold':
                    if (args.player.supportsExtension("HeldBlock", 1))
                    {
                        var holdPacket = serializePacket(ExtendedPacketType.HoldThis, {
                            blockToHold: parseInt(args.cmdArgs[1]),
                            preventChange: parseInt(args.cmdArgs[2])
                        });
                        args.player.socket.write(holdPacket);
                    }
                    break;
            }
            return true;
        });

        // testing
        this.registerEventHandler(EventType.PlayerConnected, function(args) {
            args.player.sendMessage("Welcome to the server!", 100);
            if (args.player.supportsExtension("ClickDistance", 1))
            {
                args.player.clickDistance = 3.75;
                args.player.socket.write(serializePacket(ExtendedPacketType.ClickDistance, { distance: args.player.clickDistance }));
            }
            if (args.player.supportsExtension("LongerMessages", 1))
            {
                args.player.storedMessage = "";
            }
            return true;
        });
    }
}

module.exports = { ExtensionsPlugin };
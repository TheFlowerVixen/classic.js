// @ts-check

const CommandResult = {
    NoSuchCommand: 1,
    InvalidArguments: 2,
    NoPermission: 3,
    Error: 4,
    Success: 5
};

const DefaultCommands = [
    {
        name: "help",
        aliases: ["h", "?"],
        description: "Shows this help message",
        usage: "/<command>",
        executor: (sender, args) => {
            var commands = global.server.commands;
            for (var command of commands)
            {
                if (args.length > 0)
                {
                    if (args[0] == command.name || command.aliases.indexOf(args[0]) > -1)
                    {
                        sender.sendMessage(`/${command.name} - ${command.description}`);
                        sender.sendMessage(`Usage: ${command.usage.replace("<command>", command.name)}`);
                        break;
                    }
                }
                else
                    sender.sendMessage(`/${command.name} - ${command.description}`);
            }
            return CommandResult.Success;
        }
    },

    {
        name: "position",
        aliases: ["pos"],
        description: "Shows you your current position",
        usage: "/<command>",
        executor: (sender, args) => {
            if (!sender.isPlayer)
                return CommandResult.Success;
            sender.sendMessage(`&ePosition: &cX &e${sender.entity.position.posX}, &aY &e${sender.entity.position.posY}, &9Z &e${sender.entity.position.posZ}`);
            return CommandResult.Success;
        }
    },

    {
        name: "leave",
        aliases: [],
        description: "Disconnects you from the server",
        usage: "/<command>",
        executor: (sender, args) => {
            if (!sender.isPlayer)
                return CommandResult.Success;
            sender.disconnect('See ya!');
            return CommandResult.Success;
        }
    },

    {
        name: "reload",
        aliases: [],
        description: "Reloads the server",
        usage: "/<command>",
        requiredRank: 100,
        executor: (sender, args) => {
            sender.sendMessage('&eReloading...');
            global.server.reload();
            sender.sendMessage('&aReload complete');
            return CommandResult.Success;
        }
    },

    {
        name: "level",
        aliases: ["lvl"],
        description: "Do level-related things",
        usage: "/<command> <option> <args>",
        executor: (sender, args) => {
            switch (args[0])
            {
                case 'reload':
                    if (!sender.isPlayer)
                        return CommandResult.Success;
                    sender.sendMessage('&eReloading current level...');
                    sender.currentLevel.sendLevelData(sender, false);
                    break;
                
                case 'create':
                    if (!sender.hasRank(100))
                        return CommandResult.NoPermission;

                    var name = args[1];
                    var sizeX = parseInt(args[2]);
                    var sizeY = parseInt(args[3]);
                    var sizeZ = parseInt(args[4]);
                    sender.sendMessage(`&eCreating level ${name}, please wait...`);
                    var success = global.server.createLevel(name, sizeX, sizeY, sizeZ);
                    if (success)
                        sender.sendMessage(`&aLevel ${name} created successfully!`);
                    else
                        sender.sendMessage(`&cLevel ${name} already exists!`);
                    break;

                case 'goto':
                    if (!sender.isPlayer)
                        return CommandResult.Success;
                    var code = global.server.sendPlayerToLevel(sender, args[1]);
                    if (code == 1)
                        sender.sendMessage('&cThat level does not exist!');
                    if (code == 2)
                        sender.sendMessage('&cYou are already in this level!');
                    break;
                
                case 'weather':
                    if (!sender.hasRank(100))
                        return CommandResult.NoPermission;
                    if (!sender.supportsCPE)
                        sender.sendMessage('&bNOTE: &eYou are running a vanilla client, so you will not be able to see these changes.');
                    var success = sender.currentLevel.setWeather(parseInt(args[1]));
                    break;
                
                case 'textures':
                    if (!sender.hasRank(100))
                        return CommandResult.NoPermission;
                    if (sender.supportsCPE)
                        sender.sendMessage('&bNOTE: &eYou are running a vanilla client, so you will not be able to see these changes.');
                    var success = sender.currentLevel.setTextures(args[1]);
                    break;
                
                case 'property':
                    if (!sender.hasRank(100))
                        return CommandResult.NoPermission;
                    if (!sender.supportsCPE)
                        sender.sendMessage('&bNOTE: &eYou are running a vanilla client, so you will not be able to see these changes.');
                    var success = sender.currentLevel.setProperty(args[1], parseFloat(args[2]));
                    break;
            }
            return CommandResult.Success;
        }
    },

    {
        name: "elist",
        aliases: [],
        description: "Show a list of entities currently in the server",
        usage: "/<command>",
        requiredRank: 100,
        executor: (sender, args) => {
            function sendEListMessage(list, type)
            {
                var msg = `&eEntities in ${type}: `;
                for (var entity of list)
                    msg += `${entity.name} (${entity.entityID}) `;
                sender.sendMessage(msg);
            } 
            sendEListMessage(sender.getCurrentLevel().entities, `level "${sender.getCurrentLevel().levelName}"`);
            sendEListMessage(global.server.entities, "server");
            return CommandResult.Success;
        }
    },

    {
        name: "clear",
        aliases: [],
        description: "Clears your hotbar",
        usage: "/<command>",
        executor: (sender, args) => {
            if (!sender.isPlayer)
                return CommandResult.Success;
            if (sender.supportsExtension("SetHotbar", 1))
            {
                for (var i = 0; i < 9; i++)
                    sender.setHotbar(0, i);
            }
            else
                sender.sendMessage("&cYour client doesn't support this!");
            return CommandResult.Success;
        }
    },

    {
        name: "local",
        aliases: ["lc"],
        description: "Switches your chat mode to local",
        usage: "/<command>",
        executor: (sender, args) => {
            if (!sender.isPlayer)
                return CommandResult.Success;
            if (!sender.localChat)
            {
                sender.localChat = true;
                sender.sendMessage('&eYou are now chatting locally');
            }
            return CommandResult.Success;
        }
    },

    {
        name: "global",
        aliases: ["gc"],
        description: "Switches your chat mode to global",
        usage: "/<command>",
        executor: (sender, args) => {
            if (!sender.isPlayer)
                return CommandResult.Success;
            if (sender.localChat)
            {
                sender.localChat = false;
                sender.sendMessage('&eYou are now chatting globally');
            }
            return CommandResult.Success;
        }
    },

    {
        name: "model",
        aliases: ["m"],
        description: "Changes your model",
        usage: "/<command> <model>",
        executor: (sender, args) => {
            if (!sender.isPlayer)
                return CommandResult.Success;
            if (args.length < 1)
                return CommandResult.InvalidArguments;
            sender.entity.changeModel(args[0]);
            if (!sender.supportsExtension("ChangeModel", 1))
                sender.sendMessage('&bNOTE: &eYour client does not support this feature, so you will not be able to see this change.');
            return CommandResult.Success;
        }
    },

    {
        name: "stop",
        aliases: [],
        description: "Stops the server",
        usage: "/<command>",
        requiredRank: 100,
        executor: (sender, args) => {
            global.server.broadcastMessage('&eServer stopping...');
            global.server.shutDownServer();
            return CommandResult.Success;
        }
    },

    {
        name: "op",
        aliases: [],
        description: "Elevates a player's rank",
        usage: "/<command> <user>",
        requiredRank: 100,
        executor: (sender, args) => {
            if (args.length < 1)
                return CommandResult.InvalidArguments;
            var player = global.server.getPlayer(args[0]);
            if (player == null)
            {
                sender.sendMessage(`&cPlayer ${args[0]} is not online or doesn't exist!`);
                return CommandResult.Success;
            }
            player.userData.rank = 100;
            sender.sendMessage(`&aOpped ${player.username}`);
            return CommandResult.Success;
        }
    },

    {
        name: "deop",
        aliases: [],
        description: "De-elevates a player's rank",
        usage: "/<command> <user>",
        requiredRank: 100,
        executor: (sender, args) => {
            if (args.length < 1)
                return CommandResult.InvalidArguments;
            var player = global.server.getPlayer(args[0]);
            if (player == null)
            {
                sender.sendMessage(`&cPlayer ${args[0]} is not online or doesn't exist!`);
                return CommandResult.Success;
            }
            if (player == sender)
            {
                sender.sendMessage(`&cYou can't de-op yourself!`);
                return CommandResult.Success;
            }
            player.userData.rank = 0;
            sender.sendMessage(`&aDe-opped ${player.username}`);
            return CommandResult.Success;
        }
    },

    {
        name: "say",
        aliases: [],
        description: "Sends a global message to everyone",
        usage: "/<command> <message>",
        requiredRank: 100,
        executor: (sender, args) => {
            // Re-combine args
            var message = args.join(' ');
            global.server.broadcastMessage(`[${sender.getName()}] ${message}`);
            return CommandResult.Success;
        }
    },

    {
        name: "kick",
        aliases: [],
        description: "Disconnects a player from the server",
        usage: "/<command> <name> <reason>",
        requiredRank: 100,
        executor: (sender, args) => {
            if (args.length < 1)
                return CommandResult.InvalidArguments;
            var player = global.server.getPlayer(args[0]);
            if (player == null)
            {
                sender.sendMessage(`&cPlayer ${args[0]} is not online or doesn't exist!`);
                return CommandResult.Success;
            }
            /*
            if (player == sender)
            {
                sender.sendMessage(`&cYou can't kick yourself!`);
                return CommandResult.Success;
            }
            */
            var reason = "You were kicked from the server!";
            if (args.length > 1)
                reason = args.splice(1).join(' ');
            player.disconnect(reason);
            sender.sendMessage(`&aKicked ${player.username}`);
            return CommandResult.Success;
        }
    },

    {
        name: "ban",
        aliases: [],
        description: "Bans a player from the server",
        usage: "/<command> <name> <reason>",
        requiredRank: 100,
        executor: (sender, args) => {
            if (args.length < 1)
                return CommandResult.InvalidArguments;
            var player = global.server.getPlayer(args[0]);
            if (player == null)
            {
                sender.sendMessage(`&cPlayer ${args[0]} is not online or doesn't exist!`);
                return CommandResult.Success;
            }
            /*
            if (player == sender)
            {
                sender.sendMessage(`&cYou can't kick yourself!`);
                return CommandResult.Success;
            }
            */
            var reason = "You are permanently banned!";
            if (args.length > 1)
                reason = args.splice(1).join(' ');
            var result = global.server.banPlayer(player, reason);
            if (result)
                sender.sendMessage(`&aBanned ${player.username}`);
            else
                sender.sendMessage(`&cThat player is already banned (and is somehow still online)!`);
            return CommandResult.Success;
        }
    },

    {
        name: "pardon",
        aliases: ["unban"],
        description: "Un-bans a player from the server",
        usage: "/<command> <name>",
        requiredRank: 100,
        executor: (sender, args) => {
            if (args.length < 1)
                return CommandResult.InvalidArguments;
            var result = global.server.pardonPlayer(args[0]);
            if (result)
                sender.sendMessage(`&aPardoned ${args[0]}`);
            else
                sender.sendMessage(`&cThat player isn't banned!`);
            return CommandResult.Success;
        }
    }
];

class CommandSender
{
    constructor()
    {
        this.isPlayer = false;
    }

    getName()
    {
        return "@";
    }

    getCurrentLevel()
    {
        return null;
    }

    sendMessage()
    {

    }

    hasRank(rank)
    {
        return false;
    }
}

module.exports = { CommandResult, DefaultCommands, CommandSender };
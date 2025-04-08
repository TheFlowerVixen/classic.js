const CommandResult = {
    NoSuchCommand: 1,
    InvalidArguments: 2,
    Success: 3
};

function getDefaultCommands()
{
    var commands = [];

    commands.push({
        name: "help",
        aliases: ["h", "?"],
        description: "Shows this help message",
        usage: "/<command>",
        executor: (sender, args) => {
            var commands = global.server.getAllCommands();
            for (var command of commands)
            {
                if (args.length > 0 && (args[0] == command.name || command.aliases.indexOf(args[0]) > -1))
                {
                    sender.sendMessage(`/${command.name} - ${command.description}`);
                    sender.sendMessage(`Usage: ${command.usage.replace("<command>", command.name)}`);
                    break;
                }
                sender.sendMessage(`/${command.name} - ${command.description}`);
            }
            return CommandResult.Success;
        }
    });

    commands.push({
        name: "position",
        aliases: ["pos"],
        description: "Shows you your current position",
        usage: "/<command>",
        executor: (sender, args) => {
            sender.sendMessage(`&ePosition: &cX &e${sender.entity.position.posX}, &aY &e${sender.entity.position.posY}, &9Z &e${sender.entity.position.posZ}`);
            return CommandResult.Success;
        }
    });

    commands.push({
        name: "leave",
        aliases: [],
        description: "Disconnects you from the server",
        usage: "/<command",
        executor: (sender, args) => {
            sender.disconnect('See ya!');
            return CommandResult.Success;
        }
    });

    commands.push({
        name: "reload",
        aliases: [],
        description: "Reloads server plugins",
        usage: "/<command>",
        executor: (sender, args) => {
            global.server.reload();
            return CommandResult.Success;
        }
    });

    commands.push({
        name: "level",
        aliases: ["lvl"],
        description: "Do level-related things",
        usage: "/<command> <option> <args>",
        executor: (sender, args) => {
            switch (args[0])
            {
                case 'reload':
                    sender.sendMessage('&eReloading current level...');
                    sender.currentLevel.sendLevelData(sender, false);
                    break;
                
                case 'create':
                    var name = args[1];
                    var sizeX = parseInt(args[2]);
                    var sizeY = parseInt(args[3]);
                    var sizeZ = parseInt(args[4]);
                    var success = global.server.createLevel(name, sizeX, sizeY, sizeZ);
                    break;

                case 'goto':
                    var code = global.server.sendPlayerToLevel(sender, args[1]);
                    if (code == 1)
                        sender.sendMessage('&cThat level does not exist!');
                    if (code == 2)
                        sender.sendMessage('&cYou are already in this level!');
                    break;
                
                case 'weather':
                    if (!sender.supportsCPE)
                        sender.sendMessage('&bNOTE: &eYou are running a vanilla client, so you will not be able to see these changes.');
                    var success = sender.currentLevel.setWeather(parseInt(args[1]));
                    break;
                
                case 'textures':
                    if (sender.supportsCPE)
                        sender.sendMessage('&bNOTE: &eYou are running a vanilla client, so you will not be able to see these changes.');
                    var success = sender.currentLevel.setTextures(args[1]);
                    break;
                
                case 'property':
                    if (!sender.supportsCPE)
                        sender.sendMessage('&bNOTE: &eYou are running a vanilla client, so you will not be able to see these changes.');
                    var success = sender.currentLevel.setProperty(args[1], parseFloat(args[2]));
                    break;
            }
            return CommandResult.Success;
        }
    });

    commands.push({
        name: "elist",
        aliases: [],
        description: "Show a list of entities currently in the server",
        usage: "/<command>",
        executor: (sender, args) => {
            function sendEListMessage(list, type)
            {
                var msg = `&eEntities in ${type}: `;
                for (var entity of list)
                    msg += `${entity.name} (${entity.entityID}) `;
                sender.sendMessage(msg);
            }
            sendEListMessage(sender.currentLevel.entities, "level");
            sendEListMessage(global.server.entities, "server");
        }
    });

    return commands;
}

module.exports = { CommandResult, getDefaultCommands };
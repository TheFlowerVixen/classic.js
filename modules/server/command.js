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
                console.log(args.length);
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
        description: "Re-sends the current world data",
        usage: "/<command>",
        executor: (sender, args) => {
            sender.currentLevel.sendLevelData(sender, false);
            return CommandResult.Success;
        }
    });

    return commands;
}

module.exports = { CommandResult, getDefaultCommands };
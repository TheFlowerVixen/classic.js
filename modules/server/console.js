const CommandSender = require('./command.js').CommandSender;
const readline = require('readline');

const ColorCodeToANSICode = "042615378cae9dbf";

function ansiColorMessage(message)
{
    var newMessage = "";
    for (var i = 0; i < message.length; i++)
    {
        var chr = message[i];
        if (chr == "&")
        {
            i++;
            var codeIndex = ColorCodeToANSICode.indexOf(message[i]);
            if (codeIndex > -1)
            {
                var code = codeIndex > 7 ? 90 + (codeIndex - 8) : 30 + codeIndex;
                newMessage += `\x1b[${code}m`;
            }
        }
        else
            newMessage += chr;
    }
    return `${newMessage}\x1b[0m`;
}

class Console extends CommandSender
{
    constructor()
    {
        super();
        this.interface = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: "> "
        });
        this.interface.on('line', this.onLine.bind(this));
    }

    getName()
    {
        return "Server";
    }

    getCurrentLevel()
    {
        return global.server.levels[global.server.properties.mainLevel];
    }

    sendMessage(message, type = 0)
    {
        console.log(ansiColorMessage(message));
    }

    hasRank(rank)
    {
        return true;
    }

    onLine(line)
    {
        var args = line.split(' ');
        var commandName = args.splice(0, 1)[0];
        global.server.doCommand(this, commandName, args);
        global.server.fireEvent('server-command', this, commandName, args);
    }
}

module.exports = { Console, ansiColorMessage };
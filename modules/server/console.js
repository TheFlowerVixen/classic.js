const CommandSender = require('./command.js').CommandSender;
const readline = require('readline');

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
        console.log(message);
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

module.exports = { Console };
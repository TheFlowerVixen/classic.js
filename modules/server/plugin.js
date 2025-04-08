const CommandResult = require('./command.js').CommandResult;

class Plugin
{
    constructor(name)
    {
        this.name = name;
        this.commands = [];
    }

    onLoad(server)
    {

    }

    onUnload(server)
    {

    }

    registerCommand(command)
    {
        this.commands.push(command);
    }

    getCommands()
    {
        return this.commands;
    }
}

module.exports = { Plugin };
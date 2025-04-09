const CommandResult = require('./command.js').CommandResult;
const EventEmitter = require('events').EventEmitter;

class Plugin extends EventEmitter
{
    constructor(name)
    {
        super();
        this.name = name;
        this.commands = [];
        this.eventCancelled = false;
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
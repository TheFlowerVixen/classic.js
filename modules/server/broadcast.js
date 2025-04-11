// @ts-check

const randomInt = require('node:crypto').randomInt;
const base62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const https = require('https');
const http = require('http');
const querystring = require('querystring');

class Broadcaster
{
    constructor(server)
    {
        this.server = server;
        this.host = this.server.properties.broadcastURL;
        this.port = this.server.properties.useHTTPS ? 443 : 80;
        this.requestModule = this.server.properties.useHTTPS ? https : http;

        this.salt = this.generateSalt();
        this.broadcastInterval = null;
        this.joinURL = "";
        this.lastBroadcastWasSuccessful = false;
    }

    generateSalt()
    {
        var saltString = "";
        for (var i = 0; i < 16; i++)
            saltString += base62[randomInt(base62.length)];
        return saltString;
    }

    startBroadcasting()
    {
        console.log('Broadcasting...');
        this.broadcast();
        this.broadcastInterval = setInterval(this.broadcast.bind(this), this.server.properties.broadcastInterval * 1000);
    }

    broadcast()
    {
        try
        {
            const query = {
                name: this.server.properties.listName,
                port: this.server.properties.port,
                users: this.server.getPlayerCount(),
                max: this.server.properties.maxPlayers,
                public: this.server.properties.public,
                salt: this.salt,
                software: "classic.js Alpha 0",
                web: false, //this.server.properties.allowWebClients,
                version: 7
            };
            const options = {
                hostname: this.host,
                port: this.port,
                path: `/heartbeat.jsp?${querystring.stringify(query)}`,
                method: 'GET',
                headers: {
                    'Host': 'www.' + this.host,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };
            var request = this.requestModule.request(options, function(result) {
                result.setEncoding('utf8');
                result.on('data', this.onResponse.bind(this));
            }.bind(this));

            request.write("\0");
            request.end();
        }
        catch (error)
        {
            console.error(error);
        }
    }

    onResponse(data)
    {
        if (data.startsWith('http'))
        {
            if (this.joinURL != data)
            {
                this.joinURL = data;
                console.log(`Successfully broadcasted server, join link: ${this.joinURL}`);
            }
            this.lastBroadcastWasSuccessful = true;
            return;
        }
        this.lastBroadcastWasSuccessful = false;
        const result = JSON.parse(data);
        if (result.status == 'fail')
            console.log(`Failed to broadcast to ${this.host}: ${result.errors}`);
    }
}

module.exports = { Broadcaster };
const randomInt = require('node:crypto').randomInt;
const base62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const https = require('https');
const http = require('http');

class Broadcaster
{
    constructor(host, useHttps)
    {
        this.agent = null;
        this.host = host;
        
        this.port = useHttps ? 443 : 80;
        this.requestModule = useHttps ? https : http; 
        this.salt = this.generateSalt();
        this.broadcastInterval = null;
    }

    generateSalt()
    {
        var saltString = "";
        for (var i = 0; i < 16; i++)
            saltString += base62[randomInt(base62.length)];
        return saltString;
    }

    generateParameters()
    {
        const port = encodeURIComponent(global.server.properties.port);
        const max = encodeURIComponent(global.server.properties.maxPlayers);
        const name = encodeURIComponent(global.server.properties.listName);
        const isPublic = encodeURIComponent(global.server.properties.public);
        const salt = encodeURIComponent(this.salt);
        const users = encodeURIComponent(global.server.getPlayerCount());
        encodeURI
        const software = encodeURIComponent("classic.js Alpha 0");
        const parameters = `name=${name}&port=${port}&users=${users}&max=${max}&public=${isPublic}&salt=${salt}&software=${software}&version=7`;
        return parameters;
    }

    startBroadcasting()
    {
        console.log('Broadcasting...');
        this.broadcast();
        this.broadcastInterval = setInterval(this.broadcast.bind(this), global.server.properties.broadcastInterval * 1000);
    }

    broadcast()
    {
        try
        {
            const parameters = this.generateParameters();
            const options = {
                hostname: this.host,
                port: this.port,
                path: `/heartbeat.jsp`,
                method: 'GET',
                headers: {
                    'Host': 'www.' + this.host,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
            var request = this.requestModule.request(options, function(result) {
                result.setEncoding('utf8');
                result.on('data', this.onResponse.bind(this));
            }.bind(this));

            request.write(parameters);
            request.end();
        }
        catch (error)
        {
            console.error(error);
        }
    }

    onResponse(data)
    {
        if (data.startsWith('http://'))
        {
            console.log(`Successfully broadcasted server, join link: ${data}`);
            return;
        }
        const result = JSON.parse(data);
        if (result.status == 'fail')
            console.log(`Failed to broadcast to ${this.host}: ${result.errors}`);
    }
}

module.exports = { Broadcaster };
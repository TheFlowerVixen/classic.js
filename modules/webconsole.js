const fs = require('fs');
const http = require('http');

class WebConsole
{
    constructor()
    {
        this.httpServer = null;
    }

    openConsole()
    {
        this.httpServer = http.createServer(this.onRequest.bind(this));
        this.httpServer.listen(80, () => { console.log('WebConsole server listening'); });
    }

    onRequest(req, res)
    {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(fs.readFileSync('webconsole/console.html'));
        res.end();
    }
}

module.exports = { WebConsole };
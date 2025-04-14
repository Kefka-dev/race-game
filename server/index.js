const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
const clients = {};

wss.on('connection', (ws) => {
    const id = Date.now();
    clients[id] = ws;

    console.log(`Player ${id} connected`);
    ws.send(JSON.stringify({ type: 'welcome', playerId: id }));

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        if (data.type === 'playerUpdate') {
            data.playerId = id;

            // Pošli všetkým ostatným
            for (const [otherId, client] of Object.entries(clients)) {
                if (parseInt(otherId) !== id && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            }
        }
    });

    ws.on('close', () => {
        console.log(`Player ${id} disconnected`);
        delete clients[id];

        // Informuj ostatných
        const msg = JSON.stringify({ type: 'playerDisconnected', playerId: id });
        for (const client of Object.values(clients)) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        }
    });
});

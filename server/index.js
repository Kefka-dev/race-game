const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
const clients = {};

const spawnPoints = [
    { x: 296, y: 32, rotation: Math.PI/2 },
    { x: 296, y: 96, rotation: Math.PI/2 },
];

const usedSpawnPoints = new Set();

function getNextAvailableSpawnPoint() {
    for (let i = 0; i < spawnPoints.length; i++) {
        if (!usedSpawnPoints.has(i)) {
            usedSpawnPoints.add(i);
            return { point: spawnPoints[i], index: i };
        }
    }
    return { point: spawnPoints[0], index: 0 };
}

wss.on('connection', (ws) => {
    const id = Date.now();
    clients[id] = ws;

    console.log(`Player ${id} connected`);

    const { point, index } = getNextAvailableSpawnPoint();
    ws.spawnPointIndex = index;

    ws.send(JSON.stringify({
        type: 'welcome',
        playerId: id,
        spawnX: point.x,
        spawnY: point.y,
        spawnRotation: point.rotation
    }));

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        if (data.type === 'playerUpdate') {
            data.playerId = id;
            for (const [otherId, client] of Object.entries(clients)) {
                if (parseInt(otherId) !== id && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            }
        }
    });

    ws.on('close', () => {
        console.log(`Player ${id} disconnected`);
        usedSpawnPoints.delete(ws.spawnPointIndex);
        delete clients[id];

        const msg = JSON.stringify({
            type: 'playerDisconnected',
            playerId: id
        });
        for (const client of Object.values(clients)) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        }
    });
});
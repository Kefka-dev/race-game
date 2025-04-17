const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
const clients = {};
let nextPlayerId = 0;

const spawnPoints = [
    { x: 296, y: 32, rotation: Math.PI/2 },
    { x: 296, y: 96, rotation: Math.PI/2 },
];

const assignedSpawnPoints = new Map(); // Track which client ID has which spawn point index
let gameState = 'WAITING'; //'WAITING' or 'RACING'
const MIN_PLAYERS_TO_START = 2;

function getNextAvailableSpawnPointIndex() {
    for (let i = 0; i < spawnPoints.length; i++) {
        let found = false;
        for (const assignedIndex of assignedSpawnPoints.values()) {
            if (assignedIndex === i) {
                found = true;
                break;
            }
        }
        if (!found) {
            return i;
        }
    }
    // Simple fallback/error: reuse first point or handle error
    console.warn("No free spawn points, reusing index 0");
    return 0;
}

function broadcast(data, senderId = null) {
    const message = JSON.stringify(data);
    for (const [id, client] of Object.entries(clients)) {
        // Optionally skip sender, though often unnecessary for state updates
        // if (senderId && parseInt(id) === senderId) continue;

        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

function startGame() {
    if (gameState !== 'WAITING') return; // Prevent multiple starts

    console.log("--- Starting Game ---");
    gameState = 'RACING';

    const initialPlayerData = {}; // Collect data for the start message

    // Assign spawn points now
    for (const idStr of Object.keys(clients)) {
        const id = parseInt(idStr);
        const spawnIndex = getNextAvailableSpawnPointIndex();
        assignedSpawnPoints.set(id, spawnIndex);
        clients[id].spawnPointIndex = spawnIndex; // Store on ws connection too

        const spawnPoint = spawnPoints[spawnIndex];
        initialPlayerData[id] = {
            x: spawnPoint.x,
            y: spawnPoint.y,
            rotation: spawnPoint.rotation
        };
    }

    // Send start signal to everyone
    for (const [idStr, client] of Object.entries(clients)) {
        const id = parseInt(idStr);
        const spawnIndex = client.spawnPointIndex;
        const spawnPoint = spawnPoints[spawnIndex];

        client.send(JSON.stringify({
            type: 'startGame',
            playerId: id,
            spawnX: spawnPoint.x,
            spawnY: spawnPoint.y,
            spawnRotation: spawnPoint.rotation,
            initialPlayers: initialPlayerData // Send everyone's starting state
        }));
    }
}

wss.on('connection', (ws) => {
    const id = nextPlayerId++;
    clients[id] = ws;
    ws.playerId = id; // Store ID on ws object

    console.log(`Player ${id} connected. Total players: ${Object.keys(clients).length}`);

    // Send basic welcome, only the ID is needed initially
    ws.send(JSON.stringify({
        type: 'assignId',
        playerId: id
    }));

    // Notify others (optional, good for lobby UI)
    broadcast({
        type: 'playerJoined',
        playerId: id
    }, id); // Tell others someone joined

    // Check if we can start the game
    if (gameState === 'WAITING' && Object.keys(clients).length >= MIN_PLAYERS_TO_START) {
        startGame();
    } else if (gameState === 'RACING') {
        // Handle late joiners - assign spawn point immediately and send startGame only to them
        // This is a basic implementation; might need refinement based on desired game logic
        const spawnIndex = getNextAvailableSpawnPointIndex();
        assignedSpawnPoints.set(id, spawnIndex);
        ws.spawnPointIndex = spawnIndex;
        const spawnPoint = spawnPoints[spawnIndex];

        // Collect current state of OTHERS for the late joiner
        const currentPlayersData = {};
        for (const [otherIdStr, otherClient] of Object.entries(clients)) {
            const otherId = parseInt(otherIdStr);
            if (otherId === id) continue; // Skip self
            // Need a way to get current positions - requires storing last known state
            // For now, just send spawn points as approximation
            const otherSpawnIndex = otherClient.spawnPointIndex;
            if (otherSpawnIndex !== undefined) {
                const otherSpawn = spawnPoints[otherSpawnIndex];
                currentPlayersData[otherId] = {
                    x: otherSpawn.x, // Placeholder - ideally current position
                    y: otherSpawn.y, // Placeholder - ideally current position
                    rotation: otherSpawn.rotation // Placeholder - ideally current rotation
                };
            }
        }


        ws.send(JSON.stringify({
            type: 'startGame', // Late joiner also uses this to initialize
            playerId: id,
            spawnX: spawnPoint.x,
            spawnY: spawnPoint.y,
            spawnRotation: spawnPoint.rotation,
            initialPlayers: currentPlayersData // Send state of players already racing
        }));
        console.log(`Player ${id} joined late, game already started.`);
    }


    ws.on('message', (message) => {
        // Only process updates if the game is running
        if (gameState !== 'RACING') return;

        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`Failed to parse message from ${id}: ${message}`);
            return;
        }

        // Important: Add player ID server-side
        data.playerId = id;

        if (data.type === 'playerUpdate') {
            // Broadcast to others
            broadcast(data, id); // Pass sender ID to potentially skip sending back
        }
    });

    ws.on('close', () => {
        console.log(`Player ${id} disconnected`);
        const spawnIndex = ws.spawnPointIndex;
        if (spawnIndex !== undefined) {
            assignedSpawnPoints.delete(id); // Free up the spawn point
        }
        delete clients[id];

        // Notify others
        broadcast({
            type: 'playerDisconnected',
            playerId: id
        });

        // Optional: Check if game should stop or revert to WAITING if not enough players
        if (gameState === 'RACING' && Object.keys(clients).length < MIN_PLAYERS_TO_START) {
            // gameState = 'WAITING'; // Or handle game end logic
            // console.log("Not enough players, returning to WAITING state or ending game.");
            // Decide what happens - for now, let it continue
        } else if (gameState === 'WAITING' && Object.keys(clients).length < MIN_PLAYERS_TO_START) {
            console.log("Player left during WAITING state.");
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for player ${id}:`, error);
        // Ensure cleanup happens even on error
        ws.close(); // Triggers the 'close' event handler
    });
});

console.log(`WebSocket server started on port ${wss.options.port}... Waiting for players.`);
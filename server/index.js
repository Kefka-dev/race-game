const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
const clients = {};
const players = {};
let nextPlayerId = 0;
let hostId = null;
let gameState = 'WAITING'; //'WAITING' or 'RACING'
const MIN_PLAYERS_TO_START = 1;

const spawnPoints = [
    { x: 296, y: 32, rotation: Math.PI/2 },
    { x: 296, y: 96, rotation: Math.PI/2 },
];

let gameSettings = {
    rounds: 3
}

const assignedSpawnPoints = new Map(); // Track which client ID has which spawn point index

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
    for (const id in players) {
        if (senderId && parseInt(id) === senderId) continue; // Skip sender if needed
        const player = players[id];
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    }
}

function getPlayersInfo() {
    const info = {};
    for (const id in players) {
        info[id] = players[id].name;
    }
    return info;
}

function designateNewHost() {
    hostId = null;
    // Find the player with the lowest ID to be the new host
    let minId = Infinity;
    for (const idStr in players) {
        const id = parseInt(idStr);
        if (id < minId) {
            minId = id;
            hostId = id;
        }
    }
    if (hostId !== null) {
        console.log(`New host designated: Player ${hostId}`);
        broadcast({ type: 'newHost', hostId: hostId });
        // Also update player list indicator if needed via broadcast or lobbyInfo refresh
    } else {
        console.log("No players left to designate as host.");
        // Potentially reset game state if needed
    }
}

function startGame(starterId) {
    if (gameState !== 'WAITING') {
        console.log(`Player ${starterId} tried to start game, but state is ${gameState}`);
        return; // Already started or invalid state
    }

    // --- Condition Check: Ensure enough players ---
    const playerCount = Object.keys(players).length;
    if (playerCount < MIN_PLAYERS_TO_START) {
        console.log(`Player ${starterId} tried to start game with ${playerCount} players, needs ${MIN_PLAYERS_TO_START}`);
        // Send error back to host
        if (players[starterId] && players[starterId].ws.readyState === WebSocket.OPEN) {
            players[starterId].ws.send(JSON.stringify({
                type: 'startGameError',
                message: `Need at least ${MIN_PLAYERS_TO_START} players to start (currently ${playerCount}).`
            }));
        }
        return;
    }

    console.log(`--- Game Start requested by Host ${starterId} ---`);
    gameState = 'RACING';
    assignedSpawnPoints.clear(); // Clear previous assignments if any

    const initialPlayerData = {};

    // Assign spawn points
    for (const idStr in players) {
        const id = parseInt(idStr);
        const spawnIndex = getNextAvailableSpawnPointIndex();
        assignedSpawnPoints.set(id, spawnIndex);
        players[id].spawnPointIndex = spawnIndex; // Store on player object

        const spawnPoint = spawnPoints[spawnIndex];
        initialPlayerData[id] = {
            x: spawnPoint.x,
            y: spawnPoint.y,
            rotation: spawnPoint.rotation
            // Add name if needed client-side for other cars
            // name: players[id].name
        };
    }

    // Send start signal to everyone
    broadcast({
        type: 'startGame',
        initialPlayers: initialPlayerData, // Send everyone's starting state keyed by ID
        settings: gameSettings // Send final settings used for the game
        // Note: The client receiving this message already knows its *own* spawn point
        // from the assignment loop above, but we need to send all initial player data.
        // We can tailor the message per client if needed, but broadcasting is simpler.
        // Let's adjust client to grab its specific spawn from initialPlayers using its own ID.
    });


    // Send specific spawn point info redundant? Maybe not needed if client uses initialPlayers
    /*
    for (const [idStr, player] of Object.entries(players)) {
         const id = parseInt(idStr);
         const spawnIndex = player.spawnPointIndex;
         const spawnPoint = spawnPoints[spawnIndex];

         player.ws.send(JSON.stringify({
             type: 'startGame',
             playerId: id, // Keep sending player ID for self-identification
             spawnX: spawnPoint.x,
             spawnY: spawnPoint.y,
             spawnRotation: spawnPoint.rotation,
             initialPlayers: initialPlayerData,
             settings: gameSettings
         }));
    }
    */
}

wss.on('connection', (ws) => {
    const id = nextPlayerId++;
    const playerName = `Player ${id}`; // Simple default name
    // Store player info
    players[id] = {
        name: playerName,
        ws: ws,
        spawnPointIndex: null
    };
    ws.playerId = id; // Store ID on ws object

    console.log(`Player ${id} connected. Total players: ${Object.keys(clients).length}`);

    // Designate host if none exists
    if (hostId === null) {
        hostId = id;
        console.log(`${playerName} (ID: ${id}) is now the HOST.`);
    }

    /// Send initial lobby information to the new player
    ws.send(JSON.stringify({
        type: 'lobbyInfo',
        playerId: id,
        isHost: (id === hostId),
        players: getPlayersInfo(), // Send current player list { id: name }
        settings: gameSettings // Send current settings
    }));

    // Notify ALL players (including the new one) about the join
    broadcast({
        type: 'playerJoined',
        player: { id: id, name: playerName } // Send player details
    });


    // --- Message Handling for this client ---
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
            data.playerId = id; // Add sender ID server-side for context
        } catch (e) {
            console.error(`Failed to parse message from ${id}: ${message}`);
            return;
        }

        switch (data.type) {
            case 'playerUpdate':
                if (gameState === 'RACING') {
                    // Store last known state? Maybe not needed for this example
                    // players[id].lastX = data.x;
                    // players[id].lastY = data.y;
                    // players[id].lastRotation = data.rotation;
                    broadcast(data, id); // Broadcast update to others
                }
                break;

            case 'setRounds':
                // Only host can change settings, and only while waiting
                if (gameState === 'WAITING' && id === hostId) {
                    const newRounds = parseInt(data.rounds, 10);
                    if (!isNaN(newRounds) && newRounds > 0 && newRounds <= 10) { // Validation
                        gameSettings.rounds = newRounds;
                        console.log(`Host ${id} set rounds to ${newRounds}`);
                        broadcast({ type: 'updateLobbySettings', settings: gameSettings });
                    } else {
                        console.warn(`Host ${id} tried to set invalid rounds: ${data.rounds}`);
                    }
                }
                break;

            case 'requestStartGame':
                // Only host can start, and only while waiting
                if (gameState === 'WAITING' && id === hostId) {
                    startGame(id); // Pass starter ID for checks/logging
                } else {
                    console.warn(`Non-host ${id} or invalid state (${gameState}) tried to start game.`);
                }
                break;

            default:
                console.log(`Unhandled message type from ${id}: ${data.type}`);
        }
    });


    // --- Close Handling ---
    ws.on('close', () => {
        console.log(`${players[id]?.name || `Player ${id}`} (ID: ${id}) disconnected`);

        // Free up spawn point if game started and player had one
        const spawnIndex = players[id]?.spawnPointIndex;
        if (spawnIndex !== undefined && spawnIndex !== null) {
            assignedSpawnPoints.delete(id);
        }

        const wasHost = (id === hostId);
        delete players[id]; // Remove from player list

        // Notify remaining players
        broadcast({
            type: 'playerDisconnected',
            playerId: id
        });

        // If the host disconnected, designate a new one
        if (wasHost) {
            console.log(`Host (ID: ${id}) disconnected.`);
            designateNewHost();
        }

        // Optional: Reset to WAITING if game was running and too few players remain
        if (gameState === 'RACING' && Object.keys(players).length < MIN_PLAYERS_TO_START) {
            console.log("Not enough players to continue racing, returning to WAITING state.");
            // gameState = 'WAITING'; // Implement game reset logic if needed
            // broadcast({ type: 'gameEnded' }); // Notify clients game ended
        }
        if (Object.keys(players).length === 0) {
            console.log("Last player disconnected. Resetting state.");
            gameState = 'WAITING';
            hostId = null;
            gameSettings = { rounds: 3 }; // Reset settings
            assignedSpawnPoints.clear();
        }
    });

    // --- Error Handling ---
    ws.on('error', (error) => {
        console.error(`WebSocket error for player ${id}:`, error);
        // Ensure cleanup happens, trigger close event
        ws.close();
    });
});

console.log(`WebSocket server started on port ${wss.options.port}... Waiting for players.`);
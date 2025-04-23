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

let raceStartTime = null; // Timestamp when the race started
let playerFinishTimes = {}; // { playerId: finishTimestamp, ... }
let finishedPlayers = new Set(); // Keep track of who finished

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
    raceStartTime = Date.now(); // Record start time
    playerFinishTimes = {};     // Clear previous times
    finishedPlayers.clear();   // Clear finished players set

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
        settings: gameSettings, // Send final settings used for the game
        startTime: raceStartTime
    });

    console.log("Race started at:", raceStartTime);
}

function checkRaceEnd() {
    if (gameState !== 'RACING') return; // Only check if racing

    // Count how many players *started* the race and are *still connected*
    const participatingPlayerIds = Object.keys(players).filter(id => assignedSpawnPoints.has(parseInt(id)));
    const connectedParticipantCount = participatingPlayerIds.length;

    // Check if all connected participants have finished
    if (connectedParticipantCount > 0 && finishedPlayers.size >= connectedParticipantCount) {
        console.log("All connected players have finished. Calculating results...");
        gameState = 'RESULTS'; // Or 'WAITING' if you prefer immediate reset

        const results = [];
        for (const playerIdStr of participatingPlayerIds) {
            const playerId = parseInt(playerIdStr);
            const finishTime = playerFinishTimes[playerId];
            const player = players[playerId];

            if (finishTime && player) { // Ensure they actually finished
                const raceDuration = finishTime - raceStartTime;
                results.push({
                    id: playerId,
                    name: player.name,
                    time: raceDuration
                });
            } else if (player) {
                // Player connected but didn't finish (maybe disconnected mid-race and rejoined lobby?)
                // Or handle DNF state if tracking disconnects more precisely
                results.push({
                    id: playerId,
                    name: player.name,
                    time: null // Indicate DNF or infinite time
                });
            }
        }

        // Sort results: lowest time first, null times (DNF) last
        results.sort((a, b) => {
            if (a.time === null) return 1; // a is DNF, put last
            if (b.time === null) return -1; // b is DNF, put last
            return a.time - b.time; // Sort by time numerically
        });

        console.log("Broadcasting results:", results);
        broadcast({ type: 'showResults', results: results });

    } else {
        console.log(`Race end check: ${finishedPlayers.size} finished / ${connectedParticipantCount} connected participants.`);
    }
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
        const senderId = ws.playerId; // <<< Get the reliable sender ID stored on the WebSocket object

        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`Failed to parse message from ${senderId}: ${message}`); // Use senderId for logging
            return;
        }

        // Add the sender ID to the data object specifically for types
        // that need it when broadcast to other clients.
        // Primarily 'playerUpdate'.

        switch (data.type) {
            case 'playerUpdate':
                if (gameState === 'RACING') {
                    // <<< CRITICAL FIX: Add senderId to the data object before broadcasting >>>
                    data.playerId = senderId;
                    broadcast(data, senderId); // Broadcast update to others (excluding sender)
                }
                break;

            case 'setRounds':
                // Logic uses senderId directly for validation, broadcast doesn't need sender ID embedded
                if (gameState === 'WAITING' && senderId === hostId) {
                    const newRounds = parseInt(data.rounds, 10);
                    if (!isNaN(newRounds) && newRounds > 0 && newRounds <= 10) {
                        gameSettings.rounds = newRounds;
                        console.log(`Host ${senderId} set rounds to ${newRounds}`);
                        // Broadcast the settings change (doesn't need playerId embedded)
                        broadcast({ type: 'updateLobbySettings', settings: gameSettings });
                    } else {
                        console.warn(`Host ${senderId} tried to set invalid rounds: ${data.rounds}`);
                    }
                }
                break;

            case 'requestStartGame':
                // Logic uses senderId directly for validation
                if (gameState === 'WAITING' && senderId === hostId) {
                    startGame(senderId); // startGame handles broadcasting the 'startGame' message
                } else {
                    console.warn(`Non-host ${senderId} or invalid state (${gameState}) tried to start game.`);
                }
                break;

            case 'raceFinished':
                // Logic uses senderId directly
                if (gameState === 'RACING' && players[senderId] && !finishedPlayers.has(senderId)) {
                    if (assignedSpawnPoints.has(senderId)) {
                        console.log(`Player ${senderId} (${players[senderId].name}) finished the race.`);
                        playerFinishTimes[senderId] = Date.now();
                        finishedPlayers.add(senderId);
                        checkRaceEnd(); // Doesn't need playerId embedded in broadcast
                    } else {
                        console.log(`Player ${senderId} sent raceFinished but wasn't in the race start assignments.`);
                    }
                }
                break;

            case 'requestReturnToLobby':
                // Logic uses senderId directly, broadcast sends 'lobbyInfo'
                if (gameState === 'RESULTS' || gameState === 'RACING') {
                    console.log(`Player ${senderId} requested return to lobby from state ${gameState}. Resetting game.`);
                    gameState = 'WAITING';
                    // ... reset game state ...
                    // Broadcast personalized lobbyInfo to all clients
                    for (const pidStr in players) { // Send personalized lobbyInfo
                        const pid = parseInt(pidStr);
                        const player = players[pid];
                        if (player.ws.readyState === WebSocket.OPEN) {
                            player.ws.send(JSON.stringify({
                                type: 'lobbyInfo',
                                playerId: pid,
                                isHost: (pid === hostId),
                                players: getPlayersInfo(),
                                settings: gameSettings
                            }));
                        }
                    }
                } else if (gameState === 'WAITING') {
                    console.log(`Player ${senderId} requested return to lobby, but already in WAITING state.`);
                    // Re-send lobby info to just this player
                    if (players[senderId]?.ws.readyState === WebSocket.OPEN) {
                        players[senderId].ws.send(JSON.stringify({
                            type: 'lobbyInfo',
                            playerId: senderId,
                            isHost: (senderId === hostId),
                            players: getPlayersInfo(),
                            settings: gameSettings
                        }));
                    }
                }
                break;

            default:
                console.log(`Unhandled message type from ${senderId}: ${data.type}`); // Use senderId for logging
        }
    });


    // --- Close Handling ---
    ws.on('close', () => {
        const disconnectedPlayerId = id; // Use the id from the outer scope
        const playerName = players[disconnectedPlayerId]?.name || `Player ${disconnectedPlayerId}`;
        console.log(`${playerName} (ID: ${disconnectedPlayerId}) disconnected`);

        // Free up spawn point if game started and player had one
        const spawnIndex = players[disconnectedPlayerId]?.spawnPointIndex;
        let wasParticipant = false;
        if (spawnIndex !== undefined && spawnIndex !== null && assignedSpawnPoints.has(disconnectedPlayerId)) {
            // We don't necessarily need to delete from assignedSpawnPoints map here,
            // as checkRaceEnd relies on players object keys filtered by this map.
            console.log(`Player ${disconnectedPlayerId} who was participating disconnected.`);
            wasParticipant = true;
        }

        const wasHost = (disconnectedPlayerId === hostId);
        delete players[disconnectedPlayerId]; // Remove from player list *after* checking participation

        // Notify remaining players
        broadcast({
            type: 'playerDisconnected',
            playerId: disconnectedPlayerId
        });

        // If the host disconnected, designate a new one
        if (wasHost) {
            console.log(`Host (ID: ${disconnectedPlayerId}) disconnected.`);
            designateNewHost();
        }

        // Optional: Reset to WAITING if game was running and too few players remain
        if (gameState === 'RACING' && wasParticipant) {
            console.log("A race participant disconnected, checking race end condition.");
            checkRaceEnd();
        }
        if (Object.keys(players).length === 0) {
            console.log("Last player disconnected. Resetting state.");
            gameState = 'WAITING';
            hostId = null;
            gameSettings = { rounds: 3 };
            assignedSpawnPoints.clear();
            playerFinishTimes = {};
            finishedPlayers.clear();
            raceStartTime = null;
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
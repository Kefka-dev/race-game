import { Scene } from 'phaser';
import Car from "../Car.js";
import Obstacle from "../Obstacle.js";

export class Game extends Scene
{
    constructor ()
    {
        super('Game');
        this.socket = null;
        this.otherCars = {};

        this.playerId = null; // Initialize playerId
        this.car = null; // Initialize car to null
        this.gameState = 'WAITING'; // Add game state ('WAITING', 'RACING')
        this.cursors = null; // Initialize cursors later

        this.isHost = false; // Flag to check if this client is the host
        this.lobbyOverlay = null; // Reference to the overlay div
        this.playerListElement = null; // Reference to the <ul> element
        this.hostControls = null; // Reference to host controls div
        this.guestInfo = null; // Reference to guest info div
        this.roundsInput = null; // Reference to rounds input
        this.startButton = null; // Reference to start button
        this.guestRoundsDisplay = null; // Ref to span for guest rounds
        this.startErrorElement = null; // Ref to error paragraph

        //lapcounter UI
        this.lapText = null;      // Reference to the Phaser Text object for laps
        this.totalLaps = 0;       // Total laps for the race (from settings)

        // Timer UI
        this.timerText = null;     // Phaser Text for timer
        this.raceStartTime = 0;    // Client-side record of race start time
        this.elapsedRaceTime = 0;  // Track elapsed time in ms

        // Results UI
        this.resultsOverlay = null; // Reference to results overlay div
        this.resultsListElement = null; // Reference to <ul> or <ol> for results
        this.backToLobbyButton = null; // <<< Reference to the button

        //checkpoints
        this.checkpoints = [];        // Array to hold checkpoint body references
        this.totalCheckpoints = 0;    // Will be set based on defined checkpoints
    }

    preload ()
    {
        this.load.tilemapTiledJSON('map', 'assets/map.json');
        this.load.image('car1', 'assets/car_red_1.png');
        this.load.image('car2', 'assets/car_black_1.png');
        this.load.image('tiles', 'assets/spritesheet_tiles.png');
        this.load.image('tree', 'assets/tree_small.png');
        this.load.image('trava', 'assets/grass.png');
    }
    create ()
    {
        this.cameras.main.setBackgroundColor(0x219c60);

        this.matter.world.setBounds(0, 0, this.sys.game.config.width, this.sys.game.config.height);

        //map setup
        this.map = this.make.tilemap({key: 'map', tileWidth: 128, tileHeight: 128});
        this.tileset = this.map.addTilesetImage('spritesheet_tiles', 'tiles');
        this.layer = this.map.createLayer('trackLayer', this.tileset, 0,0);
        this.layer.setScale(0.5);

        //Obstacle placement
        this.tree = new Obstacle(this, 670, 150, 'tree', 0.4);
        this.tree = new Obstacle(this, 670, 70, 'tree', 0.4);
        this.tree = new Obstacle(this, 865, 190, 'tree', 0.4);

        //Checkpoint setup
        const checkpointData = [
            { x: 575, y: 150, width: 130, height: 20 }, // Checkpoint 0
            { x: 770, y: 150, width: 130, height: 20 }, // Checkpoint 1
            { x: 970, y: 400, width: 130, height: 20 }, // Checkpoint 2
            { x: 400, y: 700, width: 20, height: 130 }, // Checkpoint 3
            { x: 125, y: 200, width: 130, height: 20 }, // Checkpoint 4
            // Add more checkpoints as needed...
        ];
        this.totalCheckpoints = checkpointData.length;

        // --- Create Checkpoint Sensor Bodies ---
        checkpointData.forEach((data, index) => {
            const cpBody = this.matter.add.rectangle(data.x, data.y, data.width, data.height, {
                isSensor: true,    // Makes it non-collidable but detectable
                isStatic: true,    // Checkpoints don't move
                label: 'checkpoint' // Label for collision detection
            });

            // Store the checkpoint's sequence index directly on the body object
            cpBody.checkpointIndex = index;

            // Store reference if needed elsewhere (like debug draw)
            this.checkpoints.push(cpBody);
        });
        //console.log(`Created ${this.totalCheckpoints} checkpoints.`);
        // --- End Checkpoint Creation ---

        //LobbySetup
        // --- Get references to HTML elements ---
        this.lobbyOverlay = document.getElementById('lobbyOverlay');
        this.playerListElement = document.getElementById('playerList');
        this.hostControls = document.getElementById('hostControls');
        this.guestInfo = document.getElementById('guestInfo');
        this.roundsInput = document.getElementById('roundsInput');
        this.startButton = document.getElementById('startButton');
        this.guestRoundsDisplay = document.getElementById('guestRoundsDisplay');
        this.startErrorElement = document.getElementById('startError');

        //results ui
        this.resultsOverlay = document.getElementById('resultsOverlay'); // Get results overlay
        this.resultsListElement = document.getElementById('resultsList'); // Get results list
        this.backToLobbyButton = document.getElementById('backToLobbyButton'); // <<< Get button element

        // --- Add Event Listeners for Host Controls ---
        this.roundsInput.addEventListener('change', () => {
            if (this.isHost && this.socket && this.socket.readyState === WebSocket.OPEN) {
                const rounds = parseInt(this.roundsInput.value, 10);
                this.socket.send(JSON.stringify({ type: 'setRounds', rounds: rounds }));
            }
        });

        this.startButton.addEventListener('click', () => {
            if (this.isHost && this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.startErrorElement.textContent = ''; // Clear previous errors
                //console.log("Requesting game start...");
                this.socket.send(JSON.stringify({ type: 'requestStartGame' }));
            }
        });

        // <<< Add listener for the Back to Lobby button >>>
        if (this.backToLobbyButton) { // Check if the button exists
            this.backToLobbyButton.addEventListener('click', () => {
                //console.log("Back to Lobby button clicked.");
                // Check connection and send request to server
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    // Only send if not already in WAITING state (prevents spamming)
                    if (this.gameState !== 'WAITING') {
                        //console.log("Sending requestReturnToLobby to server...");
                        this.socket.send(JSON.stringify({ type: 'requestReturnToLobby' }));
                    } else {
                        //console.log("Already in WAITING state or returning.");
                    }
                } else {
                    console.error("Cannot return to lobby: WebSocket not connected.");
                    // Fallback: Force UI reset locally if disconnected
                    this.hideResults();
                    this.showLobby(); // Or potentially a disconnected message
                    this.resetGameElements();
                }
            });
        } else {
            console.warn("BackToLobbyButton element not found in HTML.");
        }

        //websocket setup
        this.socket = new WebSocket('wss://node103.webte.fei.stuba.sk/game')


        this.socket.addEventListener('open', () => {
            //console.log('Connected to server!');
            this.showLobby();
            this.hideResults(); // Ensure results are hidden
        });

        this.socket.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);
            // //console.log("Received message:", msg); // Debugging

            switch (msg.type) {
                case 'lobbyInfo':
                    this.hideResults(); // Ensure results are hidden when lobby info arrives
                    this.hideGameUI(); // Ensure game UI is hidden too

                    this.playerId = msg.playerId;
                    this.isHost = msg.isHost;
                    this.updatePlayerList(msg.players); // players is now an object { id: name, ... }
                    this.updateLobbySettings(msg.settings); // e.g., { rounds: 3 }
                    this.updateLobbyVisibility(); // Show/hide host controls
                    //console.log(`Assigned Player ID: ${this.playerId}, Is Host: ${this.isHost}`);
                    if (this.gameState !== 'WAITING') {
                        //console.log("Received lobbyInfo, setting gameState to WAITING");
                        this.gameState = 'WAITING';
                        // We might need more cleanup here if coming from RACING/RESULTS unexpectedly
                        this.resetGameElements(); // Ensure cars etc are cleared
                    }
                    this.showLobby();
                    break;

                case 'startGame':
                    //console.log("--- Game Start Signal Received ---");
                    this.hideLobby(); // Hide lobby overlay
                    this.hideResults(); // Ensure results are hidden
                    this.gameState = 'RACING';
                    this.raceStartTime = msg.startTime || Date.now(); // Use server start time or fallback
                    this.elapsedRaceTime = 0; // Reset elapsed time

                    // --- FIX: Get THIS player's spawn data from initialPlayers ---
                    const myPlayerData = msg.initialPlayers[this.playerId]; // Look up using YOUR ID

                    if (!myPlayerData) {
                        // Error handling: This shouldn't happen if the server is correct
                        console.error(`FATAL: My player data (ID: ${this.playerId}) not found in startGame message!`, msg);
                        // Perhaps force disconnect or show an error
                        this.socket.close();
                        return;
                    }
                    // Use the data found for your player ID
                    const spawnX = myPlayerData.x;
                    const spawnY = myPlayerData.y;
                    const spawnRotation = myPlayerData.rotation;
                    // --- End of FIX ---

                    // Store total laps from settings
                    this.totalLaps = msg.settings.rounds || 3; // Use setting or default to 3

                    // Create player car NOW
                    this.car = new Car(this, spawnX, spawnY, 'car1');
                    this.car.setRotation(spawnRotation || Math.PI / 2); // Use provided rotation
                    this.car.playerId = this.playerId; // Assign ID if needed on car object

                    //console.log('Car parts structure:', this.car.body.parts.map((p, index) => `Index <span class="math-inline">\{index\}\: Label\='</span>{p.label}', ID=${p.id}`));
                    // Enable controls NOW
                    this.cursors = this.input.keyboard.createCursorKeys();

                    // Create other players' cars based on initial data
                    for (const [pId, pData] of Object.entries(msg.initialPlayers)) {
                        const id = parseInt(pId);
                        if (id !== this.playerId) { // Don't create self again
                            if (!this.otherCars[id]) { // Check if not already created (e.g. by late join update)
                                //console.log(`Creating initial car for player ${id}`);
                                this.otherCars[id] = new Car(this, pData.x, pData.y, 'car2');
                                this.otherCars[id].setRotation(pData.rotation);
                                this.otherCars[id].playerId = id; // Assign ID if needed
                            }
                        }
                    }

                    // --- Initialize Lap Counter UI ---
                    // Ensure previous text is destroyed if game restarts without scene restart
                    if (this.lapText) {
                        this.lapText.destroy();
                    }
                    // Create the text object
                    this.lapText = this.add.text(
                        10, 10, // Position (top-left corner)
                        `Lap: ${this.car.laps} / ${this.totalLaps}`, // Initial text
                        {
                            fontSize: '24px',
                            fill: '#ffffff', // White text
                            stroke: '#000000', // Black stroke
                            strokeThickness: 4 // Stroke thickness
                        }
                    )
                        .setScrollFactor(0) // Makes it stick to the camera (HUD)
                        .setDepth(10); // Ensure it's drawn on top


                    // --- Initialize Timer UI ---
                    if (this.timerText) {
                        this.timerText.destroy(); // Destroy previous if exists
                    }
                    this.timerText = this.add.text(
                        this.sys.game.config.width - 10, 10, // Position top-right
                        'Time: 00:00:000',
                        {
                            fontSize: '24px',
                            fill: '#ffffff',
                            stroke: '#000000',
                            strokeThickness: 4,
                            align: 'right' // Align text to the right
                        }
                    )
                        .setOrigin(1, 0) // Set origin to top-right
                        .setScrollFactor(0)
                        .setDepth(10)
                        .setVisible(true); // Make visible

                    break;

                case 'playerJoined': // Optional: For lobby UI updates
                    // FIX: Access data nested within msg.player
                    if (msg.player && msg.player.id !== undefined && msg.player.name !== undefined) {
                        const joinedPlayerId = msg.player.id;
                        const joinedPlayerName = msg.player.name;

                        //console.log(`Player joined event: ID=${joinedPlayerId}, Name=${joinedPlayerName}`);

                        //Check if player already exists in the list
                        const existingPlayerLi = this.playerListElement.querySelector(`li[data-player-id="${joinedPlayerId}"]`);

                        if (!existingPlayerLi) {
                            //console.log(`Adding player ${joinedPlayerId} to list.`);
                            this.addPlayerToList(joinedPlayerId, joinedPlayerName);
                        } else {
                            // Player might already be in the list if this client just joined
                            // and received lobbyInfo followed by their own playerJoined event.
                            //console.log(`Player ${joinedPlayerId} already in list, skipping add.`);
                        }

                    } else {
                        console.error("Received malformed playerJoined message:", msg);
                    }
                    break;

                case 'playerDisconnected':
                    //console.log(`Player ${msg.playerId} disconnected`);
                    this.removePlayerFromList(msg.playerId);
                    // Also handle removing the car if the game started
                    const car = this.otherCars[msg.playerId];
                    if (car) {
                        car.destroy();
                        delete this.otherCars[msg.playerId];
                    }
                    break;
                // New: Update settings display if host changes them
                case 'updateLobbySettings':
                    this.updateLobbySettings(msg.settings);
                    break;

                // New: Handle host change if current host leaves
                case 'newHost':
                    this.isHost = (this.playerId === msg.hostId);
                    this.updateLobbyVisibility();
                    this.updatePlayerListHostIndicator(msg.hostId); // Add visual indicator to list
                    //console.log(`New host is Player ${msg.hostId}. Am I host? ${this.isHost}`);
                    break;

                // New: Handle start game error (e.g., not enough players)
                case 'startGameError':
                    if (this.isHost) {
                        this.startErrorElement.textContent = msg.message;
                    }
                    break;

                case 'playerUpdate':
                    // Only process if game is running and it's not our own update
                    if (this.gameState === 'RACING' && msg.playerId !== this.playerId) {
                        if (!this.otherCars[msg.playerId]) {
                            this.otherCars[msg.playerId] = new Car(this, msg.x, msg.y, 'car2');
                            this.otherCars[msg.playerId].playerId = msg.playerId;
                        }
                        const other = this.otherCars[msg.playerId];
                        if (other) { // Check if exists before updating
                            other.setPosition(msg.x, msg.y);
                            other.setRotation(msg.rotation);
                        }
                    }
                    break;

                case 'showResults':
                    //console.log("--- Show Results Signal Received ---", msg.results);
                    this.gameState = 'RESULTS'; // Set state
                    this.hideGameUI(); // Hide lap counter, timer
                    this.populateResults(msg.results); // Populate HTML
                    this.showResults(); // Show the HTML overlay
                    // Optionally stop car movement, etc.
                    if (this.car) {
                        this.car.setActive(false); // Stop updates/physics interaction
                    }
                    this.cursors = null; // Disable controls
                    break;


                // Add default case for unexpected messages
                default:
                    //console.log(`Unhandled message type: ${msg.type}`);
            }
        });

        // --- WebSocket Close/Error Handling ---
        this.socket.addEventListener('close', () => {
            //console.log('Disconnected from server.');
            this.gameState = 'WAITING';
            this.showLobby(); // Show lobby overlay on disconnect
            this.hideResults(); // Hide results on disconnect
            this.hideGameUI(); // Hide game UI
            // Reset player list, host status etc.
            this.playerListElement.innerHTML = '';
            this.isHost = false;
            this.updateLobbyVisibility();
            // Destroy cars if they exist
            if (this.car) this.car.destroy();
            this.car = null;
            Object.values(this.otherCars).forEach(car => car.destroy());
            this.otherCars = {};
            if (this.lapText) { this.lapText.destroy(); this.lapText = null; } //clean up text
            this.resetGameElements();
        });

        this.socket.addEventListener('error', (error) => {
            console.error('WebSocket Error:', error);
            // Similar cleanup as 'close'
            this.gameState = 'WAITING';
            this.showLobby();
            this.hideResults();
            this.hideGameUI();
            this.playerListElement.innerHTML = '';
            this.isHost = false;
            this.updateLobbyVisibility();
            if (this.car) this.car.destroy();
            this.car = null;
            Object.values(this.otherCars).forEach(car => car.destroy());
            this.otherCars = {};
            if (this.lapText) { this.lapText.destroy(); this.lapText = null; }
            this.resetGameElements();
        });


        // --- Add Matter Collision Listener ---
        this.matter.world.on('collisionstart', (event) => {
            event.pairs.forEach((pair) => {
                const { bodyA, bodyB } = pair;
                // //console.log(`Pair: A='${bodyA.label}', B='${bodyB.label}'`); // Keep for debugging

                // --- Checkpoint Collision Logic ---
                let carBodyPartForCP = null;
                let checkpointBody = null;

                // Use the CORRECT index '1' for playerCarBody after the fix
                if (bodyA.label === 'playerCarBody' && bodyB.label === 'checkpoint') {
                    carBodyPartForCP = bodyA; checkpointBody = bodyB;
                } else if (bodyB.label === 'playerCarBody' && bodyA.label === 'checkpoint') {
                    carBodyPartForCP = bodyB; checkpointBody = bodyA;
                }

                // Check if it's the player's car main body hitting a checkpoint
                if (this.gameState === 'RACING' && this.car && carBodyPartForCP && checkpointBody && this.car.body.parts.includes(carBodyPartForCP)) { // Check if part belongs to player car
                    // Verify it's the main body part (index 1 after fix)
                    if(this.car.body.parts[1] === carBodyPartForCP){
                        const checkpointIndex = checkpointBody.checkpointIndex;
                        const expectedIndex = this.car.lastCheckpointPassed + 1;

                        if (checkpointIndex === expectedIndex) {
                            this.car.lastCheckpointPassed = checkpointIndex;
                            //console.log(`Client: Passed Checkpoint ${checkpointIndex}`);
                        } else {
                            //console.log(`Client: Hit Checkpoint ${checkpointIndex} out of order (expected ${expectedIndex}). Ignoring.`);
                        }
                    }
                } // End Checkpoint Logic

                // --- Car-vs-Car Sensor Collision Logic (Moved from Car.js) ---
                let frontSensorBody = null;
                let rearSensorBody = null;

                // Check for Front Sensor vs Rear Sensor collision
                // Uses the LABELS assigned in startGame after the fix
                if (bodyA.label === 'playerFrontSensor' && bodyB.label === 'playerRearSensor') {
                    frontSensorBody = bodyA; rearSensorBody = bodyB;
                } else if (bodyB.label === 'playerFrontSensor' && bodyA.label === 'playerRearSensor') {
                    frontSensorBody = bodyB; rearSensorBody = bodyA;
                }

                // If a sensor collision occurred and we are racing
                if (this.gameState === 'RACING' && frontSensorBody && rearSensorBody) {

                    // Find which car instance owns the front sensor body
                    let hittingCar = null;
                    if (this.car && this.car.body.parts.includes(frontSensorBody)) { // Check if it's the main player's car
                        hittingCar = this.car;
                    } else { // Check the other cars
                        for (const otherId in this.otherCars) {
                            const otherCar = this.otherCars[otherId];
                            // Important: Check if otherCar and its body exist before accessing parts
                            if (otherCar && otherCar.body && otherCar.body.parts.includes(frontSensorBody)) {
                                hittingCar = otherCar;
                                break;
                            }
                        }
                    }

                    // Apply penalty logic ONLY if it's the local player's car that did the hitting
                    if (hittingCar && hittingCar === this.car) {
                        //console.log('My car caused rear-end collision!');

                        // Prevent applying penalty multiple times quickly
                        if (this.car.maxSpeed === this.car.originalMaxSpeed) {
                            this.car.maxSpeed = this.car.originalMaxSpeed * 0.5;
                            if (this.car.speed > this.car.maxSpeed) {
                                this.car.speed = this.car.maxSpeed;
                            }
                            //console.log('Max speed reduced.');

                            // Restore speed after delay using the scene's timer
                            this.time.delayedCall(5000, () => {
                                // Check car still exists before restoring
                                if (this.car) {
                                    this.car.maxSpeed = this.car.originalMaxSpeed;
                                    //console.log('Max speed restored.');
                                }
                            }, null, this); // 'this' context is the scene
                        }
                    }
                    // Note: We don't apply penalties to otherCars on this client.
                    // Their state should be determined by their own client or server updates.
                } // End Car-vs-Car Logic

            }); // End event.pairs.forEach
        }); // End this.matter.world.on


        // V metóde create() scény Game
        this.debugGraphics = this.add.graphics();
        this.debugGraphics.visible = false; // Skryjeme grafiku na začiatku 
        this.input.keyboard.on('keydown-D', () => {
            this.debugGraphics.visible = !this.debugGraphics.visible;
        });
    }

    // --- Helper methods for Lobby UI ---

    showLobby() {
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'flex';
        // Don't automatically call updateLobbyVisibility here, wait for lobbyInfo
    }

    hideLobby() {
        if (this.lobbyOverlay) this.lobbyOverlay.style.display = 'none';
    }

    updateLobbyVisibility() {
        if (!this.hostControls || !this.guestInfo) return; // Ensure elements exist
        if (this.isHost) {
            this.hostControls.style.display = 'block';
            this.guestInfo.style.display = 'none';
        } else {
            this.hostControls.style.display = 'none';
            this.guestInfo.style.display = 'block';
        }
    }

    showResults() {
        if (this.resultsOverlay) this.resultsOverlay.style.display = 'flex';
    }

    hideResults() {
        if (this.resultsOverlay) this.resultsOverlay.style.display = 'none';
    }

    // Helper to hide in-game Phaser UI
    hideGameUI() {
        if (this.lapText) this.lapText.setVisible(false);
        if (this.timerText) this.timerText.setVisible(false);
    }

    // Helper to populate the results list in HTML
    populateResults(resultsData) {
        if (!this.resultsListElement) return;
        this.resultsListElement.innerHTML = ''; // Clear previous results

        resultsData.forEach((playerResult, index) => {
            const li = document.createElement('li');
            const place = index + 1;
            let timeString = "DNF"; // Default to Did Not Finish

            if (playerResult.time !== null) {
                timeString = this.formatTime(playerResult.time);
            }

            li.textContent = `${place}. ${playerResult.name} - ${timeString}`;
            this.resultsListElement.appendChild(li);
        });
    }

    // Helper to format milliseconds into MM:SS:ms
    formatTime(ms) {
        if (ms === null || ms === undefined) return "DNF";
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        const milliseconds = (ms % 1000).toString().padStart(3, '0');
        return `${minutes}:${seconds}:${milliseconds}`;
    }

    // Helper to reset game elements on disconnect/error/game end
    resetGameElements() {
        if (this.car) this.car.destroy();
        this.car = null;
        Object.values(this.otherCars).forEach(car => car.destroy());
        this.otherCars = {};
        if (this.lapText) { this.lapText.destroy(); this.lapText = null; }
        if (this.timerText) { this.timerText.destroy(); this.timerText = null; }
        this.gameState = 'WAITING';
        this.totalLaps = 0;
        this.raceStartTime = 0;
        this.elapsedRaceTime = 0;
        this.localPlayerFinished = false;
        // Don't clear lobby elements here, manage separately
    }

// Updates the entire player list based on data from server { id: name, ... }
    updatePlayerList(players) {
        if (!this.playerListElement) return;
        this.playerListElement.innerHTML = ''; // Clear existing list
        for (const [id, name] of Object.entries(players)) {
            this.addPlayerToList(id, name);
        }
    }

    addPlayerToList(playerId, playerName) {
        if (!this.playerListElement) return;
        const li = document.createElement('li');
        li.textContent = `${playerName} (ID: ${playerId})`; // Display name and ID
        li.setAttribute('data-player-id', playerId); // Store ID for removal
        this.playerListElement.appendChild(li);
    }

    removePlayerFromList(playerId) {
        if (!this.playerListElement) return;
        const items = this.playerListElement.querySelectorAll(`li[data-player-id="${playerId}"]`);
        items.forEach(item => item.remove());
    }

    updateLobbySettings(settings) {
        if (settings.rounds !== undefined) {
            if (this.isHost && this.roundsInput) {
                this.roundsInput.value = settings.rounds;
            }
            if (!this.isHost && this.guestRoundsDisplay) {
                this.guestRoundsDisplay.textContent = settings.rounds;
            }
        }
        // Update other settings if added
    }

    // Optional: Visually indicate who the host is in the list
    updatePlayerListHostIndicator(hostId) {
        if (!this.playerListElement) return;
        const items = this.playerListElement.querySelectorAll('li');
        items.forEach(item => {
            const id = item.getAttribute('data-player-id');
            if (id === String(hostId)) { // Compare as string potentially
                item.textContent += ' (Host)'; // Append indicator
                item.style.fontWeight = 'bold';
            } else {
                // Remove indicator if present from previous host
                item.textContent = item.textContent.replace(' (Host)', '');
                item.style.fontWeight = 'normal';
            }
        });
    }
    // --- End of Helper methods for Lobby UI ---

    update (time, delta)
    {
        if (this.gameState === 'RACING' && this.car && this.cursors) {

            // --- Timer Update ---
            if (this.raceStartTime > 0) {
                this.elapsedRaceTime = Date.now() - this.raceStartTime;
                if (this.timerText) {
                    this.timerText.setText(`Time: ${this.formatTime(this.elapsedRaceTime)}`);
                }
            }

            // Car movement
            if (this.cursors.up.isDown) {
                this.car.accelerate();
            } else if (this.cursors.down.isDown) {
                this.car.reverse();
            }

            if (this.cursors.left.isDown) {
                this.car.turnLeft();
            } else if (this.cursors.right.isDown) {
                this.car.turnRight();
            }


            // Získaj tile, na ktorom sa nachádza auto
            const tile = this.map.getTileAtWorldXY(this.car.x, this.car.y, true, this.cameras.main, this.layer);

            // Skontroluj, či je tile na ceste
            if (tile && !tile.properties.onTrack) {
                // //console.log('Auto je na ceste');
                // //console.log('Auto nie je na ceste');
                if (this.car.speed > 2 ){
                    this.car.speed = 2;
                }
            }
            if (tile && tile.properties.finishLine) {
                if (this.car.lastCheckpointPassed === this.totalCheckpoints - 1) {
                    this.car.laps++;
                    this.car.lastCheckpointPassed = -1;
                    //console.log(`Client: Lap ${this.car.laps} completed!`);

                    if (this.lapText) {
                        this.lapText.setText(`Lap: ${this.car.laps} / ${this.totalLaps}`);
                    }

                    // --- Check for Race Finish ---
                    if (this.car.laps >= this.totalLaps) {
                        //console.log("Client: Race Finished! Notifying server.");
                        // Don't change gameState here, wait for server's showResults
                        if (!this.localPlayerFinished) {
                            //console.log("Client: Local Race Finished! Freezing car...");
                            this.localPlayerFinished = true;
                            if (this.car) {
                                this.car.setActive(false);
                                this.car.setVelocity(0, 0);
                            }
                            this.cursors = null;
                            // Just send the notification
                            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                                this.socket.send(JSON.stringify({type: 'raceFinished'}));
                            }
                        }
                    }
                }
            } // End finish line check

            // Update car
            this.car.update(delta);

            // Send position update
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'playerUpdate',
                    x: this.car.x,
                    y: this.car.y,
                    rotation: this.car.rotation
                }));
            }

            // --- Debug Graphics Drawing ---
            if (this.debugGraphics.visible) {
                this.debugGraphics.clear();

                // Draw Car Hitbox Parts
                this.debugGraphics.lineStyle(1, 0x00ff00); // Green for car parts
                this.car.body.parts.forEach(part => {
                    // Skip the main compound body itself if desired, draw only parts
                    if (part === this.car.body) return;
                    this.debugGraphics.beginPath();
                    part.vertices.forEach((vertex, index) => {
                        if (index === 0) { this.debugGraphics.moveTo(vertex.x, vertex.y); }
                        else { this.debugGraphics.lineTo(vertex.x, vertex.y); }
                    });
                    this.debugGraphics.closePath();
                    this.debugGraphics.strokePath();
                });

                // Draw Checkpoints
                this.debugGraphics.lineStyle(2, 0xff00ff, 0.7); // Magenta, slightly transparent for checkpoints
                this.checkpoints.forEach(cpBody => {
                    this.debugGraphics.strokeRect(
                        cpBody.bounds.min.x,
                        cpBody.bounds.min.y,
                        cpBody.bounds.max.x - cpBody.bounds.min.x,
                        cpBody.bounds.max.y - cpBody.bounds.min.y
                    );
                    // Optionally draw index number near checkpoint
                    this.debugGraphics.fillStyle(0xffffff, 1);
                    // this.debugGraphics.fillText(cpBody.checkpointIndex, cpBody.position.x, cpBody.position.y); // Requires font settings
                });

            } // End if debug visible
        }

        // Update other cars visual state regardless of local game state (they might be racing)
        Object.values(this.otherCars).forEach(otherCar => {
            otherCar.update(delta); // Assuming update handles visual aspects

        });

        // If debug is active, clear it even if waiting, otherwise old lines persist
        if (!this.car && this.debugGraphics.visible) {
            this.debugGraphics.clear();
        }
        // Clear debug if needed when not racing but visible
        if (this.gameState !== 'RACING' && this.debugGraphics.visible) {
            this.debugGraphics.clear();
        }
    }
}
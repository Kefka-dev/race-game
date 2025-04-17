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


        //websocket setup
        this.socket = new WebSocket('wss://node103.webte.fei.stuba.sk/game')


        this.socket.addEventListener('open', () => {
            console.log('Connected to server!');
        });

        this.socket.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);
            console.log("Received message:", msg); // Debugging

            switch (msg.type) {
                case 'assignId':
                    this.playerId = msg.playerId;
                    console.log(`Assigned Player ID: ${this.playerId}`);
                    break;

                case 'startGame':
                    console.log("--- Game Start Signal Received ---");
                    this.gameState = 'RACING';
                    // Clear "Waiting" message if you added one
                    // ...

                    // Create player car NOW
                    this.car = new Car(this, msg.spawnX, msg.spawnY, 'car1');
                    this.car.body.parts[0].label = 'playerCarBody';
                    this.car.body.parts[1].label = 'playerFrontSensor';
                    this.car.body.parts[2].label = 'playerRearSensor';
                    this.car.setRotation(msg.spawnRotation || Math.PI / 2); // Use provided rotation
                    this.car.playerId = this.playerId; // Assign ID if needed on car object

                    // Enable controls NOW
                    this.cursors = this.input.keyboard.createCursorKeys();

                    // Create other players' cars based on initial data
                    for (const [pId, pData] of Object.entries(msg.initialPlayers)) {
                        const id = parseInt(pId);
                        if (id !== this.playerId) { // Don't create self again
                            if (!this.otherCars[id]) { // Check if not already created (e.g. by late join update)
                                console.log(`Creating initial car for player ${id}`);
                                this.otherCars[id] = new Car(this, pData.x, pData.y, 'car2');
                                this.otherCars[id].setRotation(pData.rotation);
                                this.otherCars[id].playerId = id; // Assign ID if needed
                            }
                        }
                    }
                    break;

                case 'playerUpdate':
                    // Only process if game is running and it's not our own update
                    if (this.gameState === 'RACING' && msg.playerId !== this.playerId) {
                        if (!this.otherCars[msg.playerId]) {
                            console.log(`Creating car for player ${msg.playerId} from update`);
                            // Need spawn point if creating here - preferably create in startGame
                            // This path might indicate a late joiner whose initial state wasn't in startGame
                            // For robustness, maybe use a default spawn or request info?
                            // Or ensure 'startGame' includes all players present *at that moment*.
                            // If the server handles late joins correctly by sending `startGame`, this might not be hit often for creation.
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

                case 'playerDisconnected':
                    console.log(`Player ${msg.playerId} disconnected`);
                    const car = this.otherCars[msg.playerId];
                    if (car) {
                        car.destroy();
                        delete this.otherCars[msg.playerId];
                    }
                    break;

                case 'playerJoined': // Optional: For lobby UI updates
                    console.log(`Player ${msg.playerId} joined the lobby.`);
                    // Update UI if you have one
                    break;

                // Add default case for unexpected messages
                default:
                    console.log(`Unhandled message type: ${msg.type}`);
            }
        });

        this.socket.addEventListener('close', () => {
            console.log('Disconnected from server.');
            this.gameState = 'WAITING'; // Or handle disconnect state
            // Maybe show a "Disconnected" message and disable controls
            if (this.car) this.car.destroy();
            this.car = null;
            Object.values(this.otherCars).forEach(car => car.destroy());
            this.otherCars = {};
        });

        this.socket.addEventListener('error', (error) => {
            console.error('WebSocket Error:', error);
            // Handle error state similar to close
        });

        // V metóde create() scény Game
        this.debugGraphics = this.add.graphics();
        this.debugGraphics.visible = false; // Skryjeme grafiku na začiatku 
        this.input.keyboard.on('keydown-D', () => {
            this.debugGraphics.visible = !this.debugGraphics.visible;
        });
    }
    update (time, delta)
    {
        if (this.gameState === 'RACING' && this.car && this.cursors) {
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
                // console.log('Auto je na ceste');
                // console.log('Auto nie je na ceste');
                if (this.car.speed > 2 ){
                    this.car.speed = 2;
                }
            } else if(tile && tile.properties.finishLine) {
                // console.log('Auto je na ceste');
                console.log("WOOhOOO presie si cielom");
            }

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

            if (this.debugGraphics.visible) {
                this.debugGraphics.clear();
                this.debugGraphics.lineStyle(1, 0x00ff00);
                this.car.body.parts.forEach(part => {
                    // ... (rest of debug drawing logic)
                    this.debugGraphics.beginPath();
                    part.vertices.forEach((vertex, index) => {
                        if (index === 0) {
                            this.debugGraphics.moveTo(vertex.x, vertex.y);
                        } else {
                            this.debugGraphics.lineTo(vertex.x, vertex.y);
                        }
                    });
                    this.debugGraphics.closePath();
                    this.debugGraphics.strokePath();
                });
            }
        } else {
            // What happens while WAITING? Maybe camera panning, displaying player list?
            // For now, nothing happens.
        }

        // Update other cars visual state regardless of local game state (they might be racing)
        Object.values(this.otherCars).forEach(otherCar => {
            // If your Car class has visual updates in its update method that don't depend on physics, call them here.
            // e.g., otherCar.updateVisuals(delta);
            otherCar.update(delta); // Assuming update handles visual aspects
            // If not, the setPosition/setRotation in the message handler might be sufficient.
        });

        // If debug is active, clear it even if waiting, otherwise old lines persist
        if (!this.car && this.debugGraphics.visible) {
            this.debugGraphics.clear();
        }
    }
}
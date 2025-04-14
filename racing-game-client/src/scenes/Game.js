import { Scene } from 'phaser';
import Car from "../Car.js";

export class Game extends Scene
{
    constructor ()
    {
        super('Game');
        this.socket = null;
        this.otherCars = {};
    }

    preload ()
    {
        this.load.tilemapTiledJSON('map', 'assets/map.json');
        this.load.image('car1', 'assets/car_red_1.png');
        this.load.image('car2', 'assets/car_black_1.png');
        this.load.image('tiles', 'assets/spritesheet_tiles.png');
    }
    create ()
    {

        //map setup
        this.map = this.make.tilemap({key: 'map', tileWidth: 128, tileHeight: 128});
        this.tileset = this.map.addTilesetImage('spritesheet_tiles', 'tiles');
        this.layer = this.map.createLayer('trackLayer', this.tileset, 0,0);
        this.layer.setScale(0.5);


        this.cameras.main.setBackgroundColor(0x219c60);
        // this.add.image(512, 384, 'background').setAlpha(0.5);

        this.car = new Car(this, 296, 32, 'car1');
        this.car.setRotation(Math.PI/2);
        this.cursors = this.input.keyboard.createCursorKeys();

        //websocket setup
        //TODO - add /game into NGINX config
        this.socket = new WebSocket('/game')


        this.socket.addEventListener('open', () => {
            console.log('Connected to server!');
        });

        this.socket.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'welcome') {
                this.playerId = msg.playerId;
            }

            if (msg.type === 'playerUpdate' && msg.playerId !== this.playerId) {
                if (!this.otherCars[msg.playerId]) {
                    this.otherCars[msg.playerId] = new Car(this, msg.x, msg.y, 'car2');
                }
                const other = this.otherCars[msg.playerId];
                other.setPosition(msg.x, msg.y);
                other.setRotation(msg.rotation);

            }

            if (msg.type === 'playerDisconnected') {
                const car = this.otherCars[msg.playerId];
                if (car) {
                    car.destroy();
                    delete this.otherCars[msg.playerId];
                }
            }
        });

    }
    update (time, delta)
    {

        // Získaj tile, na ktorom sa nachádza auto
        const tile = this.map.getTileAtWorldXY(this.car.x, this.car.y, true, this.cameras.main, this.layer);

        // Skontroluj, či je tile na ceste
        if (tile && tile.properties.onTrack) {
            // console.log('Auto je na ceste');
        } else {
            // console.log('Auto nie je na ceste');
            if (this.car.speed > this.car.maxSpeed / 3) {
                this.car.speed = this.car.maxSpeed / 3;
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

        // Update car
        this.car.update(delta);

        // console.log(this.car.x + ' ' + this.car.y);

        // pošli pozíciu
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'playerUpdate',
                x: this.car.x,
                y: this.car.y,
                rotation: this.car.rotation
            }));
        }
    }
}
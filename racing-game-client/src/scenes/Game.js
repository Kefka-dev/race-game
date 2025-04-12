import { Scene } from 'phaser';
import Car from "../Car.js";

export class Game extends Scene
{
    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        this.load.tilemapTiledJSON('map', '../../public/assets/map.json');
        this.load.image('car1', '../../public/assets/car_red_1.png');
        this.load.image('tiles', '../../public/assets/spritesheet_tiles.png');
    }
    create ()
    {


        const map = this.make.tilemap({key: 'map', tileWidth: 128, tileHeight: 128});
        const tileset = map.addTilesetImage('spritesheet_tiles', 'tiles');
        const layer = map.createLayer('trackLayer', tileset, 0,0);
        layer.setScale(0.5);


        this.cameras.main.setBackgroundColor(0x219c60);
        // this.add.image(512, 384, 'background').setAlpha(0.5);

        this.car = new Car(this, 296, 32, 'car1');
        this.car.setRotation(Math.PI/2);
        this.cursors = this.input.keyboard.createCursorKeys();


    }
    update (time, delta)
    {
        // Car movement
        if (this.cursors.up.isDown) {
            this.car.accelerate();
        } else if (this.cursors.down.isDown) {
            this.car.decelerate();
        }

        if (this.cursors.left.isDown) {
            this.car.turnLeft();
        } else if (this.cursors.right.isDown) {
            this.car.turnRight();
        }

        // Update car
        this.car.update(delta);
        console.log(this.car.x + ' ' + this.car.y);
        // Check if the car is on the road
        //const tile = this.map.getTileAtWorldXY(this.car.x, this.car.y, true, this.cameras.main, this.layer);
        //if (tile && tile.properties.onTrack) {
        //    console.log('Car is on the road');
        //} else {
        //    console.log('Car is off the road');
        //}
    }
}
import Phaser from 'phaser';

export default class Car extends Phaser.GameObjects.Image {
    constructor(scene, x, y, carKey) {
        super(scene, x, y, carKey); // Použijeme Image namiesto Rectangle
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setCollideWorldBounds(true);
        this.speed = 0;
        this.maxSpeed = 200;
        this.acceleration = 10;
        this.deceleration = 50;
        this.turnSpeed = 5;

        this.body.setDrag(0.9);

        // Nastavíme pôvod na stred auta pre správne otáčanie
        this.setOrigin(0.5, 0.5);
        this.setScale(0.5, 0.5); // Zmenšíme auto pre lepšie zobrazenie
    }

    accelerate() {
        this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
    }

    decelerate() {
        this.speed = Math.max(this.speed - this.acceleration, 0);
    }

    turnLeft() {
        this.rotation -= Phaser.Math.DegToRad(this.turnSpeed);
    }

    turnRight() {
        this.rotation += Phaser.Math.DegToRad(this.turnSpeed);
    }

    update(delta) {
        // Apply deceleration when not accelerating
        if (this.speed > 0) {
            this.speed = Math.max(this.speed - this.deceleration * (delta / 1000), 0);
        }

        // Modified velocity calculation assuming car image faces upwards
        const velocityX = Math.sin(this.rotation) * this.speed;
        const velocityY = -Math.cos(this.rotation) * this.speed;
        this.body.setVelocity(velocityX, velocityY);
    }
}
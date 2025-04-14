import Phaser from 'phaser';

export default class Car extends Phaser.GameObjects.Image {
    constructor(scene, x, y, carKey) {
        super(scene, x, y, carKey); // Použijeme Image namiesto Rectangle
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setCollideWorldBounds(true);
        this.speed = 0;
        this.maxSpeed = 200;
        this.maxReverseSpeed = 100;
        this.acceleration = 20;
        this.deceleration = 200;
        this.turnSpeed = 5;

        this.body.setDrag(0.8);

        this.setScale(0.4, 0.4); // Zmenšíme auto pre lepšie zobrazenie
        // Nastavíme pôvod na stred auta pre správne otáčanie
        this.setOrigin(0.5, 0.5);
    }

    accelerate() {
        this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
    }

    decelerate() {
        this.speed = Math.max(this.speed - this.acceleration, 0);
    }

    reverse() {
        this.speed = Math.max(this.speed - this.acceleration, -this.maxReverseSpeed); // Cúvanie
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
        } else if (this.speed < 0) {
            this.speed = Math.min(this.speed + this.deceleration * (delta / 1000), 0);
        }

        // Modified velocity calculation assuming car image faces upwards
        const velocityX = Math.sin(this.rotation) * this.speed;
        const velocityY = -Math.cos(this.rotation) * this.speed;
        this.body.setVelocity(velocityX, velocityY);
    }
}
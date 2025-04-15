import Phaser from 'phaser';

export default class Car extends Phaser.Physics.Matter.Image {
    constructor(scene, x, y, carKey) {
        super(scene.matter.world, x, y, carKey); // Použijeme Image namiesto Rectangle
        scene.add.existing(this);
        this.setIgnoreGravity(true);


        this.speed = 0;
        this.maxSpeed = 7;
        this.maxReverseSpeed = 3;
        this.acceleration = 6;
        this.deceleration = 10;
        this.turnSpeed = 5;

        this.setFixedRotation();
        // Scale car sprite and adjust collision body size
        this.setScale(0.4);

        // Replace the default body with a rectangle matching the image dimensions
        this.setBody({
            type: 'rectangle',
            width: this.displayWidth,
            height: this.displayHeight
        });

        // Set origin so that car rotates around its center
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
        if (Math.abs(this.speed) > 0) {
            this.rotation -= Phaser.Math.DegToRad(this.turnSpeed);
        }
    }

    turnRight() {
        if (Math.abs(this.speed) > 0) {
            this.rotation += Phaser.Math.DegToRad(this.turnSpeed);
        }
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
        this.setVelocity(velocityX, velocityY);
        this.setAngularVelocity(0);
    }
}
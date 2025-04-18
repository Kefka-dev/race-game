import Phaser from 'phaser';

export default class Car extends Phaser.Physics.Matter.Image {
    constructor(scene, x, y, carKey) {
        super(scene.matter.world, x, y, carKey);
        scene.add.existing(this);
        this.setIgnoreGravity(true);
        this.setScale(0.4);

        this.speed = 0;
        this.maxSpeed = 7;
        this.originalMaxSpeed = this.maxSpeed;
        this.maxReverseSpeed = 3;
        this.acceleration = 1;
        this.deceleration = 5;
        this.turnSpeed = 4;

        //lap counter
        this.laps = 0;
        this.lastCheckpointPassed = -1; // Index of the last checkpoint passed (-1 means start/just finished lap)

        // Create main body and sensors
        const mainBody = scene.matter.bodies.rectangle(
            x, y,
            this.width * 0.4,
            this.height * 0.4,
            { label: 'playerCarBody' }
        );

        // Create front and rear sensors
        const sensorWidth = this.width * 0.4;
        const sensorHeight = this.height * 0.1;

        const frontSensor = scene.matter.bodies.rectangle(
            x, y - (this.height * 0.2),
            sensorWidth*0.3,
            sensorHeight,
            {
                isSensor: true,
                label: 'playerFrontSensor'
            }
        );

        const rearSensor = scene.matter.bodies.rectangle(
            x, y + (this.height * 0.2),
            sensorWidth,
            sensorHeight,
            {
                isSensor: true,
                label: 'playerRearSensor'
            }
        );

        // Combine bodies
        const compoundBody = scene.matter.body.create({
            parts: [mainBody, frontSensor, rearSensor],
            friction: 0.01
        });

        this.setExistingBody(compoundBody);
        this.setFixedRotation();
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

    resetLapState() {
        this.laps = 0;
        this.lastCheckpointPassed = -1;
    }
}
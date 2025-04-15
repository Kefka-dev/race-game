import Phaser from "phaser";

export default class Obstacle extends Phaser.Physics.Matter.Image {
    constructor(scene, x, y, obstacleKey, scale) {
        super(scene.matter.world, x, y, obstacleKey); // Použijeme Image namiesto Rectangle
        scene.add.existing(this);
        this.setIgnoreGravity(true);

        this.setFixedRotation();

        // Scale car sprite and adjust collision body size
        this.setScale(scale);
        const width = this.displayWidth;
        const height = this.displayHeight;
        // Replace the default body with a rectangle matching the image dimensions
        this.setBody({
            type: 'rectangle',
            width: width,
            height: height
        });
        this.setStatic(true);
        this.setOrigin(0.5, 0.5);
    }
}
import Phaser from 'phaser';
import { audioManager } from '../managers/AudioManager';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.input.once('pointerdown', () => audioManager.unlock());
    this.input.keyboard?.once('keydown', () => audioManager.unlock());
    this.scene.start('PreloadScene');
  }
}

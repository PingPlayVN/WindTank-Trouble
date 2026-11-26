import Phaser from 'phaser';
import './styles/main.css';
import { gameConfig } from './game/config/gameConfig';
import { mobileOrientationManager } from './game/managers/MobileOrientationManager';

declare global {
  interface Window {
    __WINDTANK_GAME__?: Phaser.Game;
    __PHASER_GAME_DIAGNOSTICS__?: unknown;
  }
}

if (window.__WINDTANK_GAME__) {
  window.__WINDTANK_GAME__.destroy(true);
}

const game = new Phaser.Game(gameConfig);
window.__WINDTANK_GAME__ = game;
mobileOrientationManager.attach(game);

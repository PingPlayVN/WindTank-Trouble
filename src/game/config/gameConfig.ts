import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_COLORS } from './constants';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { MenuScene } from '../scenes/MenuScene';
import { ModeSelectScene } from '../scenes/ModeSelectScene';
import { OnlineLobbyScene } from '../scenes/OnlineLobbyScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { ResultScene } from '../scenes/ResultScene';
import { SetupScene } from '../scenes/SetupScene';
import { UIScene } from '../scenes/UIScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  backgroundColor: UI_COLORS.menuBgHex,
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  fps: {
    smoothStep: false,
    panicMax: 0,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  scene: [
    BootScene,
    PreloadScene,
    MenuScene,
    OnlineLobbyScene,
    SetupScene,
    ModeSelectScene,
    GameScene,
    UIScene,
    ResultScene,
  ],
};

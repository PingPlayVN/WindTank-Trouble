import Phaser from 'phaser';
import './styles/main.css';
import { gameConfig } from './game/config/gameConfig';
import { mobileOrientationManager } from './game/managers/MobileOrientationManager';
import { peerMultiplayer } from './game/network/PeerMultiplayerManager';

declare global {
  interface Window {
    __WINDTANK_GAME__?: Phaser.Game;
    __PHASER_GAME_DIAGNOSTICS__?: unknown;
    __WINDTANK_BG_ONLINE_TIMER__?: number;
  }
}

if (window.__WINDTANK_BG_ONLINE_TIMER__) {
  window.clearInterval(window.__WINDTANK_BG_ONLINE_TIMER__);
}
if (window.__WINDTANK_GAME__) {
  window.__WINDTANK_GAME__.destroy(true);
}

const game = new Phaser.Game(gameConfig);
window.__WINDTANK_GAME__ = game;
mobileOrientationManager.attach(game);

// Keep Online 1vs1 Lobby & Match simulation ticking smoothly even if Host/Guest tab loses focus
game.events.on(Phaser.Core.Events.HIDDEN, () => {
  if (peerMultiplayer.isOnlineSession()) {
    game.loop.wake();
  }
});

window.__WINDTANK_BG_ONLINE_TIMER__ = window.setInterval(() => {
  if (document.hidden && peerMultiplayer.isOnlineSession()) {
    if (!game.loop.running) {
      game.loop.wake();
    }
    game.loop.step(performance.now());
  }
}, 40);


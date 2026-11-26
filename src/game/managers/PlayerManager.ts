import type { GameSettings, PlayerConfig, PlayerIndex } from '../types/gameTypes';

export class PlayerManager {
  static buildRoster(settings: GameSettings): PlayerConfig[] {
    const roster: PlayerConfig[] = [];
    for (let i = 0; i < 4; i++) {
      const index = i as PlayerIndex;
      roster.push({
        index,
        name: `P${i + 1}`,
        active: i < settings.playerCount,
        colorId: settings.playerColors[i],
        bindings: { ...settings.playerBindings[i] },
        isAI: Boolean(settings.playerIsAI?.[i]),
        aiDifficulty: settings.playerAIDifficulty?.[i] ?? 'normal',
      });
    }
    return roster;
  }

  static getActivePlayers(settings: GameSettings): PlayerConfig[] {
    return PlayerManager.buildRoster(settings).filter((p) => p.active);
  }
}

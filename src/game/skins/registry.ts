import type { TankSkinId } from '../types/gameTypes';
import { ARACHNID_BARRAGE_SKIN } from './items/arachnidBarrageSkin';
import { CLASSIC_SKIN } from './items/classicSkin';
import { CYBER_OMEGA_SKIN } from './items/cyberOmegaSkin';
import { FALCON_SNIPER_SKIN } from './items/falconSniperSkin';
import { HOVER_SPECTER_SKIN } from './items/hoverSpecterSkin';
import { MAGMA_DRAKE_SKIN } from './items/magmaDrakeSkin';
import { TITAN_HEAVY_SKIN } from './items/titanHeavySkin';
import { VIPER_SCOUT_SKIN } from './items/viperScoutSkin';
import {
  NEUTRAL_SKIN_STATS,
  type TankSkinDescriptor,
  type TankSkinModule,
  type TankSkinStats,
} from './types';

export const TANK_SKIN_MODULES: readonly TankSkinModule[] = [
  CLASSIC_SKIN,
  VIPER_SCOUT_SKIN,
  TITAN_HEAVY_SKIN,
  FALCON_SNIPER_SKIN,
  ARACHNID_BARRAGE_SKIN,
  HOVER_SPECTER_SKIN,
  MAGMA_DRAKE_SKIN,
  CYBER_OMEGA_SKIN,
];

export const TANK_SKIN_DESCRIPTORS: readonly TankSkinDescriptor[] = TANK_SKIN_MODULES.map(
  (m) => m.descriptor,
);

export const ALL_TANK_SKIN_IDS: readonly TankSkinId[] = TANK_SKIN_DESCRIPTORS.map((d) => d.id);

const MODULE_MAP: Record<TankSkinId, TankSkinModule> = {
  classic: CLASSIC_SKIN,
  viper_scout: VIPER_SCOUT_SKIN,
  titan_heavy: TITAN_HEAVY_SKIN,
  falcon_sniper: FALCON_SNIPER_SKIN,
  arachnid_barrage: ARACHNID_BARRAGE_SKIN,
  hover_specter: HOVER_SPECTER_SKIN,
  magma_drake: MAGMA_DRAKE_SKIN,
  cyber_omega: CYBER_OMEGA_SKIN,
};

export function isValidTankSkinId(id: unknown): id is TankSkinId {
  return typeof id === 'string' && id in MODULE_MAP;
}

export function getTankSkinModule(id?: TankSkinId | string | null): TankSkinModule {
  if (id && id in MODULE_MAP) {
    return MODULE_MAP[id as TankSkinId];
  }
  return CLASSIC_SKIN;
}

export function getTankSkinDescriptor(id?: TankSkinId | string | null): TankSkinDescriptor {
  return getTankSkinModule(id).descriptor;
}

/**
 * Resolves the effective combat stats for a Tank Skin, honoring the Fair-Play Room Rule (`skinStatsEnabled`):
 * - `skinStatsEnabled === true` ("Thực Chiến"): returns the skin's unique tactical trade-off stats.
 * - `skinStatsEnabled === false` ("Thuần Ngoại Trang"): returns 100% baseline `NEUTRAL_SKIN_STATS` while keeping all skin visuals & VFX!
 */
export function resolveEffectiveSkinStats(
  skinId: TankSkinId | undefined | null,
  skinStatsEnabled: boolean,
): TankSkinStats {
  if (!skinStatsEnabled) {
    return { ...NEUTRAL_SKIN_STATS };
  }
  return { ...getTankSkinModule(skinId).descriptor.stats };
}

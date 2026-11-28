export * from './viewportConfig';
export * from './paletteConfig';
export * from './gameplayConfig';
export * from './battleModeConfig';
export * from './defaultSettings';
export {
  ALL_SKILL_IDS,
  getSkillDescriptor,
  SKILL_DESCRIPTORS,
} from '../skills/registry';
export type { SkillDescriptor } from '../skills/types';
export {
  ALL_TANK_SKIN_IDS,
  getTankSkinDescriptor,
  getTankSkinModule,
  isValidTankSkinId,
  resolveEffectiveSkinStats,
  TANK_SKIN_DESCRIPTORS,
} from '../skins/registry';
export type { TankSkinDescriptor, TankSkinStats } from '../skins/types';

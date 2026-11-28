import type Phaser from 'phaser';
import type { SkillId, TankColorPalette, TankKinematics, TankSkinId } from '../types/gameTypes';

export type SkinRarity = 'starter' | 'common' | 'rare' | 'epic' | 'legendary';

export interface TankSkinStats {
  /** Hitbox & chassis scale multiplier (`1.0` = standard) */
  radiusScale: number;
  /** Forward speed multiplier */
  forwardSpeedScale: number;
  /** Reverse speed multiplier */
  backwardSpeedScale: number;
  /** Hull & turret rotation speed multiplier */
  turnSpeedScale: number;
  /** Standard shell magazine capacity (`10` = standard) */
  maxAmmo: number;
  /** Standard fire cooldown multiplier (`< 1.0` = faster fire rate) */
  fireCooldownScale: number;
  /** Standard projectile speed multiplier */
  projectileSpeedScale: number;
  /** Standard projectile radius multiplier */
  projectileRadiusScale: number;
  /** Bonus wall bounces for standard shells */
  projectileBonusBounces: number;
  /** Standard shell damage multiplier in Armor HP modes */
  standardBulletDamageScale: number;
  /** Max Armor HP multiplier in Armor HP modes */
  armorHpScale: number;
  /** Explosion & impact knockback multiplier (`< 1.0` = heavier resistance) */
  knockbackScale: number;
  /** Firing recoil impulse multiplier */
  recoilScale: number;
  /** Resistance against Cryo Zone slow & freeze buildup (`0..0.65`) */
  iceResistRatio: number;
  /** Duration multiplier for Freeze & EMP Jam debuffs (`<= 1.0`) */
  ccDurationScale: number;
  /** Headlight beam distance multiplier in Night Ops modes */
  headlightRangeScale: number;
}

export interface TankSkinDescriptor {
  id: TankSkinId;
  name: string;
  shortName: string;
  rarity: SkinRarity;
  rarityLabel: string;
  rarityColor: number;
  rarityHex: string;
  priceXu: number;
  tagline: string;
  pros: [string, string];
  cons: [string, string];
  stats: TankSkinStats;
  leavesTreadMarks: boolean;
  hoverBobAmplitude: number;
}

export interface SkinLiveAuraParams {
  kinematics: Readonly<TankKinematics>;
  palette: TankColorPalette;
  scaleRatio: number;
  timeSec: number;
  auraGraphics: Phaser.GameObjects.Graphics;
  overlayGraphics: Phaser.GameObjects.Graphics;
  trailHistory?: ReadonlyArray<{ x: number; y: number; angle: number }>;
}

export interface TankSkinModule {
  descriptor: TankSkinDescriptor;
  drawChassis(
    ctx: CanvasRenderingContext2D,
    palette: TankColorPalette,
    treadPhase: number,
    skill: SkillId | null,
  ): void;
  drawHullClipPath(ctx: CanvasRenderingContext2D): void;
  drawStandardBarrel(ctx: CanvasRenderingContext2D, palette: TankColorPalette): void;
  drawTurret(
    ctx: CanvasRenderingContext2D,
    palette: TankColorPalette,
    skill: SkillId | null,
  ): void;
  drawLiveAura?(params: SkinLiveAuraParams): void;
}

export const NEUTRAL_SKIN_STATS: Readonly<TankSkinStats> = {
  radiusScale: 1.0,
  forwardSpeedScale: 1.0,
  backwardSpeedScale: 1.0,
  turnSpeedScale: 1.0,
  maxAmmo: 10,
  fireCooldownScale: 1.0,
  projectileSpeedScale: 1.0,
  projectileRadiusScale: 1.0,
  projectileBonusBounces: 0,
  standardBulletDamageScale: 1.0,
  armorHpScale: 1.0,
  knockbackScale: 1.0,
  recoilScale: 1.0,
  iceResistRatio: 0,
  ccDurationScale: 1.0,
  headlightRangeScale: 1.0,
};

import Phaser from 'phaser';
import { SKILL_DESCRIPTORS, TANK_PALETTES, UI_COLORS } from '../config/constants';
import type { SkillId, TankColorPalette } from '../types/gameTypes';

/**
 * Generates crisp, anti-aliased vector-style 2D Canvas textures for:
 * - Standard tanks (6 palettes × 3 tread frames) + HUD icons
 * - All 10 Superhero-transformed tanks (6 palettes × 10 skills × 3 tread frames) + HUD icons
 * - Mystery Wooden Crate, Stealth Mine, Drill, Flame, Scatter, Spike Ball/Shard, Gatling, Homing Missile
 * - Explosive VFX particles & 10 custom Skill Codex emblems
 */
export class AssetFactory {
  static registerAll(scene: Phaser.Scene): void {
    const tex = scene.textures;
    if (tex.exists('tank_red_0')) return;

    const skills: SkillId[] = SKILL_DESCRIPTORS.map((d) => d.id);

    for (const palette of TANK_PALETTES) {
      for (let frame = 0; frame < 3; frame++) {
        AssetFactory.createTankTexture(tex, `tank_${palette.id}_${frame}`, palette, frame, 64, 52, null);
        for (const skill of skills) {
          AssetFactory.createTankTexture(
            tex,
            `tank_${palette.id}_${skill}_${frame}`,
            palette,
            frame,
            64,
            52,
            skill,
          );
        }
      }
      AssetFactory.createTankTexture(tex, `tank_icon_${palette.id}`, palette, 0, 56, 46, null);
      for (const skill of skills) {
        AssetFactory.createTankTexture(
          tex,
          `tank_icon_${palette.id}_${skill}`,
          palette,
          0,
          56,
          46,
          skill,
        );
      }
    }

    AssetFactory.createTankShadowTexture(tex, 'tank_shadow', 64, 52);
    AssetFactory.createShellTexture(tex, 'projectile_shell', 16);
    AssetFactory.createGatlingBulletTexture(tex, 'projectile_gatling', 14);
    AssetFactory.createScatterPelletTexture(tex, 'projectile_scatter', 14);
    AssetFactory.createSpikeBallTexture(tex, 'projectile_spike_ball', 24);
    AssetFactory.createSpikeShardTexture(tex, 'projectile_spike_shard', 18, 10);
    AssetFactory.createMissileTexture(tex, 'projectile_missile', 28, 16);
    AssetFactory.createDrillProjectileTexture(tex, 'projectile_drill', 38, 22);
    AssetFactory.createFlameProjectileTexture(tex, 'projectile_flame', 46, 36, 0);
    AssetFactory.createFlameProjectileTexture(tex, 'projectile_flame_0', 46, 36, 0);
    AssetFactory.createFlameProjectileTexture(tex, 'projectile_flame_1', 46, 36, 1);
    AssetFactory.createFlameProjectileTexture(tex, 'projectile_flame_2', 46, 36, 2);
    AssetFactory.createEmpOrbTexture(tex, 'projectile_emp_orb', 32);
    AssetFactory.createCryoOrbTexture(tex, 'projectile_cryo_orb', 30);
    AssetFactory.createMineTexture(tex, 'pickup_mine', 26);
    AssetFactory.createWarpBeaconTexture(tex, 'pickup_warp_beacon', 48);
    AssetFactory.createWoodenCrateTexture(tex, 'pickup_wood_crate', 44);
    AssetFactory.createTntBarrelTexture(tex, 'prop_tnt_barrel', 40);
    AssetFactory.createGroundSpikeTexture(tex, 'decal_ground_spike', 24);

    AssetFactory.createTreadDecalTexture(tex, 'decal_tread', 10, 26);
    AssetFactory.createScorchDecalTexture(tex, 'decal_scorch', 78);
    AssetFactory.createSoftCircleTexture(tex, 'vfx_circle', 24, '#FFFFFF');
    AssetFactory.createStarSparkTexture(tex, 'vfx_star', 22);
    AssetFactory.createWoodPlankTexture(tex, 'vfx_wood', 16, 7);
    AssetFactory.createShardTexture(tex, 'vfx_shard', 14);
    AssetFactory.createCrownTexture(tex, 'ui_crown', 32);

    for (const desc of SKILL_DESCRIPTORS) {
      AssetFactory.createSkillEmblemTexture(tex, `skill_emblem_${desc.id}`, desc.id, 44);
    }
  }

  /**
   * Non-blocking frame-sliced texture generator so the Loading Screen animates at a silky 60 FPS
   * with real incremental progress (`0.0 -> 1.0`) and zero main-thread stutter on Mobile or PC!
   */
  static async registerAllAsync(
    scene: Phaser.Scene,
    onProgress?: (progress01: number, stageLabel: string) => void,
  ): Promise<void> {
    const tex = scene.textures;
    if (tex.exists('tank_red_0') && tex.exists('skill_emblem_warp')) {
      onProgress?.(1, 'Sẵn sàng xuất kích!');
      return;
    }

    const yieldFrame = () =>
      new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };
          window.requestAnimationFrame(finish);
          window.setTimeout(finish, 24);
        } else {
          resolve();
        }
      });

    const skills: SkillId[] = SKILL_DESCRIPTORS.map((d) => d.id);
    const totalSteps = TANK_PALETTES.length + 3;
    let completed = 0;

    const report = (label: string) => {
      completed++;
      onProgress?.(Math.min(1, completed / totalSteps), label);
    };

    for (const palette of TANK_PALETTES) {
      for (let frame = 0; frame < 3; frame++) {
        const stdKey = `tank_${palette.id}_${frame}`;
        if (!tex.exists(stdKey)) {
          AssetFactory.createTankTexture(tex, stdKey, palette, frame, 64, 52, null);
        }
        for (const skill of skills) {
          const skKey = `tank_${palette.id}_${skill}_${frame}`;
          if (!tex.exists(skKey)) {
            AssetFactory.createTankTexture(tex, skKey, palette, frame, 64, 52, skill);
          }
        }
      }
      const iconKey = `tank_icon_${palette.id}`;
      if (!tex.exists(iconKey)) {
        AssetFactory.createTankTexture(tex, iconKey, palette, 0, 56, 46, null);
      }
      for (const skill of skills) {
        const skIconKey = `tank_icon_${palette.id}_${skill}`;
        if (!tex.exists(skIconKey)) {
          AssetFactory.createTankTexture(tex, skIconKey, palette, 0, 56, 46, skill);
        }
      }
      report(`Đang rèn chiến xa & 15 Giáp Siêu Nhân (${palette.name})…`);
      await yieldFrame();
    }

    if (!tex.exists('tank_shadow')) AssetFactory.createTankShadowTexture(tex, 'tank_shadow', 64, 52);
    if (!tex.exists('projectile_shell')) AssetFactory.createShellTexture(tex, 'projectile_shell', 16);
    if (!tex.exists('projectile_gatling')) AssetFactory.createGatlingBulletTexture(tex, 'projectile_gatling', 14);
    if (!tex.exists('projectile_scatter')) AssetFactory.createScatterPelletTexture(tex, 'projectile_scatter', 14);
    if (!tex.exists('projectile_spike_ball')) AssetFactory.createSpikeBallTexture(tex, 'projectile_spike_ball', 24);
    if (!tex.exists('projectile_spike_shard')) AssetFactory.createSpikeShardTexture(tex, 'projectile_spike_shard', 18, 10);
    if (!tex.exists('projectile_missile')) AssetFactory.createMissileTexture(tex, 'projectile_missile', 28, 16);
    if (!tex.exists('projectile_drill')) AssetFactory.createDrillProjectileTexture(tex, 'projectile_drill', 38, 22);
    if (!tex.exists('projectile_emp_orb')) AssetFactory.createEmpOrbTexture(tex, 'projectile_emp_orb', 32);
    if (!tex.exists('projectile_cryo_orb')) AssetFactory.createCryoOrbTexture(tex, 'projectile_cryo_orb', 30);
    report('Đang chế tạo kho vũ khí, mũi khoan & tên lửa định vị…');
    await yieldFrame();

    if (!tex.exists('projectile_flame')) AssetFactory.createFlameProjectileTexture(tex, 'projectile_flame', 46, 36, 0);
    if (!tex.exists('projectile_flame_0')) AssetFactory.createFlameProjectileTexture(tex, 'projectile_flame_0', 46, 36, 0);
    if (!tex.exists('projectile_flame_1')) AssetFactory.createFlameProjectileTexture(tex, 'projectile_flame_1', 46, 36, 1);
    if (!tex.exists('projectile_flame_2')) AssetFactory.createFlameProjectileTexture(tex, 'projectile_flame_2', 46, 36, 2);
    if (!tex.exists('pickup_mine')) AssetFactory.createMineTexture(tex, 'pickup_mine', 26);
    if (!tex.exists('pickup_warp_beacon')) AssetFactory.createWarpBeaconTexture(tex, 'pickup_warp_beacon', 48);
    if (!tex.exists('pickup_wood_crate')) AssetFactory.createWoodenCrateTexture(tex, 'pickup_wood_crate', 44);
    if (!tex.exists('prop_tnt_barrel')) AssetFactory.createTntBarrelTexture(tex, 'prop_tnt_barrel', 40);
    if (!tex.exists('decal_ground_spike')) AssetFactory.createGroundSpikeTexture(tex, 'decal_ground_spike', 24);
    report('Đang nạp hiệu ứng lửa nhiệt hạch & thùng gỗ bí ẩn…');
    await yieldFrame();

    if (!tex.exists('decal_tread')) AssetFactory.createTreadDecalTexture(tex, 'decal_tread', 10, 26);
    if (!tex.exists('decal_scorch')) AssetFactory.createScorchDecalTexture(tex, 'decal_scorch', 78);
    if (!tex.exists('vfx_circle')) AssetFactory.createSoftCircleTexture(tex, 'vfx_circle', 24, '#FFFFFF');
    if (!tex.exists('vfx_star')) AssetFactory.createStarSparkTexture(tex, 'vfx_star', 22);
    if (!tex.exists('vfx_wood')) AssetFactory.createWoodPlankTexture(tex, 'vfx_wood', 16, 7);
    if (!tex.exists('vfx_shard')) AssetFactory.createShardTexture(tex, 'vfx_shard', 14);
    if (!tex.exists('ui_crown')) AssetFactory.createCrownTexture(tex, 'ui_crown', 32);

    for (const desc of SKILL_DESCRIPTORS) {
      const embKey = `skill_emblem_${desc.id}`;
      if (!tex.exists(embKey)) {
        AssetFactory.createSkillEmblemTexture(tex, embKey, desc.id, 44);
      }
    }
    report('Hoàn tất 100% — Sẵn sàng xuất kích!');
  }

  private static makeCanvas(w: number, h: number): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    return { canvas, ctx };
  }

  private static createTankTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    palette: TankColorPalette,
    treadPhase: number,
    width: number,
    height: number,
    skill: SkillId | null,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(width, height);
    const cx = width * 0.44;
    const cy = height * 0.5;
    const scale = width / 64;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const outline = '#18191B';

    // 0. Superhero Rear Wings / Side Shields / Rear Racks
    if (skill === 'laser') {
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-8, sign * 11);
        ctx.lineTo(-22, sign * 22);
        ctx.lineTo(-4, sign * 19);
        ctx.lineTo(8, sign * 12);
        ctx.closePath();
        ctx.fillStyle = '#E0F7FA';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = outline;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-17, sign * 19.5);
        ctx.lineTo(-4, sign * 16.5);
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    } else if (skill === 'homing') {
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-6, sign * 11);
        ctx.lineTo(-23, sign * 23);
        ctx.lineTo(-13, sign * 23);
        ctx.lineTo(4, sign * 13);
        ctx.closePath();
        ctx.fillStyle = '#ECEFF1';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = outline;
        ctx.stroke();
        ctx.fillStyle = '#FF1744';
        ctx.fillRect(-18, sign > 0 ? 18 : -21, 7, 3);
      }
    } else if (skill === 'gatling') {
      for (const ty of [-7.5, 3.5]) {
        AssetFactory.roundRectPath(ctx, -23, ty, 7, 4.2, 1.5);
        ctx.fillStyle = '#FFB300';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = outline;
        ctx.stroke();
      }
    } else if (skill === 'shield') {
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-14, sign * 14);
        ctx.quadraticCurveTo(0, sign * 23, 15, sign * 14);
        ctx.lineTo(11, sign * 11);
        ctx.quadraticCurveTo(0, sign * 17, -11, sign * 11);
        ctx.closePath();
        ctx.fillStyle = '#00E5FF';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = outline;
        ctx.stroke();
      }
    } else if (skill === 'reaper') {
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-4, sign * 11);
        ctx.quadraticCurveTo(-20, sign * 25, 14, sign * 23.5);
        ctx.quadraticCurveTo(2, sign * 17, 8, sign * 12);
        ctx.closePath();
        ctx.fillStyle = '#0D0E12';
        ctx.fill();
        ctx.lineWidth = 1.9;
        ctx.strokeStyle = '#FF1744';
        ctx.stroke();
      }
    } else if (skill === 'drill') {
      // Heavy lateral hydraulic stabilizer pistons
      for (const py of [-14.2, 10.2]) {
        AssetFactory.roundRectPath(ctx, -14, py, 24, 4.0, 1.5);
        ctx.fillStyle = '#37474F';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = outline;
        ctx.stroke();
        ctx.fillStyle = '#ECEFF1';
        ctx.fillRect(6, py + 0.8, 7, 2.4);
      }
    } else if (skill === 'mine') {
      AssetFactory.roundRectPath(ctx, -24.5, -8.5, 8, 17, 2);
      ctx.fillStyle = '#263238';
      ctx.fill();
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-20.5, 0, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#FF1744';
      ctx.fill();
    } else if (skill === 'emp') {
      // Swept Obsidian-Indigo Thunder-God Wing Pylons with high-voltage cyan/gold ribs!
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-6, sign * 11);
        ctx.lineTo(-24, sign * 23);
        ctx.lineTo(-7, sign * 22);
        ctx.lineTo(10, sign * 13);
        ctx.closePath();
        ctx.fillStyle = '#0D0A22';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#651FFF';
        ctx.stroke();

        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-19, sign * 20.5);
        ctx.lineTo(-4, sign * 16.5);
        ctx.stroke();
        ctx.fillStyle = '#FFEA00';
        ctx.beginPath();
        ctx.arc(-12, sign * 18.5, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (skill === 'phantom') {
      // Reaper-tier Abyssal-Obsidian & Neon-Violet Wraith Scythe Wings!
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-4, sign * 11);
        ctx.quadraticCurveTo(-24, sign * 25.5, 13, sign * 23);
        ctx.quadraticCurveTo(1, sign * 16.5, 9, sign * 12);
        ctx.closePath();
        ctx.fillStyle = '#0E091C';
        ctx.fill();
        ctx.lineWidth = 1.9;
        ctx.strokeStyle = '#E040FB';
        ctx.stroke();
      }
    } else if (skill === 'cryo') {
      // Dramatic Midnight-Sapphire & Diamond-Cyan Glacial Crown Spikes!
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-15, sign * 12);
        ctx.lineTo(-21, sign * 22.5);
        ctx.lineTo(-7, sign * 18.5);
        ctx.lineTo(2, sign * 23.5);
        ctx.lineTo(13, sign * 13);
        ctx.closePath();
        ctx.fillStyle = '#072233';
        ctx.fill();
        ctx.lineWidth = 1.7;
        ctx.strokeStyle = '#00E5FF';
        ctx.stroke();
        ctx.fillStyle = '#84FFFF';
        ctx.beginPath();
        ctx.arc(-3, sign * 18.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (skill === 'barrier') {
      // Heavy Obsidian-Titanium & Neon-Emerald Force-Projector Bastion Shoulders!
      for (const sign of [-1, 1]) {
        AssetFactory.roundRectPath(ctx, -8, sign > 0 ? 11 : -21.5, 26, 10.5, 2.5);
        ctx.fillStyle = '#0A1F15';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#00E676';
        ctx.stroke();
        ctx.fillStyle = '#69F0AE';
        ctx.fillRect(11, sign > 0 ? 13 : -19.5, 5, 6.5);
      }
    } else if (skill === 'warp') {
      // Floating Obsidian-Magenta-Cyan Stargate Halo Ring behind chassis!
      ctx.beginPath();
      ctx.arc(-15, 0, 13.5, Math.PI * 0.48, Math.PI * 1.52);
      ctx.lineWidth = 5.2;
      ctx.strokeStyle = '#090614';
      ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#E040FB';
      ctx.stroke();
      ctx.fillStyle = '#80D8FF';
      for (const sy of [-12.5, 0, 12.5]) {
        ctx.beginPath();
        ctx.arc(sy === 0 ? -28.5 : -17, sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 1. Left & Right Treads
    const treadPositions = [-15.5, 9.0];
    for (const ty of treadPositions) {
      AssetFactory.roundRectPath(ctx, -19, ty, 38, 6.5, 2.5);
      ctx.fillStyle = skill === 'laser' ? '#1A2733' : skill === 'spike' ? '#231F20' : '#2B2D30';
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = skill === 'laser' ? '#00B0FF' : skill === 'reaper' ? '#FF1744' : '#161719';
      const offset = (treadPhase * 2.2) % 6.6;
      for (let gx = -22 + offset; gx < 20; gx += 6.6) {
        ctx.fillRect(gx, ty, skill === 'laser' || skill === 'reaper' ? 1.8 : 2.6, 6.5);
      }
      ctx.restore();

      AssetFactory.roundRectPath(ctx, -19, ty, 38, 6.5, 2.5);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }

    // 2. Main Hull Body
    AssetFactory.roundRectPath(ctx, -17, -11.5, 34, 23, 4.5);
    const hullGrad = ctx.createLinearGradient(-17, -12, 17, 12);
    hullGrad.addColorStop(0, palette.highlightHex);
    hullGrad.addColorStop(0.35, palette.primaryHex);
    hullGrad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = hullGrad;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, -9.8);
    ctx.lineTo(15, -9.8);
    ctx.stroke();

    if (skill === 'laser') {
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.moveTo(15, -9);
      ctx.lineTo(4, 0);
      ctx.lineTo(15, 9);
      ctx.lineTo(11, 9);
      ctx.lineTo(0, 0);
      ctx.lineTo(11, -9);
      ctx.closePath();
      ctx.fill();
    } else if (skill === 'gatling') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(-16, -7.2, 32, 2.2);
      ctx.fillRect(-16, 5.0, 32, 2.2);
      ctx.strokeStyle = '#FFD54F';
      ctx.lineWidth = 3.2;
      ctx.setLineDash([2.4, 1.6]);
      ctx.beginPath();
      ctx.moveTo(-12, -11);
      ctx.lineTo(10, 11);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (skill === 'spike') {
      ctx.strokeStyle = '#37474F';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-15, -10);
      ctx.lineTo(14, 10);
      ctx.moveTo(-15, 10);
      ctx.lineTo(14, -10);
      ctx.stroke();
    } else if (skill === 'homing') {
      ctx.fillStyle = '#ECEFF1';
      ctx.beginPath();
      ctx.moveTo(-16, -11);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-16, 11);
      ctx.closePath();
      ctx.fill();
    } else if (skill === 'drill') {
      ctx.strokeStyle = '#FFD600';
      ctx.lineWidth = 3.2;
      for (let sx = -18; sx <= 14; sx += 8) {
        ctx.beginPath();
        ctx.moveTo(sx, -12);
        ctx.lineTo(sx + 8, 12);
        ctx.stroke();
      }
    } else if (skill === 'flame') {
      ctx.fillStyle = '#FFEA00';
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(3, -8);
      ctx.lineTo(7, -2);
      ctx.lineTo(-8, -6);
      ctx.lineTo(0, 0);
      ctx.lineTo(-8, 6);
      ctx.lineTo(7, 2);
      ctx.lineTo(3, 8);
      ctx.closePath();
      ctx.fill();
    } else if (skill === 'scatter') {
      ctx.strokeStyle = '#E3F2FD';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-12, -9);
      ctx.lineTo(12, 0);
      ctx.lineTo(-12, 9);
      ctx.stroke();
    } else if (skill === 'shield') {
      ctx.fillStyle = 'rgba(224, 247, 250, 0.72)';
      ctx.fillRect(-14, -2.2, 28, 4.4);
      ctx.fillRect(-2, -10, 4.4, 20);
    } else if (skill === 'mine') {
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(6, -10);
      ctx.lineTo(-6, 0);
      ctx.lineTo(6, 10);
      ctx.stroke();
    } else if (skill === 'reaper') {
      ctx.fillStyle = '#0D0E12';
      ctx.beginPath();
      ctx.arc(0, 0, 10.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FF1744';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    } else if (skill === 'emp') {
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-13, -7);
      ctx.lineTo(-2, -1);
      ctx.lineTo(-6, 4);
      ctx.lineTo(12, 8);
      ctx.stroke();
    } else if (skill === 'phantom') {
      ctx.strokeStyle = 'rgba(237, 231, 246, 0.85)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 11.5, -1.1, 1.1);
      ctx.stroke();
    } else if (skill === 'cryo') {
      ctx.strokeStyle = '#E0F7FA';
      ctx.lineWidth = 2.2;
      for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * -10, Math.sin(a) * -10);
        ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
        ctx.stroke();
      }
    } else if (skill === 'barrier') {
      ctx.fillStyle = '#69F0AE';
      ctx.fillRect(9, -10, 4, 20);
      ctx.fillStyle = 'rgba(105, 240, 174, 0.45)';
      ctx.fillRect(-12, -8, 16, 2.5);
      ctx.fillRect(-12, 5.5, 16, 2.5);
    } else if (skill === 'warp') {
      ctx.strokeStyle = '#EA80FC';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(20, 22, 25, 0.38)';
      ctx.fillRect(-13.5, -6.5, 3.2, 3.2);
      ctx.fillRect(-13.5, -1.6, 3.2, 3.2);
      ctx.fillRect(-13.5, 3.3, 3.2, 3.2);
    }
    ctx.restore();

    AssetFactory.roundRectPath(ctx, -17, -11.5, 34, 23, 4.5);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // Extra Hull Attachments
    if (skill === 'spike') {
      ctx.fillStyle = '#CFD8DC';
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5;
      for (const ry of [-8, 0, 8]) {
        ctx.beginPath();
        ctx.moveTo(16.5, ry - 2.8);
        ctx.lineTo(22.5, ry);
        ctx.lineTo(16.5, ry + 2.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      const corners: Array<[number, number, number, number]> = [
        [-13, -15, -18, -22],
        [11, -15, 16, -22],
        [-13, 15, -18, 22],
        [11, 15, 16, 22],
      ];
      for (const [bx, by, tx, ty] of corners) {
        ctx.beginPath();
        ctx.moveTo(bx - 3, by);
        ctx.lineTo(tx, ty);
        ctx.lineTo(bx + 3, by);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (skill === 'homing') {
      for (const py of [-13.5, 7.5]) {
        AssetFactory.roundRectPath(ctx, -5, py, 12, 6, 1.8);
        ctx.fillStyle = '#455A64';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = outline;
        ctx.stroke();
        ctx.fillStyle = '#FF1744';
        ctx.beginPath();
        ctx.arc(5.2, py + 3, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (skill === 'flame') {
      for (const py of [-13.8, 7.8]) {
        AssetFactory.roundRectPath(ctx, -12, py, 20, 6, 2.8);
        ctx.fillStyle = '#FF3D00';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = outline;
        ctx.stroke();
        ctx.fillStyle = '#FFD600';
        ctx.fillRect(-4, py + 0.8, 3.5, 4.4);
      }
    }

    // 3. Weapon Barrel (tailored per Superhero Skill!)
    if (skill === 'laser') {
      for (const by of [-4.8, 1.8]) {
        AssetFactory.roundRectPath(ctx, 2, by, 27, 3.0, 1.2);
        ctx.fillStyle = '#ECEFF1';
        ctx.fill();
        ctx.lineWidth = 1.7;
        ctx.strokeStyle = outline;
        ctx.stroke();
      }
      ctx.fillStyle = '#00E5FF';
      ctx.fillRect(4, -1.6, 24, 3.2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(5, -0.7, 22, 1.4);
    } else if (skill === 'gatling') {
      for (const by of [-4.4, -1.3, 1.8]) {
        ctx.fillStyle = '#37474F';
        ctx.fillRect(3, by, 25, 2.5);
        ctx.strokeStyle = outline;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(3, by, 25, 2.5);
      }
      ctx.fillStyle = '#FFB300';
      ctx.fillRect(15, -5.0, 3.2, 10.0);
      ctx.fillRect(23.5, -5.0, 3.5, 10.0);
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(23.5, -5.0, 3.5, 10.0);
    } else if (skill === 'spike') {
      AssetFactory.roundRectPath(ctx, 2, -5.0, 24, 10.0, 2.2);
      ctx.fillStyle = '#455A64';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = outline;
      ctx.stroke();
      AssetFactory.roundRectPath(ctx, 21, -6.2, 6, 12.4, 1.6);
      ctx.fillStyle = '#263238';
      ctx.fill();
      ctx.stroke();
    } else if (skill === 'homing') {
      AssetFactory.roundRectPath(ctx, 2, -4.4, 25, 8.8, 2.2);
      ctx.fillStyle = '#CFD8DC';
      ctx.fill();
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = outline;
      ctx.stroke();
      AssetFactory.roundRectPath(ctx, 22, -4.8, 5.8, 9.6, 1.5);
      ctx.fillStyle = '#E53935';
      ctx.fill();
      ctx.stroke();
    } else if (skill === 'scatter') {
      for (const ang of [-0.26, 0, 0.26]) {
        ctx.save();
        ctx.rotate(ang);
        AssetFactory.roundRectPath(ctx, 4, -2.4, 22, 4.8, 1.4);
        ctx.fillStyle = '#455A64';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = outline;
        ctx.stroke();
        ctx.fillStyle = '#2979FF';
        ctx.fillRect(22, -3.0, 4, 6.0);
        ctx.strokeRect(22, -3.0, 4, 6.0);
        ctx.restore();
      }
    } else if (skill === 'drill') {
      // Reinforced hydraulic drill collar
      AssetFactory.roundRectPath(ctx, 1, -6.5, 9.5, 13, 2);
      ctx.fillStyle = '#263238';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = '#FFB300';
      ctx.fillRect(3.5, -5.5, 2.5, 11);

      // Multi-tiered tungsten-chrome conical spiral auger bit
      ctx.beginPath();
      ctx.moveTo(10, -7.8);
      ctx.lineTo(31, 0);
      ctx.lineTo(10, 7.8);
      ctx.closePath();
      const dGrad = ctx.createLinearGradient(10, -7.5, 28, 7.5);
      dGrad.addColorStop(0, '#FFFFFF');
      dGrad.addColorStop(0.32, '#CFD8DC');
      dGrad.addColorStop(0.65, '#FFB300');
      dGrad.addColorStop(1, '#455A64');
      ctx.fillStyle = dGrad;
      ctx.fill();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = outline;
      ctx.stroke();

      //Glowing magma core seam + helical chrome flutes
      ctx.strokeStyle = '#FF6D00';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(27, 0);
      ctx.stroke();

      ctx.strokeStyle = '#18191B';
      ctx.lineWidth = 1.7;
      for (const [x0, y0, x1, y1] of [
        [12.5, -6.4, 15.5, 5.6],
        [17.0, -4.9, 19.8, 4.1],
        [21.5, -3.2, 24.0, 2.6],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    } else if (skill === 'flame') {
      AssetFactory.roundRectPath(ctx, 2, -4.6, 20, 9.2, 2);
      ctx.fillStyle = '#37474F';
      ctx.fill();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = outline;
      ctx.stroke();

      AssetFactory.roundRectPath(ctx, 19, -5.8, 7.5, 11.6, 2);
      ctx.fillStyle = '#FF3D00';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(27.5, 0, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFEA00';
      ctx.fill();
    } else if (skill === 'shield') {
      AssetFactory.roundRectPath(ctx, 2, -3.8, 24, 7.6, 2.2);
      ctx.fillStyle = '#E0F2F1';
      ctx.fill();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = '#00BFA5';
      ctx.fillRect(18, -4.4, 6, 8.8);
      ctx.strokeRect(18, -4.4, 6, 8.8);
    } else if (skill === 'mine') {
      AssetFactory.roundRectPath(ctx, 2, -3.0, 25, 6.0, 1.8);
      ctx.fillStyle = '#263238';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = '#FF1744';
      ctx.fillRect(21, -3.2, 3, 6.4);
    } else if (skill === 'reaper') {
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(
          dir * 13.5,
          0,
          7.0,
          dir > 0 ? -Math.PI / 2 : Math.PI / 2,
          dir > 0 ? Math.PI / 2 : -Math.PI / 2,
          false,
        );
        ctx.closePath();
        ctx.fillStyle = '#0D0E12';
        ctx.fill();
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = '#FF1744';
        ctx.stroke();
      }
    } else if (skill === 'emp') {
      // Heavy Obsidian Twin-Pronged Tesla Railgun + Suspended Plasma Core!
      for (const py of [-5.8, 2.4]) {
        AssetFactory.roundRectPath(ctx, 2, py, 26, 3.4, 1.3);
        ctx.fillStyle = '#0D0A22';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#651FFF';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(25.5, 0, 4.8, 0, Math.PI * 2);
      ctx.fillStyle = '#00E5FF';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#0D0A22';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(25.5, 0, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    } else if (skill === 'phantom') {
      // Twin Spectral Scythe-Bladed Soul Cannon!
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(4, sign * 2.2);
        ctx.lineTo(28, sign * 5.8);
        ctx.lineTo(23, sign * 1.4);
        ctx.closePath();
        ctx.fillStyle = '#0E091C';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#E040FB';
        ctx.stroke();
      }
      AssetFactory.roundRectPath(ctx, 2, -2.6, 24, 5.2, 1.8);
      ctx.fillStyle = '#B388FF';
      ctx.fill();
      ctx.strokeStyle = '#0E091C';
      ctx.stroke();
    } else if (skill === 'cryo') {
      // Midnight-Sapphire & Diamond-Spike Cryo Howitzer!
      AssetFactory.roundRectPath(ctx, 2, -4.8, 22, 9.6, 2.2);
      ctx.fillStyle = '#072233';
      ctx.fill();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(20, -7.2);
      ctx.lineTo(30.5, 0);
      ctx.lineTo(20, 7.2);
      ctx.closePath();
      ctx.fillStyle = '#84FFFF';
      ctx.fill();
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = '#072233';
      ctx.stroke();
    } else if (skill === 'barrier') {
      // Wide T-Shaped Obsidian-Emerald Hard-Light Emitter!
      AssetFactory.roundRectPath(ctx, 2, -3.8, 19, 7.6, 1.8);
      ctx.fillStyle = '#0A1F15';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = outline;
      ctx.stroke();
      AssetFactory.roundRectPath(ctx, 19.5, -10.0, 7.2, 20.0, 2.2);
      ctx.fillStyle = '#0A1F15';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#00E676';
      ctx.stroke();
      ctx.fillStyle = '#69F0AE';
      ctx.fillRect(21.8, -7.8, 2.8, 15.6);
    } else if (skill === 'warp') {
      // Chrono-Abyssal Singularity Cannon!
      AssetFactory.roundRectPath(ctx, 2, -4.2, 21, 8.4, 2);
      ctx.fillStyle = '#090614';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#E040FB';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(25.0, 0, 5.4, 0, Math.PI * 2);
      ctx.fillStyle = '#090614';
      ctx.fill();
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = '#80D8FF';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(25.0, 0, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#EA80FC';
      ctx.fill();
    } else {
      AssetFactory.roundRectPath(ctx, 2, -3.6, 25, 7.2, 2.0);
      const barrelGrad = ctx.createLinearGradient(2, -3.6, 2, 3.6);
      barrelGrad.addColorStop(0, palette.highlightHex);
      barrelGrad.addColorStop(0.5, palette.primaryHex);
      barrelGrad.addColorStop(1, palette.shadowHex);
      ctx.fillStyle = barrelGrad;
      ctx.fill();
      ctx.lineWidth = 2.1;
      ctx.strokeStyle = outline;
      ctx.stroke();

      AssetFactory.roundRectPath(ctx, 22.5, -4.3, 5.2, 8.6, 1.5);
      ctx.fillStyle = palette.shadowHex;
      ctx.fill();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }

    // 4. Central Turret Dome / Superhero Helmet
    ctx.beginPath();
    ctx.arc(0, 0, skill ? 10.0 : 9.2, 0, Math.PI * 2);
    const turretGrad = ctx.createRadialGradient(-2.5, -2.5, 1.5, 0, 0, 10.2);
    turretGrad.addColorStop(0, palette.highlightHex);
    turretGrad.addColorStop(0.65, palette.primaryHex);
    turretGrad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = turretGrad;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = outline;
    ctx.stroke();

    if (skill) {
      const visorColorMap: Record<SkillId, string> = {
        laser: '#00E5FF',
        spike: '#FFAB00',
        gatling: '#FFEA00',
        homing: '#FF1744',
        scatter: '#40C4FF',
        mine: '#FF5252',
        flame: '#FF6D00',
        drill: '#FFD600',
        shield: '#1DE9B6',
        reaper: '#FF1744',
        emp: '#00E5FF',
        phantom: '#EA80FC',
        cryo: '#84FFFF',
        barrier: '#69F0AE',
        warp: '#E040FB',
      };
      const visorColor = visorColorMap[skill];

      ctx.beginPath();
      ctx.moveTo(2.5, -7.2);
      ctx.lineTo(8.5, 0);
      ctx.lineTo(2.5, 7.2);
      ctx.lineTo(-1.0, 4.6);
      ctx.lineTo(3.8, 0);
      ctx.lineTo(-1.0, -4.6);
      ctx.closePath();
      ctx.fillStyle = visorColor;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = outline;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(-3.2, 0, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = visorColor;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-1.2, -0.5, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(24,25,27,0.55)';
      ctx.stroke();
    }

    ctx.restore();
    tex.addCanvas(key, canvas);
  }

  private static createScatterPelletTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const r = size * 0.35;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(c - 1, c - 1, 0.5, c, c, r);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.45, '#40C4FF');
    grad.addColorStop(1, '#1565C0');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#0D1B2A';
    ctx.stroke();
    tex.addCanvas(key, canvas);
  }

  private static createDrillProjectileTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    w: number,
    h: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(w, h);
    const cy = h / 2;

    // 1.Glowing plasma thruster flame at rear
    const flameGrad = ctx.createLinearGradient(0, cy, 10, cy);
    flameGrad.addColorStop(0, 'rgba(255, 109, 0, 0)');
    flameGrad.addColorStop(0.5, '#FF9100');
    flameGrad.addColorStop(1, '#FFF59D');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(9, cy - 4.5);
    ctx.lineTo(9, cy + 4.5);
    ctx.closePath();
    ctx.fill();

    // 2. Stabilizer fins + armored drive collar
    ctx.fillStyle = '#263238';
    ctx.strokeStyle = '#111215';
    ctx.lineWidth = 1.4;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(7, cy + sign * 3.5);
      ctx.lineTo(4, cy + sign * (cy - 1));
      ctx.lineTo(13, cy + sign * 5.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    AssetFactory.roundRectPath(ctx, 7, cy - 5.2, 7.5, 10.4, 2);
    ctx.fillStyle = '#37474F';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFAB00';
    ctx.fillRect(9.5, cy - 4.4, 2.4, 8.8);

    // 3. Stepped serrated tungsten-titanium spiral drill head!
    ctx.beginPath();
    ctx.moveTo(14, cy - 7.4);
    ctx.lineTo(20, cy - 5.8);
    ctx.lineTo(20, cy - 7.0);
    ctx.lineTo(27, cy - 4.2);
    ctx.lineTo(27, cy - 5.1);
    ctx.lineTo(w - 1, cy);
    ctx.lineTo(27, cy + 5.1);
    ctx.lineTo(27, cy + 4.2);
    ctx.lineTo(20, cy + 7.0);
    ctx.lineTo(20, cy + 5.8);
    ctx.lineTo(14, cy + 7.4);
    ctx.closePath();

    const headGrad = ctx.createLinearGradient(14, 2, w, h - 2);
    headGrad.addColorStop(0, '#FFFFFF');
    headGrad.addColorStop(0.28, '#ECEFF1');
    headGrad.addColorStop(0.58, '#FFD54F');
    headGrad.addColorStop(0.85, '#FF8F00');
    headGrad.addColorStop(1, '#37474F');
    ctx.fillStyle = headGrad;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#141619';
    ctx.stroke();

    // Glowing molten thermal vein + crisp spiral auger flutes
    ctx.strokeStyle = '#FF3D00';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(15, cy);
    ctx.lineTo(w - 4, cy);
    ctx.stroke();

    ctx.strokeStyle = '#18191B';
    ctx.lineWidth = 1.6;
    for (const [x0, y0, x1, y1] of [
      [16, cy - 6.0, 19.5, cy + 5.6],
      [21.5, cy - 5.0, 24.8, cy + 4.2],
      [27.2, cy - 3.4, 30.2, cy + 2.8],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // White-hot diamond drill point
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(w - 3.2, cy, 1.8, 0, Math.PI * 2);
    ctx.fill();

    tex.addCanvas(key, canvas);
  }

  private static createFlameProjectileTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    w: number,
    h: number,
    variantSeed: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(w, h);
    const cx = w * 0.52;
    const cy = h * 0.5;

    ctx.save();
    const asym = (variantSeed - 1) * 2.5;

    // 1. High-contrast smoky crimson-red outer thermal envelope (vivid on light #F3F3F1 floor!)
    const envGrad = ctx.createRadialGradient(cx + 3, cy, 1.5, cx - 2, cy, w * 0.48);
    envGrad.addColorStop(0, 'rgba(255, 253, 224, 1)');
    envGrad.addColorStop(0.24, 'rgba(255, 214, 0, 0.96)');
    envGrad.addColorStop(0.52, 'rgba(255, 90, 0, 0.9)');
    envGrad.addColorStop(0.78, 'rgba(198, 28, 12, 0.62)');
    envGrad.addColorStop(0.92, 'rgba(90, 18, 10, 0.24)');
    envGrad.addColorStop(1, 'rgba(60, 15, 10, 0)');
    ctx.fillStyle = envGrad;

    ctx.beginPath();
    ctx.moveTo(2, cy + asym * 0.4);
    ctx.bezierCurveTo(
      w * 0.24,
      cy - h * 0.46 + asym,
      w * 0.72,
      cy - h * 0.49 - asym * 0.4,
      w - 2,
      cy + asym * 0.28,
    );
    ctx.bezierCurveTo(
      w * 0.72,
      cy + h * 0.49 + asym * 0.4,
      w * 0.24,
      cy + h * 0.46 - asym,
      2,
      cy + asym * 0.4,
    );
    ctx.closePath();
    ctx.fill();

    // 2. Organic flickering internal orange-gold & incandescent white-yellow flame tongues
    const tongueOffsets = [
      { ox: 3.5, oy: -3.8 + asym * 0.45, rx: w * 0.26, ry: h * 0.19 },
      { ox: -2.0, oy: 3.8 - asym * 0.45, rx: w * 0.27, ry: h * 0.2 },
      { ox: 6.5, oy: 0.6 * asym, rx: w * 0.2, ry: h * 0.14 },
    ];
    for (const t of tongueOffsets) {
      const lx = cx + t.ox;
      const ly = cy + t.oy;
      const tGrad = ctx.createRadialGradient(lx, ly, 0.5, lx, ly, t.rx);
      tGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      tGrad.addColorStop(0.38, 'rgba(255, 234, 0, 0.85)');
      tGrad.addColorStop(0.75, 'rgba(255, 82, 0, 0.45)');
      tGrad.addColorStop(1, 'rgba(213, 0, 0, 0)');
      ctx.fillStyle = tGrad;
      ctx.beginPath();
      ctx.ellipse(lx, ly, t.rx, t.ry, asym * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    tex.addCanvas(key, canvas);
  }

  private static createMineTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const r = size * 0.36;

    ctx.strokeStyle = '#18191B';
    ctx.fillStyle = '#546E7A';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a);
      ctx.fillRect(r - 2, -2.2, 4.8, 4.4);
      ctx.strokeRect(r - 2, -2.2, 4.8, 4.4);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fillStyle = '#263238';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#101214';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c, c, r * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = '#FF1744';
    ctx.fill();
    tex.addCanvas(key, canvas);
  }

  private static createWoodenCrateTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const pad = 4;
    const box = size - pad * 2;

    AssetFactory.roundRectPath(ctx, pad + 2, pad + 3, box, box, 5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.fill();

    AssetFactory.roundRectPath(ctx, pad, pad, box, box, 5);
    const woodGrad = ctx.createLinearGradient(pad, pad, pad + box, pad + box);
    woodGrad.addColorStop(0, '#DDA15E');
    woodGrad.addColorStop(0.5, '#BC6C25');
    woodGrad.addColorStop(1, '#8C4A15');
    ctx.fillStyle = woodGrad;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(62, 32, 8, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(pad, pad + box * 0.33);
    ctx.lineTo(pad + box, pad + box * 0.33);
    ctx.moveTo(pad, pad + box * 0.67);
    ctx.lineTo(pad + box, pad + box * 0.67);
    ctx.stroke();

    ctx.strokeStyle = '#E6B37A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pad + 3, pad + 3);
    ctx.lineTo(pad + box - 3, pad + box - 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(62, 32, 8, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(pad + 4, pad + 4, box - 8, box - 8);
    ctx.restore();

    AssetFactory.roundRectPath(ctx, pad, pad, box, box, 5);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#2A180B';
    ctx.stroke();

    const bSize = 7;
    const corners = [
      [pad, pad],
      [pad + box - bSize, pad],
      [pad, pad + box - bSize],
      [pad + box - bSize, pad + box - bSize],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = '#455A64';
      ctx.fillRect(cx, cy, bSize, bSize);
      ctx.strokeStyle = '#18191B';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(cx, cy, bSize, bSize);
      ctx.fillStyle = '#CFD8DC';
      ctx.beginPath();
      ctx.arc(cx + bSize / 2, cy + bSize / 2, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = "900 19px 'Segoe UI', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#2A180B';
    ctx.strokeText('?', size / 2, size / 2 + 1);
    ctx.fillStyle = '#FFF8E1';
    ctx.fillText('?', size / 2, size / 2 + 1);

    tex.addCanvas(key, canvas);
  }

  private static createGatlingBulletTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const r = size * 0.34;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(c - 1, c - 1, 0.5, c, c, r);
    grad.addColorStop(0, '#FFF59D');
    grad.addColorStop(0.5, '#FB8C00');
    grad.addColorStop(1, '#263238');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#111215';
    ctx.stroke();
    tex.addCanvas(key, canvas);
  }

  private static createSpikeBallTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const coreR = size * 0.28;
    const spikeR = size * 0.46;

    ctx.fillStyle = '#CFD8DC';
    ctx.strokeStyle = '#111215';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a - 0.28) * coreR, c + Math.sin(a - 0.28) * coreR);
      ctx.lineTo(c + Math.cos(a) * spikeR, c + Math.sin(a) * spikeR);
      ctx.lineTo(c + Math.cos(a + 0.28) * coreR, c + Math.sin(a + 0.28) * coreR);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(c, c, coreR, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(c - 2, c - 2, 0.5, c, c, coreR);
    grad.addColorStop(0, '#78909C');
    grad.addColorStop(0.5, '#263238');
    grad.addColorStop(1, '#101214');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0D0E10';
    ctx.stroke();

    tex.addCanvas(key, canvas);
  }

  private static createSpikeShardTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    w: number,
    h: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(w, h);
    ctx.beginPath();
    ctx.moveTo(w - 1, h / 2);
    ctx.lineTo(4, 1.5);
    ctx.lineTo(1, h / 2);
    ctx.lineTo(4, h - 1.5);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#546E7A');
    grad.addColorStop(0.6, '#ECEFF1');
    grad.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#18191B';
    ctx.stroke();
    tex.addCanvas(key, canvas);
  }

  private static createMissileTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    w: number,
    h: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(w, h);
    const cy = h / 2;

    ctx.fillStyle = '#D32F2F';
    ctx.strokeStyle = '#18191B';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(3, cy - 2);
    ctx.lineTo(1, 1);
    ctx.lineTo(9, cy - 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(3, cy + 2);
    ctx.lineTo(1, h - 1);
    ctx.lineTo(9, cy + 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    AssetFactory.roundRectPath(ctx, 4, cy - 4, 15, 8, 2.5);
    ctx.fillStyle = '#ECEFF1';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(17, cy - 4);
    ctx.quadraticCurveTo(w - 1, cy, 17, cy + 4);
    ctx.closePath();
    ctx.fillStyle = '#E53935';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(13, cy, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = '#FFEA00';
    ctx.fill();

    tex.addCanvas(key, canvas);
  }

  private static createGroundSpikeTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;

    ctx.beginPath();
    ctx.arc(c, c + 1, size * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a - 0.5) * 3.2, c + Math.sin(a - 0.5) * 3.2);
      ctx.lineTo(c + Math.cos(a) * (size * 0.45), c + Math.sin(a) * (size * 0.45));
      ctx.lineTo(c + Math.cos(a + 0.5) * 3.2, c + Math.sin(a + 0.5) * 3.2);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? '#CFD8DC' : '#90A4AE';
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = '#18191B';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(c, c, 3.0, 0, Math.PI * 2);
    ctx.fillStyle = '#D32F2F';
    ctx.fill();
    ctx.stroke();

    tex.addCanvas(key, canvas);
  }

  private static createStarSparkTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const outer = size * 0.48;
    const inner = size * 0.14;

    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? outer : inner;
      const px = c + Math.cos(a) * r;
      const py = c + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    tex.addCanvas(key, canvas);
  }

  private static createWoodPlankTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    w: number,
    h: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(w, h);
    ctx.fillStyle = '#C88746';
    ctx.fillRect(1, 1, w - 2, h - 2);
    ctx.strokeStyle = '#3E2008';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    tex.addCanvas(key, canvas);
  }

  private static createSkillEmblemTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    skill: SkillId,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const desc = SKILL_DESCRIPTORS.find((d) => d.id === skill)!;

    AssetFactory.roundRectPath(ctx, 3, 3, size - 6, size - 6, 9);
    ctx.fillStyle = desc.accentHex;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#18191B';
    ctx.stroke();

    ctx.save();
    ctx.translate(c, c);
    if (skill === 'laser') {
      ctx.strokeStyle = '#E0F7FA';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-13, 8);
      ctx.quadraticCurveTo(-2, 6, 13, -9);
      ctx.stroke();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    } else if (skill === 'spike') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.25) * 6, Math.sin(a - 0.25) * 6);
        ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
        ctx.lineTo(Math.cos(a + 0.25) * 6, Math.sin(a + 0.25) * 6);
        ctx.closePath();
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#263238';
      ctx.fill();
    } else if (skill === 'gatling') {
      ctx.fillStyle = '#FFF8E1';
      for (const oy of [-7, 0, 7]) {
        AssetFactory.roundRectPath(ctx, -11, oy - 2.2, 22, 4.4, 2);
        ctx.fill();
      }
    } else if (skill === 'homing') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(14, 0);
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#FFEA00';
      ctx.fill();
    } else if (skill === 'scatter') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.4;
      for (const a of [-0.45, 0, 0.45]) {
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-10 + Math.cos(a) * 22, Math.sin(a) * 22);
        ctx.stroke();
      }
    } else if (skill === 'mine') {
      ctx.fillStyle = '#263238';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#FF1744';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (skill === 'flame') {
      ctx.fillStyle = '#FFEA00';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(12, 2, 0, 13);
      ctx.quadraticCurveTo(-12, 2, 0, -14);
      ctx.fill();
    } else if (skill === 'drill') {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#18191B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -9.5);
      ctx.lineTo(-10, 9.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#FF6D00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, -6);
      ctx.lineTo(-2, 5.5);
      ctx.moveTo(1, -4);
      ctx.lineTo(4.5, 3.5);
      ctx.stroke();
    } else if (skill === 'shield') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * 12.5;
        const py = Math.sin(a) * 12.5;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (skill === 'reaper') {
      ctx.fillStyle = '#0D0E12';
      ctx.beginPath();
      ctx.arc(0, 0, 14.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FF1744';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, -0.85, 1.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 11, Math.PI - 0.85, Math.PI + 1.45);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (skill === 'emp') {
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#FFEA00';
      ctx.beginPath();
      ctx.moveTo(2, -13);
      ctx.lineTo(-7, 1);
      ctx.lineTo(0, 1);
      ctx.lineTo(-3, 13);
      ctx.lineTo(8, -2);
      ctx.lineTo(1, -2);
      ctx.closePath();
      ctx.fill();
    } else if (skill === 'phantom') {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(0, -2, 10.5, Math.PI, 0, false);
      ctx.lineTo(10.5, 11);
      ctx.lineTo(5, 7.5);
      ctx.lineTo(0, 11.5);
      ctx.lineTo(-5, 7.5);
      ctx.lineTo(-10.5, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#311B92';
      ctx.beginPath();
      ctx.arc(-3.6, -2.5, 2.1, 0, Math.PI * 2);
      ctx.arc(3.6, -2.5, 2.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (skill === 'cryo') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.6;
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * -13, Math.sin(a) * -13);
        ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
        ctx.stroke();
      }
      ctx.fillStyle = '#84FFFF';
      ctx.beginPath();
      ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (skill === 'barrier') {
      ctx.fillStyle = '#B9F6CA';
      AssetFactory.roundRectPath(ctx, -13, -7, 26, 14, 3);
      ctx.fill();
      ctx.strokeStyle = '#18191B';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = '#1B5E20';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(13, 0);
      ctx.moveTo(-3, -7);
      ctx.lineTo(-3, 0);
      ctx.moveTo(4, 0);
      ctx.lineTo(4, 7);
      ctx.stroke();
    } else if (skill === 'warp') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0.3, Math.PI * 1.8);
      ctx.stroke();
      ctx.strokeStyle = '#80D8FF';
      ctx.beginPath();
      ctx.arc(0, 0, 6.8, Math.PI * 0.8, Math.PI * 2.3);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    tex.addCanvas(key, canvas);
  }

  private static createEmpOrbTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const r = size * 0.42;

    // 1. Dark Obsidian Contrast Casing + 4 Sharp Tesla Prongs
    ctx.fillStyle = '#0A0818';
    ctx.strokeStyle = '#651FFF';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a - 0.3) * (r * 0.62), c + Math.sin(a - 0.3) * (r * 0.62));
      ctx.lineTo(c + Math.cos(a) * (r * 1.12), c + Math.sin(a) * (r * 1.12));
      ctx.lineTo(c + Math.cos(a + 0.3) * (r * 0.62), c + Math.sin(a + 0.3) * (r * 0.62));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(c, c, r * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = '#0C091E';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#00E5FF';
    ctx.stroke();

    // 2. Incandescent Plasma Core + Gold Lightning Rune
    const glow = ctx.createRadialGradient(c, c, 0.8, c, c, r * 0.65);
    glow.addColorStop(0, '#FFFFFF');
    glow.addColorStop(0.5, '#00E5FF');
    glow.addColorStop(1, '#651FFF');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c, c, r * 0.56, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FFEA00';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(c + 1, c - 5);
    ctx.lineTo(c - 3.5, c + 0.5);
    ctx.lineTo(c + 1.5, c + 0.5);
    ctx.lineTo(c - 1, c + 5);
    ctx.stroke();

    tex.addCanvas(key, canvas);
  }

  private static createCryoOrbTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const outerR = size * 0.46;
    const innerR = size * 0.24;

    // 8-Pointed Midnight-Sapphire & Diamond-Cyan Glacial Star!
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const px = c + Math.cos(a) * r;
      const py = c + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const grad = ctx.createRadialGradient(c, c, 1, c, c, outerR);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.45, '#84FFFF');
    grad.addColorStop(0.82, '#00838F');
    grad.addColorStop(1, '#062130');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = '#062130';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c, c, innerR * 0.65, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    tex.addCanvas(key, canvas);
  }

  private static createWarpBeaconTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const r = size * 0.44;

    // 1. Pitch-black Event Horizon Core Disc (high contrast on #F3F3F1 floor!)
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fillStyle = '#070412';
    ctx.fill();
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#E040FB';
    ctx.stroke();

    // 2. 8-Pointed Stargate Chrono-Star
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 1.9;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * (r * 0.36), c + Math.sin(a) * (r * 0.36));
      ctx.lineTo(c + Math.cos(a) * (r * 0.88), c + Math.sin(a) * (r * 0.88));
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(c, c, r * 0.46, 0, Math.PI * 2);
    ctx.strokeStyle = '#EA80FC';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c, c, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    tex.addCanvas(key, canvas);
  }

  private static createTankShadowTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    width: number,
    height: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(width, height);
    const cx = width * 0.44;
    const cy = height * 0.5;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    AssetFactory.roundRectPath(ctx, -20, -16.5, 40, 33, 8);
    ctx.fill();
    AssetFactory.roundRectPath(ctx, 4, -4.5, 24, 9, 3);
    ctx.fill();
    ctx.restore();

    tex.addCanvas(key, canvas);
  }

  private static createShellTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const r = size * 0.36;

    ctx.beginPath();
    ctx.arc(c + 0.6, c + 0.8, r + 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(c - r * 0.32, c - r * 0.32, 0.5, c, c, r);
    grad.addColorStop(0, '#595E66');
    grad.addColorStop(0.45, '#22252A');
    grad.addColorStop(1, '#111215');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#0D0E10';
    ctx.stroke();

    tex.addCanvas(key, canvas);
  }

  private static createTreadDecalTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    width: number,
    height: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(width, height);
    ctx.fillStyle = 'rgba(40, 42, 46, 0.11)';
    ctx.fillRect(2, 1, 5, 4);
    ctx.fillRect(2, height - 5, 5, 4);
    tex.addCanvas(key, canvas);
  }

  private static createScorchDecalTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 2, c, c, size * 0.45);
    grad.addColorStop(0, 'rgba(22, 23, 26, 0.46)');
    grad.addColorStop(0.45, 'rgba(42, 43, 48, 0.22)');
    grad.addColorStop(1, 'rgba(45, 46, 50, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(24, 25, 29, 0.22)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      const r1 = 5 + (i % 3) * 2;
      const r2 = 18 + ((i * 7) % 14);
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
      ctx.stroke();
    }

    tex.addCanvas(key, canvas);
  }

  private static createSoftCircleTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
    color: string,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const c = size / 2;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    tex.addCanvas(key, canvas);
  }

  private static createShardTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    ctx.beginPath();
    ctx.moveTo(2, 3);
    ctx.lineTo(size - 2, 2);
    ctx.lineTo(size - 3, size - 3);
    ctx.lineTo(3, size - 2);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = UI_COLORS.inkDarkHex;
    ctx.stroke();
    tex.addCanvas(key, canvas);
  }

  private static createTntBarrelTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    const pad = 4;
    const w = size - pad * 2;
    const h = size - pad * 2;

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    AssetFactory.roundRectPath(ctx, pad + 1.5, pad + 2.5, w, h, 7);
    ctx.fill();

    // Crimson steel / hazard drum body
    const bodyGrad = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
    bodyGrad.addColorStop(0, '#D32F2F');
    bodyGrad.addColorStop(0.55, '#B71C1C');
    bodyGrad.addColorStop(1, '#7F0000');
    ctx.fillStyle = bodyGrad;
    AssetFactory.roundRectPath(ctx, pad, pad, w, h, 7);
    ctx.fill();

    // Dark iron reinforcement bands
    ctx.fillStyle = '#263238';
    ctx.fillRect(pad + 1, pad + 5, w - 2, 4);
    ctx.fillRect(pad + 1, pad + h - 9, w - 2, 4);

    // Center high-contrast yellow/dark TNT band
    ctx.fillStyle = '#212121';
    ctx.fillRect(pad + 2, size / 2 - 7, w - 4, 14);
    ctx.strokeStyle = '#FFB300';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(pad + 2.5, size / 2 - 6.5, w - 5, 13);

    // Corner rivets
    ctx.fillStyle = '#ECEFF1';
    for (const [rx, ry] of [
      [pad + 5, pad + 5],
      [pad + w - 5, pad + 5],
      [pad + 5, pad + h - 5],
      [pad + w - 5, pad + h - 5],
    ]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp "TNT" stencil
    ctx.font = "900 9.5px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFEA00';
    ctx.fillText('TNT', size / 2, size / 2 + 0.5);

    // Outer outline
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#18191B';
    AssetFactory.roundRectPath(ctx, pad, pad, w, h, 7);
    ctx.stroke();

    tex.addCanvas(key, canvas);
  }

  private static createCrownTexture(
    tex: Phaser.Textures.TextureManager,
    key: string,
    size: number,
  ): void {
    const { canvas, ctx } = AssetFactory.makeCanvas(size, size);
    ctx.beginPath();
    ctx.moveTo(4, 24);
    ctx.lineTo(6, 10);
    ctx.lineTo(12, 16);
    ctx.lineTo(16, 7);
    ctx.lineTo(20, 16);
    ctx.lineTo(26, 10);
    ctx.lineTo(28, 24);
    ctx.closePath();
    ctx.fillStyle = '#FFD54F';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#1D1F22';
    ctx.stroke();
    tex.addCanvas(key, canvas);
  }

  private static roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

import Phaser from 'phaser';
import { POWERUP_CONFIG } from '../config/constants';
import type { Tank } from '../entities/Tank';
import {
  castFlashlightRaySamples,
  castOmnidirectionalLightPolygon,
  coalesceProjectileLightSources,
  type TntBarrelState,
} from './BattleModeSim';
import {
  computeReaperBlades,
  type CryoZoneState,
  type EnergyBarrierState,
  type MysteryCrateState,
  type WarpBeaconState,
} from './PowerUpSim';
import type {
  BuiltArenaLayout,
  ProjectileKinematics,
  ProjectileVariant,
} from '../types/gameTypes';

interface TransientFlareEvent {
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
  coreRgb: string;
  midRgb: string;
  raycasted: boolean;
}

interface PhosphorTrailCrumb {
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
  rgb: string;
}

interface TransientBeamFlash {
  points: Array<{ x: number; y: number }>;
  age: number;
  duration: number;
}

interface FlarePalette {
  coreRgb: string;
  midRgb: string;
  edgeRgb: string;
  glintHex: number;
  trailRgb: string;
  radiusCells: number;
}

const NIGHT_VOLUMETRIC_FRAG_SHADER = `
precision mediump float;

uniform float time;
uniform vec2 resolution;
uniform vec4 uBeam0;
uniform vec4 uBeam1;
uniform float uBeamCount;
uniform vec4 uFlare0;
uniform vec4 uFlare1;
uniform vec4 uFlare2;
uniform vec4 uFlare3;
uniform vec4 uFlare4;
uniform vec4 uFlare5;
uniform float uFlareCount;

varying vec2 fragCoord;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float dustLayer(vec2 uv, float scale, vec2 drift) {
  vec2 gv = uv * scale + drift;
  vec2 id = floor(gv);
  vec2 f = fract(gv) - 0.5;
  float h = hash21(id);
  vec2 offset = vec2(fract(h * 13.7) - 0.5, fract(h * 29.3) - 0.5) * 0.56;
  float d = length(f - offset);
  float size = 0.038 + 0.055 * fract(h * 7.1);
  float twinkle = 0.55 + 0.45 * sin(time * (2.2 + h * 3.5) + h * 18.0);
  return smoothstep(size, 0.0, d) * twinkle * step(0.58, h);
}

vec3 evalBeam(vec4 b, vec2 px, float dust) {
  vec2 toFrag = px - b.xy;
  float dist = length(toFrag);
  float maxR = max(30.0, b.w);
  if (dist >= maxR || dist <= 1.0) return vec3(0.0);
  vec2 dir = vec2(cos(b.z), sin(b.z));
  float cosA = dot(toFrag / dist, dir);
  if (cosA <= 0.848) return vec3(0.0);
  float angFactor = smoothstep(0.848, 0.996, cosA);
  float lin = max(0.0001, 1.0 - dist / maxR);
  float distFactor = lin * sqrt(lin);
  float angleVal = atan(toFrag.y, toFrag.x) - b.z;
  float rays = 0.8 + 0.2 * sin(angleVal * 34.0 + sin(time * 1.4) * 0.5);
  float shaft = angFactor * distFactor * rays;
  return vec3(1.0, 0.93, 0.76) * (shaft * 0.18 + dust * shaft * 0.52);
}

vec3 evalFlare(vec4 fl, vec2 px, float dust, float seed) {
  float d = length(px - fl.xy);
  float r = max(16.0, fl.z);
  if (d >= r) return vec3(0.0);
  float lin = max(0.0, 1.0 - d / r);
  float falloff = lin * lin;
  float flicker = 0.92 + 0.08 * sin(time * 20.0 + seed);
  vec3 flareTint = fl.w > 0.5 ? vec3(0.55, 0.9, 1.0) : vec3(1.0, 0.76, 0.38);
  return flareTint * (falloff * 0.065 * flicker + dust * falloff * 0.18);
}

void main() {
  // Convert Phaser bottom-up fragCoord to top-down arena pixel coordinates
  vec2 px = vec2(fragCoord.x, resolution.y - fragCoord.y);
  vec2 uv = px / max(resolution, vec2(1.0));

  float dust = dustLayer(uv, 24.0, vec2(time * 0.035, -time * 0.022))
             + dustLayer(uv, 42.0, vec2(-time * 0.02, time * 0.028)) * 0.72;

  vec3 accum = vec3(0.0);

  if (uBeamCount > 0.5) accum += evalBeam(uBeam0, px, dust);
  if (uBeamCount > 1.5) accum += evalBeam(uBeam1, px, dust);

  if (uFlareCount > 0.5) accum += evalFlare(uFlare0, px, dust, 0.0);
  if (uFlareCount > 1.5) accum += evalFlare(uFlare1, px, dust, 2.1);
  if (uFlareCount > 2.5) accum += evalFlare(uFlare2, px, dust, 4.2);
  if (uFlareCount > 3.5) accum += evalFlare(uFlare3, px, dust, 6.3);
  if (uFlareCount > 4.5) accum += evalFlare(uFlare4, px, dust, 8.4);
  if (uFlareCount > 5.5) accum += evalFlare(uFlare5, px, dust, 10.5);

  float ign = fract(52.9829189 * fract(dot(fragCoord.xy, vec2(0.06711056, 0.00583715))));
  accum += (ign - 0.5) * (1.2 / 255.0) * step(0.002, accum.r + accum.g + accum.b);

  // Premultiplied-alpha additive output (alpha = 0.0 => 1.0 * accum + 1.0 * dst = dst + accum)
  gl_FragColor = vec4(clamp(accum, 0.0, 1.0), 0.0);
}
`;

function getFlarePalette(variant: ProjectileVariant): FlarePalette {
  switch (variant) {
    case 'drill':
      return {
        coreRgb: '220, 248, 255',
        midRgb: '56, 188, 235',
        edgeRgb: '14, 52, 84',
        glintHex: 0x80d8ff,
        trailRgb: '64, 196, 255',
        radiusCells: 2.75,
      };
    case 'homing_missile':
      return {
        coreRgb: '255, 236, 200',
        midRgb: '245, 112, 48',
        edgeRgb: '78, 22, 12',
        glintHex: 0xff6e40,
        trailRgb: '255, 112, 67',
        radiusCells: 3.1,
      };
    case 'flame':
      return {
        coreRgb: '255, 218, 150',
        midRgb: '235, 112, 28',
        edgeRgb: '68, 24, 6',
        glintHex: 0xffab40,
        trailRgb: '230, 115, 16',
        radiusCells: 2.05,
      };
    case 'gatling':
      return {
        coreRgb: '255, 240, 192',
        midRgb: '238, 172, 58',
        edgeRgb: '58, 38, 12',
        glintHex: 0xffe082,
        trailRgb: '240, 184, 42',
        radiusCells: 2.05,
      };
    case 'scatter':
      return {
        coreRgb: '255, 238, 190',
        midRgb: '238, 160, 56',
        edgeRgb: '60, 34, 10',
        glintHex: 0xffd54f,
        trailRgb: '240, 170, 65',
        radiusCells: 2.15,
      };
    case 'spike_ball':
    case 'spike_shard':
      return {
        coreRgb: '255, 228, 190',
        midRgb: '240, 98, 58',
        edgeRgb: '66, 18, 16',
        glintHex: 0xff8a65,
        trailRgb: '240, 104, 60',
        radiusCells: variant === 'spike_ball' ? 2.75 : 1.85,
      };
    case 'emp_orb':
      return {
        coreRgb: '224, 247, 255',
        midRgb: '112, 82, 255',
        edgeRgb: '34, 16, 86',
        glintHex: 0x00e5ff,
        trailRgb: '101, 31, 255',
        radiusCells: 2.9,
      };
    case 'cryo_orb':
      return {
        coreRgb: '232, 252, 255',
        midRgb: '64, 212, 238',
        edgeRgb: '12, 54, 72',
        glintHex: 0x84ffff,
        trailRgb: '0, 229, 255',
        radiusCells: 2.65,
      };
    default:
      // Standard Tank Shell -> Soft Warm Magnesium Signal Flare (`Đạn Pháo Sáng Dịu Mắt`)
      return {
        coreRgb: '255, 242, 204',
        midRgb: '238, 166, 62',
        edgeRgb: '56, 38, 16',
        glintHex: 0xffe082,
        trailRgb: '235, 176, 68',
        radiusCells: 2.65,
      };
  }
}

/**
 * 3-Stage Physically-Grounded Night Optics & Signal-Flare Illumination Engine:
 *
 * 1. Stage 1 (`depth: 25.5`, WebGL GLSL `Phaser.GameObjects.Shader`, `ADD` blend):
 *    - Real-time GPU fragment shader generating volumetric searchlight micro-shafts,
 *      drifting 2-layer Tyndall dust motes, and pyrotechnic flare shimmer — placed BELOW the
 *      `MULTIPLY` lightmap so every volumetric ray & dust speck is automatically occluded by walls!
 * 2. Stage 2 (`depth: 26.0`, `0.55x` Bilinear-Upsampled RGB Lightmap `CanvasTexture`, `MULTIPLY` blend):
 *    - Ambient `#000000` (`RGB(0,0,0)` -> `100.0%` pitch-black where unlit; zero path bleed-through!).
 *    - Multi-lobe cosine-attenuated Twin Xenon Tank Headlamps with soft penumbra blur (`blur(3.2px)`),
 *      warm-to-cool twilight color temperature shift, and 3D illuminated wall-face bounce highlights.
 *    - 360° Wall-Occluded Signal-Flare Projectiles (`Đạn Pháo Sáng`) + Phosphor Breadcrumb Trails (`0.85s`)
 *      + Dying Magnesium Flare Embers (`1.2s`) so players can fire down pitch-black corridors to scout the road!
 * 3. Stage 3 (`depth: 26.5`, Crisp Emissive Optical Glints `Graphics`, `ADD` blend):
 *    - Overexposed Twin Front Xenon Headlamp bulbs + subtle red rear taillights on viewer tanks,
 *      plus blazing Signal-Flare cores & 4-point optical starbursts on flying shells!
 */
export class NightVisionSystem {
  private static readonly PAD = 16;
  private static readonly LIGHTMAP_SCALE = 0.28;
  private static shaderCounter = 0;

  private readonly scene: Phaser.Scene;
  private readonly arena: BuiltArenaLayout;
  private readonly texKey: string;
  private readonly canvasTex: Phaser.Textures.CanvasTexture;
  private readonly lightmapImage: Phaser.GameObjects.Image;
  private readonly glintGraphics: Phaser.GameObjects.Graphics;
  private volumetricShader: Phaser.GameObjects.Shader | null = null;

  private enabled = false;
  private readonly flareEvents: TransientFlareEvent[] = [];
  private readonly trailCrumbs: PhosphorTrailCrumb[] = [];
  private readonly beamFlashes: TransientBeamFlash[] = [];
  private pulseClock = 0;
  private crumbEmitAccum = 0;

  constructor(scene: Phaser.Scene, arena: BuiltArenaLayout, enabled: boolean) {
    this.scene = scene;
    this.arena = arena;
    this.enabled = enabled;

    const pad = NightVisionSystem.PAD;
    const worldW = Math.max(32, Math.ceil(arena.width + pad * 2));
    const worldH = Math.max(32, Math.ceil(arena.height + pad * 2));
    const lmW = Math.max(32, Math.round(worldW * NightVisionSystem.LIGHTMAP_SCALE));
    const lmH = Math.max(32, Math.round(worldH * NightVisionSystem.LIGHTMAP_SCALE));

    const uid = `${Date.now()}_${++NightVisionSystem.shaderCounter}`;
    this.texKey = `night_lm_rt_${uid}`;
    const created = scene.textures.createCanvas(this.texKey, lmW, lmH);
    if (!created) {
      throw new Error('Failed to allocate NightVisionSystem Lightmap CanvasTexture');
    }
    created.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.canvasTex = created;

    // Stage 1: Real-time WebGL GLSL Volumetric Dust & Searchlight God-Ray Shader (`depth: 25.5`, premultiplied additive)
    if (scene.game.renderer.type === Phaser.WEBGL) {
      try {
        const shaderKey = `night_vol_glsl_${uid}`;
        const zero4 = () => ({ x: 0, y: 0, z: 0, w: 0 });
        const baseShader = new Phaser.Display.BaseShader(
          shaderKey,
          NIGHT_VOLUMETRIC_FRAG_SHADER,
          undefined,
          {
            uBeam0: { type: '4f', value: zero4() },
            uBeam1: { type: '4f', value: zero4() },
            uBeamCount: { type: '1f', value: 0 },
            uFlare0: { type: '4f', value: zero4() },
            uFlare1: { type: '4f', value: zero4() },
            uFlare2: { type: '4f', value: zero4() },
            uFlare3: { type: '4f', value: zero4() },
            uFlare4: { type: '4f', value: zero4() },
            uFlare5: { type: '4f', value: zero4() },
            uFlareCount: { type: '1f', value: 0 },
          },
        );
        const sh = scene.add
          .shader(baseShader, arena.originX - pad, arena.originY - pad, worldW, worldH)
          .setOrigin(0, 0)
          .setDepth(25.5)
          .setVisible(enabled);
        if ((sh as unknown as { program?: unknown }).program) {
          this.volumetricShader = sh;
        } else {
          sh.destroy();
          this.volumetricShader = null;
        }
      } catch {
        this.volumetricShader = null;
      }
    }

    // Stage 2: Wall-Occluded Soft-Penumbra RGB Lightmap (`depth: 26.0`, `MULTIPLY`)
    this.lightmapImage = scene.add
      .image(arena.originX - pad, arena.originY - pad, this.texKey)
      .setOrigin(0, 0)
      .setDisplaySize(worldW, worldH)
      .setDepth(26)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setVisible(enabled);

    // Stage 3: Crisp Twin-Headlamp Bulbs & Signal-Flare Starburst Optics (`depth: 26.5`, `ADD`)
    this.glintGraphics = scene.add
      .graphics()
      .setDepth(26.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(enabled);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isShaderActive(): boolean {
    return Boolean(this.volumetricShader);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.lightmapImage.setVisible(enabled);
    this.glintGraphics.setVisible(enabled);
    this.volumetricShader?.setVisible(enabled);
    if (!enabled) {
      this.flareEvents.length = 0;
      this.trailCrumbs.length = 0;
      this.beamFlashes.length = 0;
      this.glintGraphics.clear();
    }
  }

  triggerMuzzleFlashLight(worldX: number, worldY: number, isHeavy = false): void {
    if (!this.enabled) return;
    this.flareEvents.push({
      x: worldX,
      y: worldY,
      radius: (isHeavy ? 175 : 122) * this.arena.scaleRatio,
      age: 0,
      duration: isHeavy ? 0.22 : 0.13,
      coreRgb: '255, 250, 220',
      midRgb: '255, 190, 84',
      raycasted: true,
    });
  }

  triggerFlareBounceFlash(worldX: number, worldY: number): void {
    if (!this.enabled) return;
    if (this.flareEvents.length > 20) return;
    this.flareEvents.push({
      x: worldX,
      y: worldY,
      radius: 96 * this.arena.scaleRatio,
      age: 0,
      duration: 0.3,
      coreRgb: '255, 238, 190',
      midRgb: '230, 152, 48',
      raycasted: true,
    });
  }

  triggerFlareExpireEmber(worldX: number, worldY: number): void {
    if (!this.enabled) return;
    if (this.flareEvents.length > 24) this.flareEvents.shift();
    this.flareEvents.push({
      x: worldX,
      y: worldY,
      radius: 108 * this.arena.scaleRatio,
      age: 0,
      duration: 0.85,
      coreRgb: '255, 228, 168',
      midRgb: '225, 128, 38',
      raycasted: true,
    });
  }

  triggerExplosionFlash(worldX: number, worldY: number, radius = 235): void {
    if (!this.enabled) return;
    this.flareEvents.push({
      x: worldX,
      y: worldY,
      radius: radius * this.arena.scaleRatio,
      age: 0,
      duration: 0.45,
      coreRgb: '255, 250, 224',
      midRgb: '255, 128, 42',
      raycasted: false,
    });
  }

  triggerLaserFlashCorridor(points: Array<{ x: number; y: number }>): void {
    if (!this.enabled || points.length < 2) return;
    this.beamFlashes.push({
      points: points.map((p) => ({ x: p.x, y: p.y })),
      age: 0,
      duration: 0.78,
    });
  }

  updateAndRender(
    dt: number,
    viewerTanks: readonly Tank[],
    projectiles: readonly ProjectileKinematics[],
    crates: readonly MysteryCrateState[],
    barrels: readonly TntBarrelState[],
    allTanks: readonly Tank[] = viewerTanks,
    extraWorldGlows?: {
      cryoZones: readonly CryoZoneState[];
      barriers: readonly EnergyBarrierState[];
      warpBeacons: readonly WarpBeaconState[];
    },
  ): void {
    if (!this.enabled) {
      if (this.lightmapImage.visible) {
        this.lightmapImage.setVisible(false);
        this.glintGraphics.setVisible(false);
        this.volumetricShader?.setVisible(false);
      }
      return;
    }
    this.lightmapImage.setVisible(true);
    this.glintGraphics.setVisible(true);
    this.volumetricShader?.setVisible(true);
    this.pulseClock += dt;

    for (let i = this.flareEvents.length - 1; i >= 0; i--) {
      this.flareEvents[i].age += dt;
      if (this.flareEvents[i].age >= this.flareEvents[i].duration) {
        this.flareEvents.splice(i, 1);
      }
    }
    for (let i = this.trailCrumbs.length - 1; i >= 0; i--) {
      this.trailCrumbs[i].age += dt;
      if (this.trailCrumbs[i].age >= this.trailCrumbs[i].duration) {
        this.trailCrumbs.splice(i, 1);
      }
    }
    for (let i = this.beamFlashes.length - 1; i >= 0; i--) {
      this.beamFlashes[i].age += dt;
      if (this.beamFlashes[i].age >= this.beamFlashes[i].duration) {
        this.beamFlashes.splice(i, 1);
      }
    }

    const pad = NightVisionSystem.PAD;
    const lmScale = NightVisionSystem.LIGHTMAP_SCALE;
    const ox = this.arena.originX - pad;
    const oy = this.arena.originY - pad;
    const scale = this.arena.scaleRatio;
    const cellSize = this.arena.cellSize;

    // Coalesce active projectiles over a wider 44px radius so multi-bullet / flame bursts stay soft & non-glaring!
    const flareSources = coalesceProjectileLightSources(projectiles, 44 * scale, 12);

    // Emit gentle phosphor breadcrumb light nodes along flying projectiles (`~22Hz`)
    this.crumbEmitAccum += dt;
    if (this.crumbEmitAccum >= 0.045) {
      this.crumbEmitAccum = 0;
      for (let i = 0; i < flareSources.length; i++) {
        const fs = flareSources[i];
        if (fs.variant === 'flame') continue;
        const pal = getFlarePalette(fs.variant);
        if (this.trailCrumbs.length >= 48) {
          this.trailCrumbs.shift();
        }
        this.trailCrumbs.push({
          x: fs.x,
          y: fs.y,
          radius: Math.max(24 * scale, cellSize * 0.72),
          age: 0,
          duration: 0.48,
          rgb: pal.trailRgb,
        });
      }
    }

    // Extended Tank Headlamp Range (`~5.45` maze cells ahead!)
    const coneRange = Math.max(272 * scale, cellSize * 5.45);
    if (this.volumetricShader) {
      let bCount = 0;
      for (const tank of viewerTanks) {
        if (!tank.kinematics.alive || bCount >= 2) continue;
        const tankRange = coneRange * tank.getSkinStats().headlightRangeScale;
        this.volumetricShader.setUniform(`uBeam${bCount}.value`, {
          x: tank.kinematics.x - ox,
          y: tank.kinematics.y - oy,
          z: tank.kinematics.angle,
          w: tankRange,
        });
        bCount++;
      }
      this.volumetricShader.setUniform('uBeamCount.value', bCount);

      let fCount = 0;
      for (const fs of flareSources) {
        if (fCount >= 6) break;
        const pal = getFlarePalette(fs.variant);
        this.volumetricShader.setUniform(`uFlare${fCount}.value`, {
          x: fs.x - ox,
          y: fs.y - oy,
          z: Math.max(82 * scale, cellSize * pal.radiusCells),
          w: fs.variant === 'drill' ? 1 : 0,
        });
        fCount++;
      }
      this.volumetricShader.setUniform('uFlareCount.value', fCount);
    }

    // --- Stage 2: Render Physical Soft-Penumbra RGB Lightmap (`MULTIPLY`) ---
    const ctx = this.canvasTex.getContext();
    const cw = this.canvasTex.width;
    const ch = this.canvasTex.height;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    // 100% solid pitch-black ambient (`RGB(0,0,0)` -> `Scene * 0 = 0`, zero path visibility without light!)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cw, ch);

    ctx.scale(lmScale, lmScale);
    // Additive light energy accumulation in RGB space; GPU `FilterMode.LINEAR` upsampling (`0.28x -> 1.0x`)
    // provides natural, zero-CPU-cost soft shadow penumbras at locked 60-120 FPS!
    ctx.globalCompositeOperation = 'lighter';

    const paintRadialLight = (
      wx: number,
      wy: number,
      radius: number,
      coreRgb: string,
      midRgb: string,
      edgeRgb: string,
      intensity: number,
    ) => {
      if (radius <= 2 || intensity <= 0.01) return;
      const lx = wx - ox;
      const ly = wy - oy;
      const a0 = Math.min(1, intensity);
      const a1 = Math.min(1, intensity * 0.62);
      const a2 = Math.min(1, intensity * 0.22);
      const grd = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius);
      grd.addColorStop(0, `rgba(${coreRgb}, ${a0})`);
      grd.addColorStop(0.36, `rgba(${midRgb}, ${a1})`);
      grd.addColorStop(0.74, `rgba(${edgeRgb}, ${a2})`);
      grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(lx, ly, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    // 2A. Gentle Phosphor Breadcrumb Trails left behind flying Signal-Flare shells
    for (let i = 0; i < this.trailCrumbs.length; i++) {
      const c = this.trailCrumbs[i];
      const life = 1 - c.age / c.duration;
      const smooth = life * life;
      paintRadialLight(
        c.x,
        c.y,
        c.radius * (0.65 + 0.35 * life),
        c.rgb,
        c.rgb,
        '28, 18, 8',
        0.12 * smooth,
      );
    }

    // 2B. Viewer Tank Extended Multi-Lobe Cosine Xenon Headlamps + Wall-Bounce Rim Highlights
    const outerHalfRad = (32 * Math.PI) / 180; // 64-deg outer twilight penumbra
    for (const tank of viewerTanks) {
      if (!tank.kinematics.alive) continue;
      const angle = tank.kinematics.angle;
      const fwdX = Math.cos(angle);
      const fwdY = Math.sin(angle);
      // Raycast strictly from collision-resolved tank center so nose-against-wall never clips the beam!
      const lampOriginX = tank.kinematics.x;
      const lampOriginY = tank.kinematics.y;

      const tankRange = coneRange * tank.getSkinStats().headlightRangeScale;
      const samples = castFlashlightRaySamples(
        lampOriginX,
        lampOriginY,
        angle,
        outerHalfRad,
        tankRange,
        this.arena.walls,
        barrels,
        60,
      );

      const lx = lampOriginX - ox;
      const ly = lampOriginY - oy;

      const lobes: Array<{
        limitNorm: number;
        rangeMul: number;
        c0: string;
        c1: string;
        c2: string;
      }> = [
        {
          limitNorm: 1.0,
          rangeMul: 1.0,
          c0: 'rgba(105, 134, 182, 0.45)',
          c1: 'rgba(62, 88, 132, 0.28)',
          c2: 'rgba(0, 0, 0, 0)',
        },
        {
          limitNorm: 0.68,
          rangeMul: 0.96,
          c0: 'rgba(248, 230, 192, 0.58)',
          c1: 'rgba(202, 176, 136, 0.38)',
          c2: 'rgba(0, 0, 0, 0)',
        },
        {
          limitNorm: 0.4,
          rangeMul: 0.92,
          c0: 'rgba(255, 253, 244, 0.65)',
          c1: 'rgba(248, 238, 210, 0.44)',
          c2: 'rgba(0, 0, 0, 0)',
        },
      ];

      for (const lobe of lobes) {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          if (Math.abs(s.normAngle) > lobe.limitNorm + 0.04) continue;
          const clampedDist = Math.min(s.dist, coneRange * lobe.rangeMul);
          const rayA = angle + s.normAngle * outerHalfRad;
          ctx.lineTo(lx + Math.cos(rayA) * clampedDist, ly + Math.sin(rayA) * clampedDist);
        }
        ctx.closePath();

        const grd = ctx.createRadialGradient(lx, ly, 3, lx, ly, coneRange * lobe.rangeMul);
        grd.addColorStop(0, lobe.c0);
        grd.addColorStop(0.62, lobe.c1);
        grd.addColorStop(1, lobe.c2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // 3D Wall-Face Specular/Diffuse Bounce Highlight where headlamp rays strike maze walls!
      ctx.lineCap = 'round';
      for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1];
        const curr = samples[i];
        if (!prev.hitWall || !curr.hitWall) continue;
        if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 24 * scale) continue;
        const distNorm = curr.dist / coneRange;
        const angWeight = Math.max(0, 1 - curr.normAngle * curr.normAngle * 0.82);
        const wallAlpha = (1 - distNorm) * angWeight * 0.55;
        if (wallAlpha <= 0.03) continue;
        ctx.strokeStyle = `rgba(255, 244, 210, ${wallAlpha})`;
        ctx.lineWidth = 4.5 * scale;
        ctx.beginPath();
        ctx.moveTo(prev.x - ox, prev.y - oy);
        ctx.lineTo(curr.x - ox, curr.y - oy);
        ctx.stroke();
      }

      // Tight chassis awareness halo (illuminates ONLY the tank's own armored body + faint warm red rear taillight!)
      const hullHaloR = tank.isReaperSweeping()
        ? Math.max(62 * scale, tank.kinematics.radius * 3.7)
        : Math.max(19 * scale, tank.kinematics.radius * 1.52);
      paintRadialLight(
        tank.kinematics.x,
        tank.kinematics.y,
        hullHaloR,
        '235, 240, 250',
        '130, 148, 178',
        '32, 42, 64',
        0.95,
      );

      // Subtle red rear taillight glow right behind the rear tracks (`-radius * 0.95`)
      const rearX = tank.kinematics.x - fwdX * (tank.kinematics.radius * 0.98);
      const rearY = tank.kinematics.y - fwdY * (tank.kinematics.radius * 0.98);
      paintRadialLight(rearX, rearY, 14 * scale, '255, 70, 70', '180, 24, 24', '40, 4, 4', 0.55);
    }

    // 2C. Soft, Eye-Friendly 360° Wall-Occluded Signal-Flare Projectiles (`Đạn Pháo Sáng Dịu Mắt`)!
    for (let i = 0; i < flareSources.length; i++) {
      const fs = flareSources[i];
      const pal = getFlarePalette(fs.variant);
      const flareRadius = Math.max(82 * scale, cellSize * pal.radiusCells);
      const poly = castOmnidirectionalLightPolygon(
        fs.x,
        fs.y,
        flareRadius,
        this.arena.walls,
        barrels,
        32,
      );

      const lx = fs.x - ox;
      const ly = fs.y - oy;
      ctx.beginPath();
      for (let k = 0; k < poly.length; k++) {
        const px = poly[k].x - ox;
        const py = poly[k].y - oy;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const flicker = 0.94 + 0.06 * Math.sin(this.pulseClock * 22 + i * 1.9);
      const peakAlpha =
        (fs.variant === 'flame' ? 0.3 : fs.variant === 'gatling' ? 0.36 : 0.48) * flicker;
      const midAlpha = peakAlpha * 0.5;
      const edgeAlpha = peakAlpha * 0.18;
      const flareGrd = ctx.createRadialGradient(lx, ly, 2, lx, ly, flareRadius);
      flareGrd.addColorStop(0, `rgba(${pal.coreRgb}, ${peakAlpha})`);
      flareGrd.addColorStop(0.4, `rgba(${pal.midRgb}, ${midAlpha})`);
      flareGrd.addColorStop(0.78, `rgba(${pal.edgeRgb}, ${edgeAlpha})`);
      flareGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = flareGrd;
      ctx.fill();

      // Subtle wall-face rim highlight illuminated by the passing Signal-Flare shell
      ctx.lineCap = 'round';
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        if (!a.hitWall || !b.hitWall) continue;
        if (Math.hypot(b.x - a.x, b.y - a.y) > 26 * scale) continue;
        const rimAlpha = Math.max(0, 1 - a.dist / flareRadius) * 0.26;
        if (rimAlpha <= 0.025) continue;
        ctx.strokeStyle = `rgba(${pal.coreRgb}, ${rimAlpha})`;
        ctx.lineWidth = 3.5 * scale;
        ctx.beginPath();
        ctx.moveTo(a.x - ox, a.y - oy);
        ctx.lineTo(b.x - ox, b.y - oy);
        ctx.stroke();
      }
    }

    // 2D. Mystery Wooden Skill Crates emit a gentle, warm golden-amber breathing glow!
    const crateBreath = 0.38 + 0.07 * Math.sin(this.pulseClock * 3.2);
    const crateGlowRadius = Math.max(54 * scale, cellSize * 1.38);
    for (let i = 0; i < crates.length; i++) {
      const crate = crates[i];
      const poly = castOmnidirectionalLightPolygon(
        crate.x,
        crate.y,
        crateGlowRadius,
        this.arena.walls,
        barrels,
        24,
      );
      const lx = crate.x - ox;
      const ly = crate.y - oy;
      ctx.beginPath();
      for (let k = 0; k < poly.length; k++) {
        if (k === 0) ctx.moveTo(poly[k].x - ox, poly[k].y - oy);
        else ctx.lineTo(poly[k].x - ox, poly[k].y - oy);
      }
      ctx.closePath();
      const cGrd = ctx.createRadialGradient(lx, ly, 2, lx, ly, crateGlowRadius);
      cGrd.addColorStop(0, `rgba(255, 232, 166, ${crateBreath})`);
      cGrd.addColorStop(0.5, `rgba(218, 152, 62, ${crateBreath * 0.55})`);
      cGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = cGrd;
      ctx.fill();
    }

    // 2D. Ignited TNT Chain-Reaction Fuse Flicker (idle crates & barrels stay 100% hidden in the dark!)
    const fuseFlicker = 0.78 + 0.22 * Math.sin(this.pulseClock * 30.0);
    for (const b of barrels) {
      if (!b.active || b.fuseRemainingSec === null) continue;
      paintRadialLight(
        b.x,
        b.y,
        72 * scale,
        '255, 235, 160',
        '255, 92, 24',
        '80, 16, 4',
        fuseFlicker,
      );
    }

    // 2D-2. Emissive Night-Ops Glow for Cryo Ice Zones, Energy Force Barriers & Spatial Warp Beacons!
    if (extraWorldGlows) {
      for (const cz of extraWorldGlows.cryoZones) {
        const fade = Math.min(1, Math.max(0.15, cz.duration - cz.age));
        paintRadialLight(
          cz.x,
          cz.y,
          cz.radius * 1.25,
          '210, 250, 255',
          '48, 192, 218',
          '8, 42, 58',
          0.36 * fade,
        );
      }

      for (const wb of extraWorldGlows.warpBeacons) {
        const pulse = 0.42 + 0.1 * Math.sin(this.pulseClock * 6 + wb.id);
        paintRadialLight(
          wb.x,
          wb.y,
          56 * scale,
          '248, 210, 255',
          '192, 64, 248',
          '52, 12, 78',
          pulse,
        );
      }

      for (const eb of extraWorldGlows.barriers) {
        const fade = Math.min(1, Math.max(0.2, eb.duration - eb.age));
        for (const t of [0.15, 0.5, 0.85]) {
          const px = eb.x0 + (eb.x1 - eb.x0) * t;
          const py = eb.y0 + (eb.y1 - eb.y0) * t;
          paintRadialLight(
            px,
            py,
            46 * scale,
            '210, 255, 228',
            '24, 216, 118',
            '6, 56, 28',
            0.4 * fade,
          );
        }
      }
    }

    // 2E. Transient Muzzle, Bounce, Dying Flare Ember & Explosion Flashes
    const grdAlphaScale = 0.52;
    for (let i = 0; i < this.flareEvents.length; i++) {
      const ev = this.flareEvents[i];
      const k = 1 - ev.age / ev.duration;
      const smooth = k * (0.4 + 0.6 * k);
      if (ev.raycasted) {
        const r = ev.radius * (0.72 + 0.28 * k);
        const poly = castOmnidirectionalLightPolygon(
          ev.x,
          ev.y,
          r,
          this.arena.walls,
          barrels,
          28,
        );
        const lx = ev.x - ox;
        const ly = ev.y - oy;
        ctx.beginPath();
        for (let p = 0; p < poly.length; p++) {
          if (p === 0) ctx.moveTo(poly[p].x - ox, poly[p].y - oy);
          else ctx.lineTo(poly[p].x - ox, poly[p].y - oy);
        }
        ctx.closePath();
        const grd = ctx.createRadialGradient(lx, ly, 2, lx, ly, r);
        grd.addColorStop(0, `rgba(${ev.coreRgb}, ${grdAlphaScale * smooth})`);
        grd.addColorStop(0.45, `rgba(${ev.midRgb}, ${grdAlphaScale * 0.55 * smooth})`);
        grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grd;
        ctx.fill();
      } else {
        paintRadialLight(
          ev.x,
          ev.y,
          ev.radius,
          ev.coreRgb,
          ev.midRgb,
          '70, 24, 8',
          0.78 * smooth,
        );
      }
    }

    // 2F. Active Crescent Reaper (`Lưỡi Hái Tử Thần`) & Laser Charge Illumination across ALL Tanks!
    for (const tank of allTanks) {
      if (!tank.kinematics.alive) continue;
      const cx = tank.kinematics.x;
      const cy = tank.kinematics.y;

      // Laser 2.0s Charge Phase: escalating electric cyan-blue plasma sphere + forward aiming glow
      const laserProg = tank.getLaserChargeProgress();
      if (laserProg !== null) {
        const muzzle = tank.getMuzzleWorldPos();
        const chargeR = (54 + 62 * laserProg) * scale;
        paintRadialLight(
          muzzle.x,
          muzzle.y,
          chargeR,
          '215, 250, 255',
          '0, 176, 255',
          '8, 56, 112',
          0.55 + 0.42 * laserProg,
        );
        const guideLen = (92 + 48 * laserProg) * scale;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = (22 + 16 * laserProg) * scale;
        ctx.strokeStyle = `rgba(64, 196, 255, ${0.26 + 0.34 * laserProg})`;
        ctx.beginPath();
        ctx.moveTo(muzzle.x - ox, muzzle.y - oy);
        ctx.lineTo(
          muzzle.x + Math.cos(tank.kinematics.angle) * guideLen - ox,
          muzzle.y + Math.sin(tank.kinematics.angle) * guideLen - oy,
        );
        ctx.stroke();
        ctx.restore();
      }

      // Crescent Reaper (`Lưỡi Hái Tử Thần`) 0.55s Blood-Sigil Windup Phase
      const windupProg = tank.getReaperWindupProgress();
      if (windupProg !== null) {
        paintRadialLight(
          cx,
          cy,
          (78 + 26 * windupProg) * scale,
          '255, 190, 200',
          '225, 24, 68',
          '72, 6, 22',
          0.62 + 0.28 * windupProg,
        );
      }

      // Crescent Reaper (`Lưỡi Hái Tử Thần`) Stages 2–4: Laser Shaft -> Crescent Unfurl -> 180° Sweep!
      if (tank.isReaperSweeping()) {
        const extend = tank.getReaperExtendProgress();
        const crescentExtend = tank.getReaperCrescentProgress();
        const bladeLen = cellSize * POWERUP_CONFIG.reaperBladeCellsLength * extend;
        const sweep = computeReaperBlades(
          cx,
          cy,
          tank.kinematics.angle,
          tank.index,
          bladeLen,
          [],
          scale,
          crescentExtend,
        );

        paintRadialLight(
          cx,
          cy,
          98 * scale,
          '255, 210, 216',
          '235, 28, 72',
          '76, 8, 24',
          0.85,
        );

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer crimson corridor illumination along the full 4.7-cell twin scythe shaft
        ctx.lineWidth = 64 * scale;
        ctx.strokeStyle = 'rgba(220, 28, 68, 0.52)';
        ctx.beginPath();
        ctx.moveTo(sweep.bladeB.x1 - ox, sweep.bladeB.y1 - oy);
        ctx.lineTo(sweep.bladeA.x1 - ox, sweep.bladeA.y1 - oy);
        ctx.stroke();

        // Bright rose-white inner glow so the obsidian-black & blood-crimson scythe pops vividly!
        ctx.lineWidth = 26 * scale;
        ctx.strokeStyle = 'rgba(255, 224, 230, 0.78)';
        ctx.beginPath();
        ctx.moveTo(sweep.bladeB.x1 - ox, sweep.bladeB.y1 - oy);
        ctx.lineTo(sweep.bladeA.x1 - ox, sweep.bladeA.y1 - oy);
        ctx.stroke();

        // Illuminate both curved Crescent Scythe Blades (`crescentA` & `crescentB`)!
        for (const crescent of [sweep.crescentA, sweep.crescentB]) {
          if (crescent.length < 2) continue;
          const midPt = crescent[Math.floor(crescent.length / 2)];
          paintRadialLight(
            midPt.x,
            midPt.y,
            66 * scale,
            '255, 205, 212',
            '228, 24, 64',
            '68, 6, 20',
            0.74,
          );

          ctx.lineWidth = 42 * scale;
          ctx.strokeStyle = 'rgba(235, 36, 78, 0.62)';
          ctx.beginPath();
          for (let i = 0; i < crescent.length; i++) {
            if (i === 0) ctx.moveTo(crescent[i].x - ox, crescent[i].y - oy);
            else ctx.lineTo(crescent[i].x - ox, crescent[i].y - oy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 2G. Cross-Map Laser Beam Plasma Corridor Flash
    for (const bf of this.beamFlashes) {
      const k = 1 - bf.age / bf.duration;
      const smooth = k * (0.35 + 0.65 * k);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Wide electric-blue outer corridor illumination
      ctx.lineWidth = 94 * scale * (0.55 + 0.45 * k);
      ctx.strokeStyle = `rgba(36, 178, 255, ${0.68 * smooth})`;
      ctx.beginPath();
      for (let i = 0; i < bf.points.length; i++) {
        const bx = bf.points[i].x - ox;
        const by = bf.points[i].y - oy;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();

      // Intense white-cyan core illumination
      ctx.lineWidth = 36 * scale * (0.5 + 0.5 * k);
      ctx.strokeStyle = `rgba(232, 252, 255, ${0.96 * smooth})`;
      ctx.beginPath();
      for (let i = 0; i < bf.points.length; i++) {
        const bx = bf.points[i].x - ox;
        const by = bf.points[i].y - oy;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();
      ctx.restore();

      const pStart = bf.points[0];
      const pEnd = bf.points[bf.points.length - 1];
      paintRadialLight(pStart.x, pStart.y, 76 * scale, '225, 250, 255', '0, 176, 255', '8, 48, 96', 0.85 * smooth);
      paintRadialLight(pEnd.x, pEnd.y, 82 * scale, '225, 250, 255', '0, 176, 255', '8, 48, 96', 0.85 * smooth);
    }

    ctx.restore();
    this.canvasTex.refresh();

    // --- Stage 3: Crisp Additive Twin-Headlamp Bulbs, Reaper/Laser Plasma, Crate Shimmer & Flare Starbursts (`depth: 26.5`, `ADD`) ---
    this.renderOpticalGlints(viewerTanks, allTanks, flareSources, crates, scale);
  }

  private renderOpticalGlints(
    viewerTanks: readonly Tank[],
    allTanks: readonly Tank[],
    flareSources: ReturnType<typeof coalesceProjectileLightSources>,
    crates: readonly MysteryCrateState[],
    scale: number,
  ): void {
    const g = this.glintGraphics;
    g.clear();

    // 1. Viewer Tank Twin Front Xenon Headlamp Lenses + Subtle Rear Taillights
    for (const tank of viewerTanks) {
      if (!tank.kinematics.alive) continue;
      const a = tank.kinematics.angle;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const perpX = -sin;
      const perpY = cos;
      const r = tank.kinematics.radius;

      // Twin front fender headlamps (`+0.78r` forward, `±0.52r` left/right)
      for (const side of [-1, 1]) {
        const lx = tank.kinematics.x + cos * (r * 0.78) + perpX * (r * 0.52 * side);
        const ly = tank.kinematics.y + sin * (r * 0.78) + perpY * (r * 0.52 * side);
        g.fillStyle(0xfff3c4, 0.22);
        g.fillCircle(lx, ly, 7.5 * scale);
        g.fillStyle(0xffffff, 0.78);
        g.fillCircle(lx, ly, 2.3 * scale);

        // Subtle rear red LED taillights (`-0.88r` backward, `±0.52r` left/right)
        const tx = tank.kinematics.x - cos * (r * 0.88) + perpX * (r * 0.52 * side);
        const ty = tank.kinematics.y - sin * (r * 0.88) + perpY * (r * 0.52 * side);
        g.fillStyle(0xff1744, 0.35);
        g.fillCircle(tx, ty, 3.2 * scale);
      }
    }

    // 2. Subtle Golden Shimmer Halo on Mystery Wooden Skill Crates
    const crateShimmer = 0.08 + 0.04 * Math.sin(this.pulseClock * 3.2);
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      g.fillStyle(0xffd54f, crateShimmer);
      g.fillCircle(c.x, c.y, 18 * scale);
    }

    // 3. Soft, Non-Glaring Signal-Flare Projectile Glints
    for (let i = 0; i < flareSources.length; i++) {
      const fs = flareSources[i];
      const pal = getFlarePalette(fs.variant);
      const pulse = 0.88 + 0.12 * Math.sin(this.pulseClock * 24 + i * 1.7);
      const coreR = (fs.variant === 'flame' ? 10 : 7.5) * scale * pulse;

      // Soft outer pyrotechnic aura (toned down to prevent glare)
      g.fillStyle(pal.glintHex, (fs.variant === 'flame' ? 0.05 : 0.09) * pulse);
      g.fillCircle(fs.x, fs.y, coreR * 1.65);

      // Motion-streaked flare tail opposite velocity vector
      const speed = Math.hypot(fs.vx, fs.vy);
      if (speed > 8 && fs.variant !== 'flame') {
        const nx = fs.vx / speed;
        const ny = fs.vy / speed;
        g.lineStyle(2.4 * scale, pal.glintHex, 0.22 * pulse);
        g.lineBetween(fs.x, fs.y, fs.x - nx * 14 * scale, fs.y - ny * 14 * scale);
      }

      // Delicate 4-point optical lens cross-glint on Signal-Flare shells
      if (fs.variant !== 'flame') {
        const spikeLen = 8.5 * scale * pulse;
        g.lineStyle(1.1 * scale, 0xfff8e1, 0.26 * pulse);
        g.lineBetween(fs.x - spikeLen, fs.y, fs.x + spikeLen, fs.y);
        g.lineBetween(fs.x, fs.y - spikeLen * 0.78, fs.x, fs.y + spikeLen * 0.78);
      }

      // Warm core dot
      if (fs.variant !== 'flame') {
        g.fillStyle(0xfffde7, 0.55);
        g.fillCircle(fs.x, fs.y, 2.2 * scale);
      }
    }

    // 4. Additive Crimson Scythe Edges (`Lưỡi Hái Tử Thần`) & Electric Cyan Laser Plasma (`Laser`)!
    const cellSize = this.arena.cellSize;
    for (const tank of allTanks) {
      if (!tank.kinematics.alive) continue;
      const cx = tank.kinematics.x;
      const cy = tank.kinematics.y;

      const laserProg = tank.getLaserChargeProgress();
      if (laserProg !== null) {
        const muzzle = tank.getMuzzleWorldPos();
        const orbR = (6 + 11 * laserProg) * scale;
        g.lineStyle(1.8 * scale, 0x00e5ff, 0.35 + 0.4 * laserProg);
        g.strokeCircle(cx, cy, tank.kinematics.radius * (2.1 - 0.45 * laserProg));
        g.fillStyle(0x00b0ff, 0.28 + 0.3 * laserProg);
        g.fillCircle(muzzle.x, muzzle.y, orbR * 1.6);
        g.fillStyle(0xffffff, 0.85);
        g.fillCircle(muzzle.x, muzzle.y, orbR * 0.48);
      }

      const windupProg = tank.getReaperWindupProgress();
      if (windupProg !== null) {
        g.lineStyle(2.2 * scale, 0xff1744, 0.45 + 0.4 * windupProg);
        g.strokeCircle(cx, cy, tank.kinematics.radius * (2.5 - 0.7 * windupProg));
        g.fillStyle(0xff1744, 0.22 + 0.2 * windupProg);
        g.fillCircle(cx, cy, 16 * scale);
      }

      if (tank.isReaperSweeping()) {
        const extend = tank.getReaperExtendProgress();
        const crescentExtend = tank.getReaperCrescentProgress();
        const bladeLen = cellSize * POWERUP_CONFIG.reaperBladeCellsLength * extend;
        const sweep = computeReaperBlades(
          cx,
          cy,
          tank.kinematics.angle,
          tank.index,
          bladeLen,
          [],
          scale,
          crescentExtend,
        );

        g.lineStyle(11 * scale, 0xd50000, 0.28);
        g.lineBetween(sweep.bladeB.x1, sweep.bladeB.y1, sweep.bladeA.x1, sweep.bladeA.y1);
        g.lineStyle(3.2 * scale, 0xff5252, 0.72);
        g.lineBetween(sweep.bladeB.x1, sweep.bladeB.y1, sweep.bladeA.x1, sweep.bladeA.y1);

        for (const crescent of [sweep.crescentA, sweep.crescentB]) {
          if (crescent.length < 2) continue;
          g.lineStyle(12 * scale, 0xd50000, 0.3);
          g.beginPath();
          for (let i = 0; i < crescent.length; i++) {
            if (i === 0) g.moveTo(crescent[i].x, crescent[i].y);
            else g.lineTo(crescent[i].x, crescent[i].y);
          }
          g.strokePath();

          g.lineStyle(3.4 * scale, 0xff8a80, 0.85);
          g.beginPath();
          for (let i = 0; i < crescent.length; i++) {
            if (i === 0) g.moveTo(crescent[i].x, crescent[i].y);
            else g.lineTo(crescent[i].x, crescent[i].y);
          }
          g.strokePath();
        }
      }
    }

    for (const bf of this.beamFlashes) {
      const k = 1 - bf.age / bf.duration;
      g.lineStyle(18 * scale * (0.45 + 0.55 * k), 0x00b0ff, 0.36 * k);
      g.beginPath();
      for (let i = 0; i < bf.points.length; i++) {
        if (i === 0) g.moveTo(bf.points[i].x, bf.points[i].y);
        else g.lineTo(bf.points[i].x, bf.points[i].y);
      }
      g.strokePath();

      g.lineStyle(5 * scale * (0.4 + 0.6 * k), 0xe0f7fa, 0.82 * k);
      g.beginPath();
      for (let i = 0; i < bf.points.length; i++) {
        if (i === 0) g.moveTo(bf.points[i].x, bf.points[i].y);
        else g.lineTo(bf.points[i].x, bf.points[i].y);
      }
      g.strokePath();
    }
  }

  destroy(): void {
    this.volumetricShader?.destroy();
    this.volumetricShader = null;
    this.lightmapImage.destroy();
    this.glintGraphics.destroy();
    if (this.scene.textures.exists(this.texKey)) {
      this.scene.textures.remove(this.texKey);
    }
  }
}

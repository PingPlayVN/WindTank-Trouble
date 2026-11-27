import Phaser from 'phaser';
import {
  BATTLE_MODE_DESCRIPTORS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getAIDifficultyDescriptor,
  getAITacticDescriptor,
  getBattleModeDescriptor,
  getPaletteById,
  UI_COLORS,
  type BattleModeDescriptor,
} from '../config/constants';
import { audioManager } from '../managers/AudioManager';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { settingsManager } from '../managers/SettingsManager';
import type { BattleModeId } from '../types/gameTypes';
import {
  animateStaggeredEntrance,
  createArcadeButton,
  drawMazeBackdrop,
  type ArcadeButtonHandle,
} from '../../ui/components/ArcadeWidgets';
import { createMobileFullscreenControls } from '../../ui/components/FullscreenPromptWidget';

interface ModeCardRefs {
  id: BattleModeId;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  artFrame: Phaser.GameObjects.Graphics;
  badgeBg: Phaser.GameObjects.Graphics;
  badgeText: Phaser.GameObjects.Text;
  livePulseSprites: Array<{
    target: Phaser.GameObjects.Image | Phaser.GameObjects.Arc | Phaser.GameObjects.Graphics;
    baseAlpha: number;
    ampAlpha: number;
    speed: number;
    phase: number;
    baseRot?: number;
    ampRot?: number;
  }>;
}

const DIORAMA_W = 248;
const DIORAMA_H = 108;

/**
 * Dedicated Battle Mode & Tactical Modifiers Selection Screen (`ModeSelectScene`),
 * shown right AFTER Tank Selection (`SetupScene`) and BEFORE launching `GameScene`:
 * - 4 rich, supersampled Canvas2D + real Tank/TNT/Mine Sprite miniature battlefield dioramas:
 *   1. `classic`      — Sunlit Ricochet Duel & 1-Hit Elimination
 *   2. `armored_tnt`  — 100–200 HP Segmented Armor Bars & Wall-Breaching Explosive TNT Barrels
 *   3. `night_ops`    — 100% Pitch-Black Abyss & Wall-Occluded 50° Raycast Headlights
 *   4. `night_armored`— Midnight All-Out War (Pitch-Black + Xenon Headlights + Armor HP + Detonating TNT)
 * - Live battlefield modifiers: Explosive TNT Barrels (`Auto / On / Off`), Armor HP (`100 / 150 / 200`),
 *   and AI Tactical Personality (`Balanced / Rusher / Sniper / Camper`).
 */
export class ModeSelectScene extends Phaser.Scene {
  private modeCards: ModeCardRefs[] = [];
  private tntOptionBtn!: ArcadeButtonHandle;
  private armorHpBtn!: ArcadeButtonHandle;
  private aiTacticBtn!: ArcadeButtonHandle;
  private summaryText!: Phaser.GameObjects.Text;
  private onKeyDownBound!: (e: KeyboardEvent) => void;
  private animClock = 0;

  constructor() {
    super('ModeSelectScene');
  }

  create(): void {
    mobileOrientationManager.syncLayout();
    this.cameras.main.setBackgroundColor(UI_COLORS.menuBgHex);
    drawMazeBackdrop(this, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.ensureDioramaTextures();

    const fsControls = createMobileFullscreenControls(this, {
      buttonY: 36,
      showRecommendationBanner: false,
    });

    const header = this.add
      .text(DESIGN_WIDTH / 2, 36, 'CHỌN CHẾ ĐỘ CHIẾN ĐẤU & CHIẾN TRƯỜNG', {
        fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif",
        fontSize: '30px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    const rosterStrip = this.buildRosterSummaryStrip(DESIGN_WIDTH / 2, 76);

    // 4 Richly Illustrated Battle Mode Cards (`y = 294`)
    this.modeCards = [];
    const cardW = 282;
    const cardH = 374;
    const gap = 16;
    const startX =
      DESIGN_WIDTH / 2 -
      ((BATTLE_MODE_DESCRIPTORS.length * cardW + (BATTLE_MODE_DESCRIPTORS.length - 1) * gap) / 2) +
      cardW / 2;

    BATTLE_MODE_DESCRIPTORS.forEach((desc, idx) => {
      const cx = startX + idx * (cardW + gap);
      const card = this.createModeCard(cx, 294, cardW, cardH, desc);
      this.modeCards.push(card);
    });

    // Tactical Modifiers Bar (`y = 556`, exact 1176px outer span matching the 4 mode cards above!)
    this.tntOptionBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 - 398,
      y: 556,
      width: 380,
      height: 46,
      lipHeight: 3,
      label: '',
      fontSize: 13.5,
      onClick: () => {
        settingsManager.cycleTntBarrelsOption();
        this.refreshSelectionVisuals();
      },
    });

    this.armorHpBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2,
      y: 556,
      width: 380,
      height: 46,
      lipHeight: 3,
      label: '',
      fontSize: 13.5,
      onClick: () => {
        const cur = settingsManager.getSettings();
        if (cur.battleMode === 'classic' || cur.battleMode === 'night_ops') {
          settingsManager.setBattleMode(
            cur.battleMode === 'night_ops' ? 'night_armored' : 'armored_tnt',
          );
        } else {
          settingsManager.cycleMaxArmorHp();
        }
        this.refreshSelectionVisuals();
      },
    });

    this.aiTacticBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 + 398,
      y: 556,
      width: 380,
      height: 46,
      lipHeight: 3,
      label: '',
      fontSize: 13.5,
      onClick: () => {
        settingsManager.cycleAITactic(1);
        this.refreshSelectionVisuals();
      },
    });

    this.summaryText = this.add
      .text(DESIGN_WIDTH / 2, 618, '', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '800',
        color: '#0D47A1',
      })
      .setOrigin(0.5, 0.5);

    // Symmetrically centered navigation pair (`x = 322 .. 958`, exact center = 640!)
    const backBtn = createArcadeButton(this, {
      x: 444,
      y: 696,
      width: 244,
      height: 54,
      label: '← QUAY LẠI CHỌN XE',
      fontSize: 15.5,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        this.scene.start('SetupScene');
      },
    });

    const startBtn = createArcadeButton(this, {
      x: 774,
      y: 696,
      width: 368,
      height: 56,
      lipHeight: 5,
      label: 'BẮT ĐẦU TRẬN ĐẤU →',
      fontSize: 21,
      fillColor: 0x43a047,
      hoverColor: 0x4caf50,
      textColor: '#FFFFFF',
      onClick: () => {
        this.scene.start('GameScene', { freshMatch: true });
      },
    });

    this.refreshSelectionVisuals();

    animateStaggeredEntrance(
      this,
      [
        header,
        rosterStrip,
        ...this.modeCards.map((c) => c.container),
        this.tntOptionBtn.container,
        this.armorHpBtn.container,
        this.aiTacticBtn.container,
        this.summaryText,
        backBtn.container,
        startBtn.container,
      ],
      14,
      20,
    );

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape') {
        audioManager.playUiClick(true);
        this.scene.start('SetupScene');
      } else if (e.code === 'Enter' || e.code === 'Space') {
        audioManager.playUiClick(false);
        this.scene.start('GameScene', { freshMatch: true });
      } else if (e.code === 'Digit1') {
        this.selectMode('classic');
      } else if (e.code === 'Digit2') {
        this.selectMode('armored_tnt');
      } else if (e.code === 'Digit3') {
        this.selectMode('night_ops');
      } else if (e.code === 'Digit4') {
        this.selectMode('night_armored');
      }
    };
    window.addEventListener('keydown', this.onKeyDownBound);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onKeyDownBound);
      fsControls.destroy();
    });
  }

  update(_time: number, delta: number): void {
    this.animClock += delta / 1000;
    for (const card of this.modeCards) {
      for (const item of card.livePulseSprites) {
        if (!item.target.active) continue;
        const wave = Math.sin(this.animClock * item.speed + item.phase);
        item.target.setAlpha(
          Phaser.Math.Clamp(item.baseAlpha + item.ampAlpha * wave, 0.05, 1),
        );
        if (item.baseRot !== undefined && item.ampRot !== undefined) {
          item.target.setRotation(item.baseRot + item.ampRot * wave);
        }
      }
    }
  }

  private buildRosterSummaryStrip(centerX: number, y: number): Phaser.GameObjects.Container {
    const s = settingsManager.getSettings();
    const strip = this.add.container(centerX, y);

    const bg = this.add.graphics();
    const w = 880;
    const h = 34;
    bg.fillStyle(0xffffff, 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 9);
    bg.lineStyle(1.8, 0xd0d6e0, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 9);
    strip.add(bg);

    const parts: string[] = [];
    for (let i = 0; i < s.playerCount; i++) {
      const pal = getPaletteById(s.playerColors[i]);
      const role = s.playerIsAI[i]
        ? getAIDifficultyDescriptor(s.playerAIDifficulty[i]).shortBadge
        : 'Người Chơi';
      parts.push(`Xe ${i + 1} (${pal.name} • ${role})`);
    }

    const txt = this.add
      .text(0, 0, `ĐỘI HÌNH XUẤT KÍCH:  ${parts.join('   |   ')}`, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12.5px',
        fontStyle: '800',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0.5, 0.5);
    strip.add(txt);
    return strip;
  }

  private createModeCard(
    cx: number,
    cy: number,
    w: number,
    h: number,
    desc: BattleModeDescriptor,
  ): ModeCardRefs {
    const container = this.add.container(cx, cy);
    const bg = this.add.graphics();
    container.add(bg);

    const artCenterY = -h / 2 + 84;
    const livePulseSprites: ModeCardRefs['livePulseSprites'] = [];

    // 1. Crisp 2x-supersampled miniature battlefield diorama backdrop
    const bannerImg = this.add
      .image(0, artCenterY, `mode_diorama_${desc.id}`)
      .setDisplaySize(DIORAMA_W, DIORAMA_H);
    container.add(bannerImg);

    // 2. Layered real Tank / TNT / Mine sprites + animated combat VFX inside the diorama!
    this.populateDioramaSprites(container, 0, artCenterY, desc.id, livePulseSprites);

    // 3. Clean rounded bezel frame over the diorama edges
    const artFrame = this.add.graphics();
    container.add(artFrame);

    const titleTxt = this.add
      .text(0, -h / 2 + 162, desc.title, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '16.5px',
        fontStyle: '900',
        color: desc.accentHex,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    const subTxt = this.add
      .text(0, -h / 2 + 186, desc.tagline, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11.5px',
        fontStyle: '800',
        color: UI_COLORS.inkDarkHex,
        align: 'center',
        wordWrap: { width: w - 22 },
      })
      .setOrigin(0.5, 0.5);

    const bulletsCopy = desc.bullets.map((b) => `• ${b}`).join('\n');
    const bulletsTxt = this.add
      .text(-w / 2 + 18, -h / 2 + 208, bulletsCopy, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11.5px',
        fontStyle: '600',
        color: UI_COLORS.inkMutedHex,
        lineSpacing: 4.5,
        wordWrap: { width: w - 34 },
      })
      .setOrigin(0, 0);

    const badgeBg = this.add.graphics();
    const badgeText = this.add
      .text(0, h / 2 - 25, 'CHỌN CHẾ ĐỘ NÀY', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13px',
        fontStyle: '900',
        color: '#FFFFFF',
      })
      .setOrigin(0.5, 0.5);

    container.add([titleTxt, subTxt, bulletsTxt, badgeBg, badgeText]);

    const hitZone = this.add
      .zone(0, 0, w, h)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    let hoverTween: Phaser.Tweens.Tween | null = null;
    hitZone.on('pointerover', () => {
      hoverTween?.stop();
      hoverTween = this.tweens.add({
        targets: container,
        scaleX: 1.028,
        scaleY: 1.028,
        duration: 110,
        ease: 'Quad.easeOut',
      });
    });
    hitZone.on('pointerout', () => {
      hoverTween?.stop();
      hoverTween = this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Quad.easeOut',
      });
    });
    hitZone.on('pointerdown', () => {
      this.selectMode(desc.id);
    });
    container.add(hitZone);

    return { id: desc.id, container, bg, artFrame, badgeBg, badgeText, livePulseSprites };
  }

  /**
   * Places authentic high-detail game sprites (`tank_*`, `prop_tnt_barrel`, `pickup_mine`, `vfx_star`)
   * and segmented HP bars directly onto each card's miniature battlefield diorama!
   */
  private populateDioramaSprites(
    container: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    mode: BattleModeId,
    pulses: ModeCardRefs['livePulseSprites'],
  ): void {
    if (mode === 'classic') {
      // Left: Red Tank angling a bank-shot off the central steel wall
      const sh1 = this.add
        .image(cx - 80, cy + 23, 'tank_shadow')
        .setScale(0.68)
        .setRotation(-0.46)
        .setAlpha(0.5);
      const t1 = this.add
        .image(cx - 82, cy + 20, 'tank_red_0')
        .setScale(0.68)
        .setRotation(-0.46);
      const muzzleStar = this.add
        .image(cx - 58, cy + 8, 'vfx_star')
        .setScale(0.75)
        .setTint(0xffea00);
      pulses.push({
        target: muzzleStar,
        baseAlpha: 0.82,
        ampAlpha: 0.18,
        speed: 6.5,
        phase: 0,
      });

      // Bounce spark at top of central wall (`cx - 8, cy - 20`)
      const bounceSpark = this.add
        .image(cx - 8, cy - 20, 'vfx_star')
        .setScale(0.68)
        .setTint(0xff9100);
      pulses.push({
        target: bounceSpark,
        baseAlpha: 0.78,
        ampAlpha: 0.22,
        speed: 7.5,
        phase: 1.4,
      });

      // Right: Emerald Tank taking a lethal 1-Hit KO shell impact!
      const sh2 = this.add
        .image(cx + 76, cy + 17, 'tank_shadow')
        .setScale(0.66)
        .setRotation(2.55)
        .setAlpha(0.5);
      const t2 = this.add
        .image(cx + 74, cy + 14, 'tank_green_0')
        .setScale(0.66)
        .setRotation(2.55);
      const koBurst = this.add
        .image(cx + 62, cy + 9, 'vfx_star')
        .setScale(1.12)
        .setTint(0xff3d00);
      pulses.push({
        target: koBurst,
        baseAlpha: 0.86,
        ampAlpha: 0.14,
        speed: 5.2,
        phase: 2.1,
      });

      const koTag = this.add
        .text(cx + 72, cy - 24, '💥 1 VIÊN HẠ!', {
          fontFamily: "'Segoe UI', sans-serif",
          fontSize: '10px',
          fontStyle: '900',
          color: '#FFFFFF',
          backgroundColor: '#D84315',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5, 0.5);

      container.add([sh1, t1, muzzleStar, bounceSpark, sh2, t2, koBurst, koTag]);
      return;
    }

    if (mode === 'armored_tnt') {
      // Left: Armored Crimson Paladin Tank with glossy green segmented HP bar
      const sh1 = this.add
        .image(cx - 78, cy + 19, 'tank_shadow')
        .setScale(0.72)
        .setRotation(-0.15)
        .setAlpha(0.55);
      const t1 = this.add
        .image(cx - 80, cy + 16, 'tank_red_shield_0')
        .setScale(0.72)
        .setRotation(-0.15);

      const hpGfx = this.add.graphics();
      this.drawMiniSegmentedHpBar(hpGfx, cx - 80, cy - 16, 56, 9, 0.85, 0x00e676);

      // Center-Right: Explosive TNT Barrel detonating interior wall + second chained TNT Barrel
      const barrelMain = this.add
        .image(cx + 14, cy + 8, 'prop_tnt_barrel')
        .setScale(0.86)
        .setRotation(-0.08);
      const barrelGlow = this.add
        .circle(cx + 14, cy + 8, 24, 0xff3d00, 0.28)
        .setStrokeStyle(2, 0xffea00, 0.85);
      pulses.push({
        target: barrelGlow,
        baseAlpha: 0.68,
        ampAlpha: 0.26,
        speed: 6.2,
        phase: 0.5,
      });

      const barrelChain = this.add
        .image(cx + 52, cy - 20, 'prop_tnt_barrel')
        .setScale(0.68)
        .setRotation(0.12);

      // Right: Damaged smoking Gold Tank at critical 28% HP
      const t2 = this.add
        .image(cx + 84, cy + 22, 'tank_gold_0')
        .setScale(0.64)
        .setRotation(2.85);
      this.drawMiniSegmentedHpBar(hpGfx, cx + 82, cy - 5, 44, 7.5, 0.28, 0xff5252);
      const critSpark = this.add
        .image(cx + 76, cy + 16, 'vfx_star')
        .setScale(0.62)
        .setTint(0xffea00);
      pulses.push({
        target: critSpark,
        baseAlpha: 0.72,
        ampAlpha: 0.28,
        speed: 9.0,
        phase: 1.1,
      });

      container.add([sh1, t1, barrelGlow, barrelMain, barrelChain, t2, hpGfx, critSpark]);
      return;
    }

    if (mode === 'night_ops') {
      // Left: Emerald Tank projecting a focused raycast headlight into pitch-black abyss
      const t1 = this.add
        .image(cx - 82, cy + 12, 'tank_green_0')
        .setScale(0.7)
        .setRotation(-0.12);
      pulses.push({
        target: t1,
        baseAlpha: 1,
        ampAlpha: 0,
        speed: 2.2,
        phase: 0,
        baseRot: -0.12,
        ampRot: 0.05,
      });

      // Blazing Signal-Flare shell (`đạn pháo sáng`) scouting a dark corridor ahead!
      const tracerHalo = this.add.circle(cx + 34, cy + 4, 15, 0xffca28, 0.36);
      const tracerStar = this.add
        .image(cx + 34, cy + 4, 'vfx_star')
        .setScale(0.72)
        .setTint(0xfff59d);
      const tracerShell = this.add
        .image(cx + 34, cy + 4, 'projectile_shell')
        .setScale(0.92)
        .setRotation(-0.12);
      pulses.push({
        target: tracerHalo,
        baseAlpha: 0.62,
        ampAlpha: 0.26,
        speed: 7.0,
        phase: 0.8,
      });
      pulses.push({
        target: tracerStar,
        baseAlpha: 0.82,
        ampAlpha: 0.18,
        speed: 8.5,
        phase: 0.2,
      });

      // Lurking enemy tank silhouette revealed by the passing Signal-Flare shell!
      const lurker = this.add
        .image(cx + 76, cy - 8, 'tank_red_0')
        .setScale(0.64)
        .setRotation(2.9)
        .setTint(0xcfd8dc)
        .setAlpha(0.72);

      // Stealth Mine hidden in pitch-black shadow at bottom-right (faint red LED blink)
      const darkMine = this.add
        .image(cx + 82, cy + 32, 'pickup_mine')
        .setScale(0.68)
        .setTint(0x263238)
        .setAlpha(0.42);
      const mineLed = this.add.circle(cx + 82, cy + 32, 2.6, 0xff1744, 0.9);
      pulses.push({
        target: mineLed,
        baseAlpha: 0.45,
        ampAlpha: 0.5,
        speed: 4.8,
        phase: 2.0,
      });

      container.add([t1, tracerHalo, tracerStar, tracerShell, lurker, darkMine, mineLed]);
      return;
    }

    // `night_armored`: Pitch-Black Midnight + Xenon Headlight + Segmented Armor HP + Detonating TNT!
    const t1 = this.add
      .image(cx - 82, cy + 16, 'tank_blue_laser_0')
      .setScale(0.7)
      .setRotation(-0.14);

    const hpGfx = this.add.graphics();
    this.drawMiniSegmentedHpBar(hpGfx, cx - 82, cy - 16, 52, 8.5, 0.9, 0x00e676);

    // Detonating TNT Barrel illuminating the pitch-black maze!
    const blastOuter = this.add
      .circle(cx + 28, cy + 4, 30, 0xff6d00, 0.28)
      .setStrokeStyle(2, 0xffab00, 0.75);
    pulses.push({
      target: blastOuter,
      baseAlpha: 0.62,
      ampAlpha: 0.28,
      speed: 6.8,
      phase: 0.3,
    });

    const litBarrel = this.add
      .image(cx + 28, cy + 4, 'prop_tnt_barrel')
      .setScale(0.84)
      .setRotation(0.1);
    const blastSpark = this.add
      .image(cx + 42, cy - 8, 'vfx_star')
      .setScale(0.85)
      .setTint(0xffea00);
    pulses.push({
      target: blastSpark,
      baseAlpha: 0.8,
      ampAlpha: 0.2,
      speed: 8.4,
      phase: 1.7,
    });

    // Rival tank illuminated by the TNT fireball with damaged orange HP bar
    const rival = this.add
      .image(cx + 84, cy + 20, 'tank_gold_0')
      .setScale(0.62)
      .setRotation(2.8);
    this.drawMiniSegmentedHpBar(hpGfx, cx + 82, cy - 6, 42, 7.5, 0.42, 0xffca28);

    container.add([blastOuter, t1, litBarrel, rival, hpGfx, blastSpark]);
  }

  private drawMiniSegmentedHpBar(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    w: number,
    h: number,
    ratio: number,
    fillHex: number,
  ): void {
    const x = cx - w / 2;
    const y = cy - h / 2;
    g.fillStyle(0x0d1117, 0.92);
    g.fillRoundedRect(x - 1.5, y - 1.5, w + 3, h + 3, 4);
    g.fillStyle(0x263238, 1);
    g.fillRoundedRect(x, y, w, h, 3);

    const fw = Math.max(4, (w - 2) * ratio);
    g.fillStyle(fillHex, 1);
    g.fillRoundedRect(x + 1, y + 1, fw, h - 2, 2.5);
    // Top specular highlight strip
    g.fillStyle(0xffffff, 0.38);
    g.fillRect(x + 2, y + 1.5, Math.max(2, fw - 2), 2);

    // Crisp 4-segment notches
    g.lineStyle(1, 0x0d1117, 0.55);
    for (let s = 1; s < 4; s++) {
      const sx = x + (w * s) / 4;
      g.lineBetween(sx, y + 1, sx, y + h - 1);
    }
    g.lineStyle(1.2, 0xffffff, 0.45);
    g.strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, 3.5);
  }

  /**
   * Generates crisp 2x-supersampled (`496 × 216`) Canvas2D diorama textures once and caches them
   * in Phaser's TextureManager so switching scenes has zero memory leak and ultra-sharp edges.
   */
  private ensureDioramaTextures(): void {
    const modes: BattleModeId[] = ['classic', 'armored_tnt', 'night_ops', 'night_armored'];
    for (const mode of modes) {
      const key = `mode_diorama_${mode}`;
      if (this.textures.exists(key)) continue;
      const scale = 2;
      const cw = DIORAMA_W * scale;
      const ch = DIORAMA_H * scale;
      const canvasTex = this.textures.createCanvas(key, cw, ch);
      if (!canvasTex) continue;
      const ctx = canvasTex.getContext();
      ctx.save();
      ctx.scale(scale, scale);
      this.paintDioramaCanvas(ctx, DIORAMA_W, DIORAMA_H, mode);
      ctx.restore();
      canvasTex.refresh();
    }
  }

  private paintDioramaCanvas(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    mode: BattleModeId,
  ): void {
    // Rounded clipping mask for clean corners
    this.roundRectPath(ctx, 1, 1, w - 2, h - 2, 11);
    ctx.clip();

    if (mode === 'classic') {
      // Warm sunlit sandstone-ivory arena floor gradient
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#FFFDF7');
      bg.addColorStop(0.55, '#FFF5E0');
      bg.addColorStop(1, '#FFE8C2');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Subtle tactical arena tile grid
      ctx.strokeStyle = 'rgba(180, 140, 80, 0.16)';
      ctx.lineWidth = 1;
      for (let gx = 24; gx < w; gx += 28) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 22; gy < h; gy += 28) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Warm golden sun flare in top-left sky corner
      const sun = ctx.createRadialGradient(34, 20, 2, 34, 20, 58);
      sun.addColorStop(0, 'rgba(255, 196, 0, 0.52)');
      sun.addColorStop(0.45, 'rgba(255, 179, 0, 0.18)');
      sun.addColorStop(1, 'rgba(255, 179, 0, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, 110, 90);

      // 3D beveled interior maze walls + drop shadows
      this.drawBeveledWall(ctx, w / 2 - 12, 8, 9, 46);
      this.drawBeveledWall(ctx, w / 2 - 52, h - 30, 48, 8);
      this.drawBeveledWall(ctx, w - 62, 16, 8, 34);

      // Bank-shot ricochet laser-sight & glowing trajectory off top wall (`(w/2 - 8, 34)`)
      const p0 = { x: 66, y: 62 };
      const pMid = { x: w / 2 - 8, y: 34 };
      const pEnd = { x: w - 62, y: 63 };

      ctx.save();
      ctx.strokeStyle = 'rgba(229, 57, 53, 0.28)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pMid.x, pMid.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();

      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#D32F2F';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pMid.x, pMid.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();
      ctx.restore();

      // KO shockwave ring at target
      const ko = ctx.createRadialGradient(pEnd.x, pEnd.y, 2, pEnd.x, pEnd.y, 26);
      ko.addColorStop(0, 'rgba(255, 238, 88, 0.9)');
      ko.addColorStop(0.55, 'rgba(255, 87, 34, 0.45)');
      ko.addColorStop(1, 'rgba(255, 87, 34, 0)');
      ctx.fillStyle = ko;
      ctx.beginPath();
      ctx.arc(pEnd.x, pEnd.y, 26, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (mode === 'armored_tnt') {
      // Industrial warm steel-concrete battleground
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#FFF6F5');
      bg.addColorStop(0.6, '#FDE8E8');
      bg.addColorStop(1, '#F9D2D0');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Tactical grid
      ctx.strokeStyle = 'rgba(140, 70, 70, 0.13)';
      ctx.lineWidth = 1;
      for (let gx = 24; gx < w; gx += 28) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 22; gy < h; gy += 28) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Scorch crater + fiery shockwave behind exploding TNT barrel (`cx + 14 = 138, cy + 8 = 62`)
      const bx = w / 2 + 14;
      const by = h / 2 + 8;
      const blast = ctx.createRadialGradient(bx, by, 3, bx, by, 44);
      blast.addColorStop(0, 'rgba(255, 245, 157, 0.95)');
      blast.addColorStop(0.42, 'rgba(255, 109, 0, 0.55)');
      blast.addColorStop(0.78, 'rgba(213, 0, 0, 0.22)');
      blast.addColorStop(1, 'rgba(213, 0, 0, 0)');
      ctx.fillStyle = blast;
      ctx.beginPath();
      ctx.arc(bx, by, 44, 0, Math.PI * 2);
      ctx.fill();

      // Shattered maze wall being blown open in the middle!
      this.drawBeveledWall(ctx, w / 2 - 14, 6, 9, 24);
      this.drawBeveledWall(ctx, w / 2 - 14, h - 24, 9, 20);

      // Flying demolished wall chunks!
      ctx.fillStyle = '#37474F';
      for (const [fx, fy, fw, fh, rot] of [
        [bx - 22, by - 22, 8, 5, -0.4],
        [bx + 20, by - 18, 7, 5, 0.5],
        [bx + 24, by + 16, 8, 6, 0.25],
        [bx - 16, by + 22, 6, 4, -0.6],
      ]) {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(rot);
        ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
        ctx.restore();
      }

      // Chain-reaction fuse arc connecting main TNT to upper TNT (`w/2 + 52, h/2 - 20`)
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#FF6D00';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(bx + 6, by - 6);
      ctx.quadraticCurveTo(bx + 18, by - 28, w / 2 + 52, h / 2 - 20);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (mode === 'night_ops') {
      // 1. Pitch-black 100% impenetrable darkness (`#010206`) — zero unlit path visibility!
      ctx.fillStyle = '#010206';
      ctx.fillRect(0, 0, w, h);

      // 2. Crisp wall-occluded 50° headlight cone originating from Green Tank (`x = 42, y = 66`)
      //    Notice how the top half of the cone hits an interior maze wall at `x = 128, y = 18..50`
      //    and casts a sharp pitch-black occlusion shadow behind that wall, while the lower half reaches `x = 216`!
      const lx = 44;
      const ly = 66;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(128, 28); // Hits corner of occluding wall!
      ctx.lineTo(128, 48); // Slides down wall face
      ctx.lineTo(218, 34); // Continues past wall corner!
      ctx.lineTo(222, 92); // Lower beam boundary
      ctx.closePath();
      ctx.clip();

      // Illuminated arena floor & grid ONLY inside the headlight polygon!
      const litFloor = ctx.createRadialGradient(lx, ly, 6, lx, ly, 182);
      litFloor.addColorStop(0, '#FFFBE6');
      litFloor.addColorStop(0.45, '#DCE7F2');
      litFloor.addColorStop(0.82, '#37475A');
      litFloor.addColorStop(1, '#010206');
      ctx.fillStyle = litFloor;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      for (let gx = 24; gx < w; gx += 26) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 20; gy < h; gy += 26) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Warm volumetric xenon dust sheen
      const sheen = ctx.createRadialGradient(lx, ly, 4, lx, ly, 175);
      sheen.addColorStop(0, 'rgba(255, 249, 196, 0.45)');
      sheen.addColorStop(0.6, 'rgba(255, 241, 118, 0.16)');
      sheen.addColorStop(1, 'rgba(255, 241, 118, 0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Lit front edge of the occluding maze wall (`x = 128, y = 14..48`) — its back stays pitch black!
      ctx.fillStyle = '#455A64';
      ctx.fillRect(126, 24, 6, 25);
      ctx.fillStyle = '#FFE082';
      ctx.fillRect(126, 24, 2.5, 25);

      // Warm 360° Magnesium Signal-Flare light pool around flying shell (`fx = w/2 + 34 = 158, fy = h/2 + 4 = 58`)
      const fx = w / 2 + 34;
      const fy = h / 2 + 4;
      const flarePool = ctx.createRadialGradient(fx, fy, 2, fx, fy, 46);
      flarePool.addColorStop(0, 'rgba(255, 248, 210, 0.85)');
      flarePool.addColorStop(0.45, 'rgba(255, 179, 64, 0.42)');
      flarePool.addColorStop(1, 'rgba(255, 179, 64, 0)');
      ctx.fillStyle = flarePool;
      ctx.beginPath();
      ctx.arc(fx, fy, 46, 0, Math.PI * 2);
      ctx.fill();

      // Tight chassis halo around player tank (`x = 42, y = 66`)
      const hullHalo = ctx.createRadialGradient(42, 66, 2, 42, 66, 24);
      hullHalo.addColorStop(0, 'rgba(200, 230, 255, 0.38)');
      hullHalo.addColorStop(1, 'rgba(200, 230, 255, 0)');
      ctx.fillStyle = hullHalo;
      ctx.beginPath();
      ctx.arc(42, 66, 24, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // `night_armored`: Pitch-black abyss + Ice-Cyan Xenon Headlight + Blazing TNT Fireball!
    ctx.fillStyle = '#020108';
    ctx.fillRect(0, 0, w, h);

    // 1. Ice-blue xenon headlight beam from Cobalt Tank (`lx = 44, ly = 70`)
    const lx = 44;
    const ly = 70;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(186, 22);
    ctx.lineTo(192, 94);
    ctx.closePath();
    ctx.clip();

    const beam = ctx.createRadialGradient(lx, ly, 4, lx, ly, 158);
    beam.addColorStop(0, 'rgba(224, 247, 250, 0.88)');
    beam.addColorStop(0.48, 'rgba(79, 195, 247, 0.38)');
    beam.addColorStop(0.85, 'rgba(26, 35, 126, 0.14)');
    beam.addColorStop(1, 'rgba(2, 1, 8, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(128, 216, 255, 0.16)';
    ctx.lineWidth = 1;
    for (let gx = 24; gx < w; gx += 26) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Blazing TNT Explosion Light Pool (`bx = w/2 + 28 = 152, by = h/2 + 4 = 58`) lighting up the dark maze!
    const bx = w / 2 + 28;
    const by = h / 2 + 4;
    const fireball = ctx.createRadialGradient(bx, by, 3, bx, by, 58);
    fireball.addColorStop(0, 'rgba(255, 255, 200, 0.95)');
    fireball.addColorStop(0.35, 'rgba(255, 145, 0, 0.68)');
    fireball.addColorStop(0.7, 'rgba(213, 0, 0, 0.28)');
    fireball.addColorStop(1, 'rgba(2, 1, 8, 0)');
    ctx.fillStyle = fireball;
    ctx.beginPath();
    ctx.arc(bx, by, 58, 0, Math.PI * 2);
    ctx.fill();

    // Illuminated shattered wall segments & flying sparks around the TNT blast
    ctx.fillStyle = '#546E7A';
    ctx.fillRect(bx - 16, 10, 7, 20);
    ctx.fillRect(bx - 16, h - 22, 7, 16);
    ctx.fillStyle = '#FFAB40';
    ctx.fillRect(bx - 11, 10, 2, 20);
  }

  private drawBeveledWall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.fillStyle = 'rgba(20, 24, 30, 0.22)';
    ctx.fillRect(x + 2.5, y + 3, w, h);
    ctx.fillStyle = '#37474F';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#78909C';
    ctx.fillRect(x, y, w, 2);
    ctx.strokeStyle = '#1C252C';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, h);
  }

  private roundRectPath(
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

  private selectMode(mode: BattleModeId): void {
    settingsManager.setBattleMode(mode);
    audioManager.playUiClick(false);
    this.refreshSelectionVisuals();
  }

  private refreshSelectionVisuals(): void {
    const s = settingsManager.getSettings();
    const activeMode = s.battleMode;
    const activeDesc = getBattleModeDescriptor(activeMode);
    const cardW = 282;
    const cardH = 374;

    for (const card of this.modeCards) {
      const desc = getBattleModeDescriptor(card.id);
      const selected = card.id === activeMode;
      card.bg.clear();

      // Drop shadow
      card.bg.fillStyle(0x1d1f22, selected ? 0.22 : 0.1);
      card.bg.fillRoundedRect(-cardW / 2 + 4, -cardH / 2 + 6, cardW, cardH, 14);

      // Card body
      card.bg.fillStyle(selected ? desc.bgTint : UI_COLORS.cardBg, 1);
      card.bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 14);

      // Top header accent ribbon
      card.bg.fillStyle(desc.accentColor, selected ? 1 : 0.85);
      card.bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 14, {
        tl: 14,
        tr: 14,
        bl: 0,
        br: 0,
      });

      // Crisp border
      card.bg.lineStyle(
        selected ? 3.5 : 2.2,
        selected ? desc.accentColor : UI_COLORS.inkDark,
        1,
      );
      card.bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 14);

      // Diorama bezel frame
      card.artFrame.clear();
      card.artFrame.lineStyle(
        selected ? 2.4 : 1.8,
        selected ? desc.accentColor : 0xb0bec5,
        1,
      );
      card.artFrame.strokeRoundedRect(
        -DIORAMA_W / 2,
        -cardH / 2 + 84 - DIORAMA_H / 2,
        DIORAMA_W,
        DIORAMA_H,
        11,
      );

      // Bottom selection pill
      card.badgeBg.clear();
      card.badgeBg.fillStyle(selected ? desc.accentColor : 0xe0e4ec, 1);
      card.badgeBg.fillRoundedRect(-cardW / 2 + 18, cardH / 2 - 43, cardW - 36, 34, 8);
      card.badgeBg.lineStyle(1.8, selected ? 0x18191b : 0x90a4ae, 1);
      card.badgeBg.strokeRoundedRect(-cardW / 2 + 18, cardH / 2 - 43, cardW - 36, 34, 8);

      card.badgeText
        .setText(selected ? `✓ ĐANG CHỌN: ${desc.shortBadge}` : 'BẤM ĐỂ CHỌN')
        .setColor(selected ? '#FFFFFF' : UI_COLORS.inkDarkHex);
    }

    // Modifier 1: TNT Barrels
    const tntActive =
      s.tntBarrelsOption === 'on' ||
      (s.tntBarrelsOption === 'auto' && activeDesc.defaultTntBarrels);
    const tntModeStr =
      s.tntBarrelsOption === 'auto'
        ? `TỰ ĐỘNG (${tntActive ? 'CÓ' : 'TẮT'})`
        : s.tntBarrelsOption === 'on'
          ? 'LUÔN BẬT'
          : 'TẮT';
    this.tntOptionBtn.setLabel(`🧨 THÙNG TNT: ${tntModeStr}`);
    this.tntOptionBtn.setFill(
      tntActive ? 0xfff3e0 : UI_COLORS.cardBg,
      tntActive ? 0xffe0b2 : 0xf2f4f7,
      tntActive ? '#BF360C' : UI_COLORS.inkMutedHex,
    );

    // Modifier 2: Armor Durability HP
    if (activeDesc.hasArmorHp) {
      this.armorHpBtn.setLabel(`❤️ ĐỘ BỀN GIÁP XE: ${s.maxArmorHp} HP (BẤM ĐỔI)`);
      this.armorHpBtn.setFill(0xe8f5e9, 0xc8e6c9, '#1B5E20');
    } else {
      this.armorHpBtn.setLabel('⚡ SÁT THƯƠNG: 1 VIÊN HẠ NGAY (BẤM BẬT GIÁP HP)');
      this.armorHpBtn.setFill(UI_COLORS.cardBg, 0xf2f4f7, UI_COLORS.inkDarkHex);
    }

    // Modifier 3: AI Tactical Personality
    const aiDesc = getAITacticDescriptor(s.aiTactic);
    this.aiTacticBtn.setLabel(`🧠 CHIẾN THUẬT AI: ${aiDesc.label}`);
    this.aiTacticBtn.setFill(0xe3f2fd, 0xbbdefb, '#0D47A1');

    this.summaryText.setText(
      `${activeDesc.shortBadge}  •  ` +
        `${activeDesc.hasArmorHp ? `Giáp ${s.maxArmorHp} HP` : '1 Phát Nổ Ngay'}  •  ` +
        `${tntActive ? 'Có Thùng Nổ TNT Phá Tường' : 'Không Thùng TNT'}  •  ` +
        `AI: ${aiDesc.desc}`,
    );
  }
}

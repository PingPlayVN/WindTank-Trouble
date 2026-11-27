import Phaser from 'phaser';
import { AssetFactory } from '../art/AssetFactory';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_COLORS } from '../config/constants';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { networkStatus } from '../network/networkStatus';
import { extractRoomCodeFromSearch } from '../network/roomCode';
import { drawMazeBackdrop } from '../../ui/components/ArcadeWidgets';

interface ExhaustPuff {
  x: number;
  y: number;
  r: number;
  age: number;
  maxAge: number;
}

export class PreloadScene extends Phaser.Scene {
  private barGraphics!: Phaser.GameObjects.Graphics;
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private tankContainer!: Phaser.GameObjects.Container;
  private tankWheelsGraphics!: Phaser.GameObjects.Graphics;
  private percentText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;

  private loaderProgress = 0;
  private factoryProgress = 0;
  public displayProgress = 0;
  private assetsReady = false;
  private transitioning = false;
  private elapsedSec = 0;
  private puffAccumulator = 0;
  private readonly puffs: ExhaustPuff[] = [];

  private readonly barWidth = 468;
  private readonly barHeight = 26;
  private readonly barCenterX = DESIGN_WIDTH / 2;
  private readonly barCenterY = 472;

  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    mobileOrientationManager.syncLayout();
    this.cameras.main.setBackgroundColor(UI_COLORS.menuBg);
    this.load.on('progress', (val: number) => {
      this.loaderProgress = val;
    });
    this.load.svg('app_favicon', 'favicon.svg', { width: 64, height: 64 });
  }

  create(): void {
    this.loaderProgress = 1;
    this.factoryProgress = 0;
    this.displayProgress = 0;
    this.assetsReady = false;
    this.transitioning = false;
    this.elapsedSec = 0;
    this.puffs.length = 0;

    mobileOrientationManager.syncLayout();
    drawMazeBackdrop(this, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Ambient radar rings behind emblem & loading card
    const radar = this.add.graphics();
    radar.lineStyle(1.5, 0xcfd4dc, 0.55);
    radar.strokeCircle(DESIGN_WIDTH / 2, 326, 224);
    radar.strokeCircle(DESIGN_WIDTH / 2, 326, 316);

    // Pure-vector Preload Title Plaque (zero external texture dependency before AssetFactory runs!)
    const logoRoot = this.buildVectorTitlePlaque(DESIGN_WIDTH / 2, 198);
    logoRoot.setScale(0.86).setAlpha(0);
    this.tweens.add({
      targets: logoRoot,
      scale: 1,
      alpha: 1,
      duration: 320,
      ease: 'Back.easeOut',
    });

    this.add
      .text(DESIGN_WIDTH / 2, 292, 'ĐẠI CHIẾN XE TĂNG MÊ CUNG  •  ĐANG KHỞI ĐỘNG ĐẤU TRƯỜNG', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '14px',
        fontStyle: '800',
        color: UI_COLORS.inkMutedHex,
        letterSpacing: 1.1,
      })
      .setOrigin(0.5, 0.5);

    // Recessed Tactical Loading Card
    const cardW = 564;
    const cardH = 172;
    const cardY = 472;
    const card = this.add.graphics();
    card.fillStyle(0x1d1f22, 0.12);
    card.fillRoundedRect(DESIGN_WIDTH / 2 - cardW / 2 + 4, cardY - cardH / 2 + 6, cardW, cardH, 16);
    card.fillStyle(UI_COLORS.cardBg, 0.98);
    card.fillRoundedRect(DESIGN_WIDTH / 2 - cardW / 2, cardY - cardH / 2, cardW, cardH, 16);
    card.lineStyle(2.8, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(DESIGN_WIDTH / 2 - cardW / 2, cardY - cardH / 2, cardW, cardH, 16);

    this.fxGraphics = this.add.graphics();
    this.barGraphics = this.add.graphics();

    this.percentText = this.add
      .text(DESIGN_WIDTH / 2, this.barCenterY - 48, '0%', {
        fontFamily: "'Consolas', 'Segoe UI', sans-serif",
        fontSize: '28px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    this.stageText = this.add
      .text(DESIGN_WIDTH / 2, this.barCenterY + 44, 'Đang kết nối xưởng chiến xa…', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '700',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0.5, 0.5);

    this.buildMiniHeroTank();
    this.redrawProgressVisuals(0.02);

    AssetFactory.registerAllAsync(this, (p01, stageLabel) => {
      this.factoryProgress = p01;
      if (this.stageText?.active) {
        this.stageText.setText(stageLabel);
      }
    }).then(() => {
      this.factoryProgress = 1;
      this.assetsReady = true;
    });
  }

  private buildVectorTitlePlaque(x: number, y: number): Phaser.GameObjects.Container {
    const root = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x1d1f22, 0.14);
    g.fillRoundedRect(-195 + 4, -52 + 6, 390, 108, 14);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(-195, -52, 390, 108, 14);
    g.lineStyle(3.5, UI_COLORS.inkDark, 1);
    g.strokeRoundedRect(-195, -52, 390, 108, 14);

    // Accent corner rivets
    for (const [rx, ry] of [
      [-178, -36],
      [178, -36],
      [-178, 38],
      [178, 38],
    ]) {
      g.fillStyle(0xd0d4dc, 1);
      g.fillCircle(rx, ry, 4);
      g.lineStyle(1.4, UI_COLORS.inkDark, 0.8);
      g.strokeCircle(rx, ry, 4);
    }

    const topWord = this.add
      .text(0, -18, 'WINDTANK', {
        fontFamily: "Impact, 'Arial Black', 'Segoe UI', sans-serif",
        fontSize: '42px',
        fontStyle: '900',
        color: '#E53935',
        stroke: '#18191B',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0.5);

    const botWord = this.add
      .text(0, 24, 'TANK TROUBLE', {
        fontFamily: "Impact, 'Arial Black', 'Segoe UI', sans-serif",
        fontSize: '26px',
        fontStyle: '900',
        color: '#26292E',
        letterSpacing: 2,
      })
      .setOrigin(0.5, 0.5);

    root.add([g, topWord, botWord]);
    return root;
  }

  private buildMiniHeroTank(): void {
    const startX = this.barCenterX - this.barWidth / 2;
    const trackTopY = this.barCenterY - this.barHeight / 2 - 15;
    this.tankContainer = this.add.container(startX, trackTopY);

    const hull = this.add.graphics();
    hull.fillStyle(0x000000, 0.18);
    hull.fillRoundedRect(-17, -4, 34, 16, 4);
    hull.fillStyle(0x26292e, 1);
    hull.fillRoundedRect(-16, -2, 32, 11, 4);
    hull.lineStyle(1.8, 0x141619, 1);
    hull.strokeRoundedRect(-16, -2, 32, 11, 4);

    hull.fillStyle(0xe53935, 1);
    hull.fillRoundedRect(-13, -9, 24, 10, 3);
    hull.fillStyle(0xff6f60, 1);
    hull.fillRect(-10, -7.5, 16, 2.5);
    hull.lineStyle(1.8, 0x18191b, 1);
    hull.strokeRoundedRect(-13, -9, 24, 10, 3);

    hull.fillStyle(0xc62828, 1);
    hull.fillRect(6, -13, 15, 4.4);
    hull.lineStyle(1.6, 0x18191b, 1);
    hull.strokeRect(6, -13, 15, 4.4);
    hull.fillStyle(0x37474f, 1);
    hull.fillRect(19, -14, 4, 6.4);
    hull.strokeRect(19, -14, 4, 6.4);

    hull.fillStyle(0xe53935, 1);
    hull.fillCircle(-1, -11, 6.8);
    hull.lineStyle(1.8, 0x18191b, 1);
    hull.strokeCircle(-1, -11, 6.8);
    hull.fillStyle(0xff8a80, 1);
    hull.fillCircle(-2.5, -12.5, 2.3);

    this.tankWheelsGraphics = this.add.graphics();
    this.tankContainer.add([hull, this.tankWheelsGraphics]);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.12, Math.max(1 / 240, deltaMs / 1000));
    this.elapsedSec += dt;

    const rawTarget = this.loaderProgress * 0.12 + this.factoryProgress * 0.88;
    const pacedTarget = Math.min(rawTarget, this.elapsedSec / 0.68);

    this.displayProgress += (pacedTarget - this.displayProgress) * Math.min(1, dt * 14);
    if (this.assetsReady && this.elapsedSec >= 0.68 && 1 - this.displayProgress < 0.015) {
      this.displayProgress = 1;
    }

    this.stepExhaustPuffs(dt);
    this.redrawProgressVisuals(this.displayProgress);

    if (this.assetsReady && this.displayProgress >= 1 && !this.transitioning) {
      this.transitioning = true;
      this.stageText.setText('Sẵn sàng xuất kích!').setColor('#2E7D32');
      this.cameras.main.fadeOut(180, 238, 238, 236);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        const inviteCode =
          typeof window !== 'undefined' ? extractRoomCodeFromSearch(window.location.search) : null;
        if (inviteCode && networkStatus.isOnline()) {
          this.scene.start('OnlineLobbyScene', { autoJoinCode: inviteCode });
        } else {
          this.scene.start('MenuScene');
        }
      });
    }
  }

  private stepExhaustPuffs(dt: number): void {
    this.puffAccumulator += dt;
    const tankX =
      this.barCenterX - this.barWidth / 2 + Math.max(14, this.barWidth * this.displayProgress);
    const tankY = this.barCenterY - this.barHeight / 2 - 15;

    if (this.puffAccumulator >= 0.055 && this.displayProgress < 0.995) {
      this.puffAccumulator = 0;
      this.puffs.push({
        x: tankX - 18,
        y: tankY - 4,
        r: 3.2 + Math.random() * 2.2,
        age: 0,
        maxAge: 0.48,
      });
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      p.x -= 22 * dt;
      p.y -= 18 * dt;
      p.r += 9 * dt;
      if (p.age >= p.maxAge) {
        this.puffs.splice(i, 1);
      }
    }
  }

  private redrawProgressVisuals(p01: number): void {
    const clamped = Phaser.Math.Clamp(p01, 0, 1);
    const bx = this.barCenterX - this.barWidth / 2;
    const by = this.barCenterY - this.barHeight / 2;

    this.percentText.setText(`${Math.round(clamped * 100)}%`);

    const g = this.barGraphics;
    g.clear();

    g.fillStyle(0x26292f, 1);
    g.fillRoundedRect(bx - 3, by - 3, this.barWidth + 6, this.barHeight + 6, 11);
    g.fillStyle(0x373c44, 1);
    g.fillRoundedRect(bx, by, this.barWidth, this.barHeight, 8);

    const fillW = Math.max(14, this.barWidth * clamped);
    g.fillStyle(0xe53935, 1);
    g.fillRoundedRect(bx, by, fillW, this.barHeight, 8);

    g.fillStyle(0xff8f00, 0.88);
    g.fillRoundedRect(bx + 2, by + 2, Math.max(10, fillW - 4), this.barHeight * 0.46, 5);
    g.fillStyle(0xfff59d, 0.45);
    g.fillRoundedRect(bx + 4, by + 3, Math.max(8, fillW - 8), 4, 2);

    const stripeSpacing = 24;
    const scrollOffset = (this.elapsedSec * 64) % stripeSpacing;
    g.lineStyle(4, 0xffffff, 0.18);
    for (let sx = bx + scrollOffset; sx < bx + fillW - 8; sx += stripeSpacing) {
      const xTop = Math.min(bx + fillW - 4, sx + 6);
      const xBot = Math.max(bx + 4, sx - 4);
      g.lineBetween(xTop, by + 3, xBot, by + this.barHeight - 3);
    }

    g.lineStyle(2.4, UI_COLORS.inkDark, 1);
    g.strokeRoundedRect(bx - 3, by - 3, this.barWidth + 6, this.barHeight + 6, 11);

    const fx = this.fxGraphics;
    fx.clear();

    for (const puff of this.puffs) {
      const alpha = Math.max(0, (1 - puff.age / puff.maxAge) * 0.34);
      fx.fillStyle(0x78909c, alpha);
      fx.fillCircle(puff.x, puff.y, puff.r);
    }

    const tipX = bx + fillW;
    const tipY = this.barCenterY;
    const pulse = 1 + Math.sin(this.elapsedSec * 18) * 0.16;
    fx.fillStyle(0xffea00, 0.42);
    fx.fillCircle(tipX, tipY, 12 * pulse);
    fx.fillStyle(0xffffff, 0.92);
    fx.fillCircle(tipX, tipY, 5.2 * pulse);

    const tankX = Phaser.Math.Clamp(tipX - 6, bx + 16, bx + this.barWidth - 10);
    const bobY = Math.sin(this.elapsedSec * 24) * 1.1;
    this.tankContainer.setPosition(tankX, by - 14 + bobY);
    this.tankContainer.setRotation(clamped < 0.99 ? -0.035 : 0);

    this.tankWheelsGraphics.clear();
    const wheelSpin = this.elapsedSec * 16;
    for (const wx of [-10, -3.5, 3.5, 10]) {
      this.tankWheelsGraphics.fillStyle(0x546e7a, 1);
      this.tankWheelsGraphics.fillCircle(wx, 3.5, 2.7);
      const spokeX = wx + Math.cos(wheelSpin + wx) * 1.6;
      const spokeY = 3.5 + Math.sin(wheelSpin + wx) * 1.6;
      this.tankWheelsGraphics.fillStyle(0xcfd8dc, 1);
      this.tankWheelsGraphics.fillCircle(spokeX, spokeY, 1.0);
    }
  }
}

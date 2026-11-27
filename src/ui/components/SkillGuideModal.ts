import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  POWERUP_CONFIG,
  SKILL_DESCRIPTORS,
  UI_COLORS,
  type SkillDescriptor,
} from '../../game/config/constants';
import { audioManager } from '../../game/managers/AudioManager';
import {
  animateModalOpen,
  createArcadeButton,
  createModalScrim,
  type ArcadeButtonHandle,
} from './ArcadeWidgets';

export interface SkillGuideModalOptions {
  onClose: () => void;
}

const CARDS_PER_PAGE = 4;

/**
 * Paginated 10-Skill Power-Up & Superhero Suit Codex Modal (`CẨM NANG 10 KỸ NĂNG SIÊU NHÂN`):
 * - Explains the 20s Mystery Wooden Crate mechanic & weighted drop probabilities
 * - 3 clean pages (`◀ TRANG 1 / 3 ▶`) showcasing all 10 Superhero Tank transformations, weapon previews,
 *   drop rates, ammo counts, and detailed Vietnamese traits
 */
export class SkillGuideModal {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly contentRoot: Phaser.GameObjects.Container;
  private cardsContainer!: Phaser.GameObjects.Container;
  private pageIndicatorText!: Phaser.GameObjects.Text;
  private prevBtn!: ArcadeButtonHandle;
  private nextBtn!: ArcadeButtonHandle;

  private currentPage = 0;
  private readonly totalPages = Math.ceil(SKILL_DESCRIPTORS.length / CARDS_PER_PAGE);

  private readonly onCloseCallback: () => void;
  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private previewSprites: Phaser.GameObjects.Image[] = [];
  private readonly updateListener: (_t: number, delta: number) => void;
  private closed = false;

  constructor(scene: Phaser.Scene, opts: SkillGuideModalOptions) {
    this.scene = scene;
    this.onCloseCallback = opts.onClose;
    this.container = scene.add.container(0, 0).setDepth(230);
    this.contentRoot = scene.add.container(0, 0);

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        this.changePage(-1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        this.changePage(1);
      }
    };
    window.addEventListener('keydown', this.onKeyDownBound, true);

    this.updateListener = (_t: number, delta: number) => {
      const dt = delta / 1000;
      for (const sp of this.previewSprites) {
        if (sp.active) sp.rotation += dt * 0.85;
      }
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateListener);

    this.build();
  }

  private changePage(delta: 1 | -1): void {
    const next = (this.currentPage + delta + this.totalPages) % this.totalPages;
    if (next === this.currentPage) return;
    this.currentPage = next;
    audioManager.playUiClick(true);
    this.renderCurrentPage();
  }

  private build(): void {
    const scrim = createModalScrim(this.scene, 0x0f1115, 0.65);

    const panelW = 1100;
    const panelH = 682;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;

    const panel = this.scene.add.graphics();
    panel.fillStyle(0x18191b, 0.3);
    panel.fillRoundedRect(px - panelW / 2 + 6, py - panelH / 2 + 8, panelW, panelH, 16);
    panel.fillStyle(UI_COLORS.cardBg, 1);
    panel.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 16);
    panel.lineStyle(3.2, UI_COLORS.inkDark, 1);
    panel.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 16);

    const title = this.scene.add
      .text(px, py - panelH / 2 + 28, '★ CẨM NANG 15 VẬT PHẨM & GIÁP SIÊU NHÂN ★', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '23px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    this.container.add([scrim, this.contentRoot]);
    this.contentRoot.add([panel, title]);

    this.buildMysteryCrateBanner(px, py - panelH / 2 + 90, panelW - 64);

    this.cardsContainer = this.addContainer();

    // Footer Pagination + Close Bar
    const footerY = py + panelH / 2 - 32;

    this.prevBtn = createArcadeButton(this.scene, {
      x: px - 335,
      y: footerY,
      width: 145,
      height: 40,
      lipHeight: 3,
      label: '◀ TRANG TRƯỚC',
      fontSize: 13.5,
      fillColor: UI_COLORS.cardAltBg,
      hoverColor: 0xdcdfe4,
      onClick: () => this.changePage(-1),
    });

    this.pageIndicatorText = this.scene.add
      .text(px - 170, footerY, '', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '15px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    this.nextBtn = createArcadeButton(this.scene, {
      x: px - 5,
      y: footerY,
      width: 145,
      height: 40,
      lipHeight: 3,
      label: 'TRANG TIẾP ▶',
      fontSize: 13.5,
      fillColor: UI_COLORS.cardAltBg,
      hoverColor: 0xdcdfe4,
      onClick: () => this.changePage(1),
    });

    const closeBtn = createArcadeButton(this.scene, {
      x: px + 310,
      y: footerY,
      width: 220,
      height: 40,
      lipHeight: 3,
      label: 'ĐÃ HIỂU (ESC)',
      fontSize: 15.5,
      fillColor: 0x43a047,
      hoverColor: 0x4caf50,
      textColor: '#FFFFFF',
      onClick: () => this.close(),
    });

    this.contentRoot.add([
      this.prevBtn.container,
      this.pageIndicatorText,
      this.nextBtn.container,
      closeBtn.container,
    ]);

    this.renderCurrentPage(false);
    animateModalOpen(this.scene, scrim, this.contentRoot);
  }

  private addContainer(): Phaser.GameObjects.Container {
    const c = this.scene.add.container(0, 0);
    this.contentRoot.add(c);
    return c;
  }

  private renderCurrentPage(animateFlip = true): void {
    this.cardsContainer.removeAll(true);
    this.previewSprites = [];

    const startIdx = this.currentPage * CARDS_PER_PAGE;
    const slice = SKILL_DESCRIPTORS.slice(startIdx, startIdx + CARDS_PER_PAGE);

    this.pageIndicatorText.setText(
      `TRANG ${this.currentPage + 1} / ${this.totalPages}  (${SKILL_DESCRIPTORS.length} LOẠI)`,
    );

    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;
    const cardW = 508;
    const cardH = 208;
    const gapX = 20;
    const gapY = 16;
    const gridCenterY = py + 40;

    const paletteCycle = ['blue', 'gold', 'purple', 'red', 'cyan', 'green'];

    slice.forEach((desc, idx) => {
      const globalIdx = startIdx + idx;
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const isSingleRow = slice.length <= 2;
      const cx = px + (col === 0 ? -(cardW / 2 + gapX / 2) : cardW / 2 + gapX / 2);
      const cy = isSingleRow
        ? gridCenterY
        : gridCenterY + (row === 0 ? -(cardH / 2 + gapY / 2) : cardH / 2 + gapY / 2);
      this.buildSkillCard(
        cx,
        cy,
        cardW,
        cardH,
        desc,
        paletteCycle[globalIdx % paletteCycle.length],
      );
    });

    if (animateFlip) {
      this.scene.tweens.killTweensOf(this.cardsContainer);
      this.cardsContainer.setAlpha(0).setY(10);
      this.scene.tweens.add({
        targets: this.cardsContainer,
        alpha: 1,
        y: 0,
        duration: 185,
        ease: 'Cubic.easeOut',
      });
    }
  }

  private buildMysteryCrateBanner(cx: number, cy: number, width: number): void {
    const h = 70;
    const g = this.scene.add.graphics();
    g.fillStyle(0xfff8e1, 1);
    g.fillRoundedRect(cx - width / 2, cy - h / 2, width, h, 12);
    g.lineStyle(2.2, 0xf9a825, 1);
    g.strokeRoundedRect(cx - width / 2, cy - h / 2, width, h, 12);

    const crateX = cx - width / 2 + 44;
    const crateRing = this.scene.add
      .circle(crateX, cy, 25, 0xffecb3, 1)
      .setStrokeStyle(1.8, 0xfbc02d, 1);
    const crateImg = this.scene.add.image(crateX, cy, 'pickup_wood_crate').setScale(0.9);

    const heading = this.scene.add
      .text(
        cx - width / 2 + 84,
        cy - 14,
        `THÙNG GỖ BÍ ẨN  •  XUẤT HIỆN MỖI ${POWERUP_CONFIG.spawnIntervalSec} GIÂY  •  15 KỸ NĂNG NGẪU NHIÊN`,
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '14.5px',
          fontStyle: '900',
          color: '#E65100',
        },
      )
      .setOrigin(0, 0.5);

    const desc = this.scene.add
      .text(
        cx - width / 2 + 84,
        cy + 12,
        'Mọi vật phẩm rơi ra đều ẩn trong Thùng Gỗ giống hệt nhau! Xe tăng ăn thùng sẽ hóa Giáp Siêu Nhân tương ứng với kỹ năng quay trúng\ntheo tỉ lệ độ hiếm bên dưới. Khi hết đạn / hết hiệu lực, xe tự động quay về dạng mặc định (10 viên đạn thường).',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '12.2px',
          fontStyle: '600',
          color: UI_COLORS.inkDarkHex,
          lineSpacing: 3,
        },
      )
      .setOrigin(0, 0.5);

    this.contentRoot.add([g, crateRing, crateImg, heading, desc]);
  }

  private buildSkillCard(
    cx: number,
    cy: number,
    w: number,
    h: number,
    desc: SkillDescriptor,
    paletteId: string,
  ): void {
    const left = cx - w / 2;
    const top = cy - h / 2;

    const card = this.scene.add.graphics();
    card.fillStyle(0xf8f9fb, 1);
    card.fillRoundedRect(left, top, w, h, 12);
    card.fillStyle(desc.accentColor, 1);
    card.fillRoundedRect(left, top, w, 40, { tl: 12, tr: 12, bl: 0, br: 0 });
    card.lineStyle(2.4, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(left, top, w, h, 12);

    const emblem = this.scene.add
      .image(left + 24, top + 20, `skill_emblem_${desc.id}`)
      .setScale(0.68);

    const nameText = this.scene.add
      .text(left + 46, top + 20, desc.name, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '15.5px',
        fontStyle: '900',
        color: '#FFFFFF',
        stroke: '#18191B',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);

    const badgeBg = this.scene.add.graphics();
    badgeBg.fillStyle(0x18191b, 0.78);
    badgeBg.fillRoundedRect(left + w - 216, top + 8, 206, 24, 6);

    const badgeTxt = this.scene.add
      .text(left + w - 113, top + 20, `${desc.ammoLabel} • TỈ LỆ ${desc.dropPercent}%`, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11px',
        fontStyle: '900',
        color: '#FFE082',
      })
      .setOrigin(0.5, 0.5);

    const previewX = left + 56;
    const previewY = top + 106;
    const pedestal = this.scene.add
      .circle(previewX, previewY, 34, 0xffffff, 1)
      .setStrokeStyle(2, desc.accentColor, 0.65);

    const tankSprite = this.scene.add
      .image(previewX, previewY, `tank_${paletteId}_${desc.id}_0`)
      .setScale(0.98)
      .setRotation(-Math.PI / 4);
    this.previewSprites.push(tankSprite);

    const suitLabel = this.scene.add
      .text(previewX, top + 158, desc.suitTitle, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '10.2px',
        fontStyle: '800',
        color: desc.accentHex,
        align: 'center',
        wordWrap: { width: 96 },
      })
      .setOrigin(0.5, 0.5);

    let ammoPreview: Phaser.GameObjects.GameObject;
    if (desc.id === 'laser') {
      const lg = this.scene.add.graphics();
      lg.lineStyle(5, 0x00b0ff, 0.55);
      lg.lineBetween(previewX - 24, top + 186, previewX + 24, top + 186);
      lg.lineStyle(2, 0xffffff, 1);
      lg.lineBetween(previewX - 24, top + 186, previewX + 24, top + 186);
      ammoPreview = lg;
    } else if (desc.id === 'reaper') {
      const rg = this.scene.add.graphics();
      const sy = top + 186;
      rg.lineStyle(6.5, 0x0d0e12, 0.9);
      rg.lineBetween(previewX - 28, sy, previewX + 28, sy);
      rg.lineBetween(previewX + 26, sy - 6, previewX + 20, sy + 11);
      rg.lineBetween(previewX - 26, sy + 6, previewX - 20, sy - 11);
      rg.lineStyle(2.6, 0xff1744, 1);
      rg.lineBetween(previewX - 28, sy, previewX + 28, sy);
      rg.lineBetween(previewX + 26, sy - 6, previewX + 20, sy + 11);
      rg.lineBetween(previewX - 26, sy + 6, previewX - 20, sy - 11);
      ammoPreview = rg;
    } else if (desc.id === 'shield') {
      const sg = this.scene.add.graphics();
      sg.lineStyle(2.5, 0x00bfa5, 0.95);
      sg.strokeCircle(previewX, top + 186, 10);
      ammoPreview = sg;
    } else if (desc.id === 'spike') {
      const c = this.scene.add.container(previewX, top + 186);
      c.add([
        this.scene.add.image(-12, 0, 'projectile_spike_ball').setScale(0.78),
        this.scene.add.image(12, 0, 'decal_ground_spike').setScale(0.78),
      ]);
      ammoPreview = c;
    } else if (desc.id === 'gatling') {
      const c = this.scene.add.container(previewX, top + 186);
      for (let k = -2; k <= 2; k++) {
        c.add(this.scene.add.image(k * 9, 0, 'projectile_gatling').setScale(0.85));
      }
      ammoPreview = c;
    } else if (desc.id === 'scatter') {
      const c = this.scene.add.container(previewX, top + 186);
      for (let k = -2; k <= 2; k++) {
        c.add(this.scene.add.image(k * 9, Math.abs(k) * 1.5, 'projectile_scatter').setScale(0.85));
      }
      ammoPreview = c;
    } else if (desc.id === 'mine') {
      ammoPreview = this.scene.add.image(previewX, top + 186, 'pickup_mine').setScale(0.82);
    } else if (desc.id === 'drill') {
      ammoPreview = this.scene.add.image(previewX, top + 186, 'projectile_drill').setScale(0.95);
    } else if (desc.id === 'flame') {
      ammoPreview = this.scene.add.image(previewX, top + 186, 'projectile_flame').setScale(0.85);
    } else {
      ammoPreview = this.scene.add.image(previewX, top + 186, 'projectile_missile').setScale(0.95);
    }

    const textX = left + 108;
    const traitsFormatted = desc.traits.map((line) => `• ${line}`).join('\n');
    const traitsText = this.scene.add
      .text(textX, top + 50, traitsFormatted, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12.5px',
        fontStyle: '700',
        color: UI_COLORS.inkDarkHex,
        lineSpacing: 5,
        wordWrap: { width: w - 120 },
      })
      .setOrigin(0, 0);

    this.cardsContainer.add([
      card,
      emblem,
      nameText,
      badgeBg,
      badgeTxt,
      pedestal,
      tankSprite,
      suitLabel,
      ammoPreview,
      traitsText,
    ]);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('keydown', this.onKeyDownBound, true);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateListener);
    this.container.destroy(true);
    this.onCloseCallback();
  }
}

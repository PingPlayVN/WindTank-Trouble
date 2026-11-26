import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getAIDifficultyDescriptor,
  getPaletteById,
  UI_COLORS,
} from '../config/constants';
import { audioManager } from '../managers/AudioManager';
import { peerMultiplayer } from '../network/PeerMultiplayerManager';
import type { PlayerConfig, RoundResultSummary } from '../types/gameTypes';
import {
  animateModalOpen,
  animateStaggeredEntrance,
  createArcadeButton,
  drawMazeBackdrop,
} from '../../ui/components/ArcadeWidgets';

interface ResultSceneData {
  summary: RoundResultSummary;
  players: PlayerConfig[];
}

export class ResultScene extends Phaser.Scene {
  private summary!: RoundResultSummary;
  private players: PlayerConfig[] = [];
  private heroTank!: Phaser.GameObjects.Image;
  private onKeyDownBound!: (e: KeyboardEvent) => void;

  constructor() {
    super('ResultScene');
  }

  init(data: ResultSceneData): void {
    this.summary = data.summary;
    this.players = data.players ?? [];
  }

  create(): void {
    drawMazeBackdrop(this, DESIGN_WIDTH, DESIGN_HEIGHT);

    const isOnline = peerMultiplayer.isOnlineSession();
    const isGuest = peerMultiplayer.getRole() === 'guest';

    const winnerIdx = this.summary.matchWinnerIndex ?? this.summary.winnerIndex ?? 0;
    const winnerCfg = this.players.find((p) => p.index === winnerIdx) ?? this.players[0];
    const winnerPalette = getPaletteById(winnerCfg?.colorId ?? 'red');

    const confetti = this.add.particles(0, 0, 'vfx_shard', {
      x: { min: 220, max: DESIGN_WIDTH - 220 },
      y: -20,
      lifespan: 3400,
      speedY: { min: 70, max: 165 },
      speedX: { min: -40, max: 40 },
      rotate: { min: 0, max: 360 },
      scale: { start: 0.85, end: 0.45 },
      alpha: { start: 0.9, end: 0.2 },
      frequency: 110,
      tint: [winnerPalette.primary, winnerPalette.highlight, 0xffd54f, 0x43a047, 0x1e88e5],
    });

    const backdropAlpha = this.add
      .rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0x000000, 0.01);
    const contentRoot = this.add.container(0, 0);

    const panelW = 690;
    const panelH = 544;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2 - 10;

    const card = this.add.graphics();
    card.fillStyle(0x1d1f22, 0.14);
    card.fillRoundedRect(px - panelW / 2 + 5, py - panelH / 2 + 7, panelW, panelH, 16);
    card.fillStyle(UI_COLORS.cardBg, 1);
    card.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 16);
    card.fillStyle(winnerPalette.primary, 1);
    card.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, 86, {
      tl: 16,
      tr: 16,
      bl: 0,
      br: 0,
    });
    card.lineStyle(3.2, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 16);

    const champBadge = isOnline
      ? winnerIdx === 0
        ? ' (CHỦ PHÒNG)'
        : ' (KHÁCH)'
      : winnerCfg?.isAI
        ? ` (${getAIDifficultyDescriptor(winnerCfg.aiDifficulty).shortBadge})`
        : '';
    const title = this.add
      .text(px, py - panelH / 2 + 43, `XE ${winnerIdx + 1}${champBadge} CHIẾN THẮNG!`, {
        fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif",
        fontSize: '32px',
        fontStyle: '900',
        color: '#FFFFFF',
        stroke: '#18191B',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0.5);

    const pedestal = this.add
      .circle(px, py - 106, 50, 0xf5f6f8, 1)
      .setStrokeStyle(2.5, winnerPalette.primary, 0.85);
    this.heroTank = this.add
      .image(px, py - 102, `tank_${winnerPalette.id}_0`)
      .setScale(1.45)
      .setRotation(-Math.PI / 2);
    const crown = this.add.image(px, py - 154, 'ui_crown').setScale(1.1);
    this.tweens.add({
      targets: crown,
      y: py - 161,
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    contentRoot.add([card, title, pedestal, this.heroTank, crown]);

    const ranked = this.players
      .map((p) => ({
        player: p,
        score: this.summary.scores[p.index] ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    const listTopY = py - 22;
    const rowContainers: Phaser.GameObjects.Container[] = [];

    ranked.forEach((entry, rankIdx) => {
      const ry = listTopY + rankIdx * 52;
      const pal = getPaletteById(entry.player.colorId);
      const isChamp = entry.player.index === winnerIdx;

      const rowCont = this.add.container(px, ry);
      const row = this.add.graphics();
      row.fillStyle(isChamp ? 0xfff8e1 : 0xf4f6f8, 1);
      row.fillRoundedRect(-265, -21, 530, 42, 8);
      row.lineStyle(isChamp ? 2.4 : 1.5, isChamp ? UI_COLORS.accentGold : 0xd5d8de, 1);
      row.strokeRoundedRect(-265, -21, 530, 42, 8);

      const rankTxt = this.add
        .text(-240, 0, `#${rankIdx + 1}`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '16px',
          fontStyle: '900',
          color: UI_COLORS.inkMutedHex,
        })
        .setOrigin(0, 0.5);

      const icon = this.add.image(-182, 0, `tank_icon_${pal.id}`).setScale(0.75);

      const rowTag = isOnline
        ? entry.player.index === 0
          ? '  •  CHỦ PHÒNG'
          : '  •  KHÁCH'
        : entry.player.isAI
          ? `  •  ${getAIDifficultyDescriptor(entry.player.aiDifficulty).shortBadge}`
          : '';
      const nameTxt = this.add
        .text(-144, 0, `XE ${entry.player.index + 1}${rowTag}`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '16.5px',
          fontStyle: '800',
          color: pal.primaryHex,
        })
        .setOrigin(0, 0.5);

      const ptsTxt = this.add
        .text(240, 0, `${entry.score} ĐIỂM`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '19px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        })
        .setOrigin(1, 0.5);

      rowCont.add([row, rankTxt, icon, nameTxt, ptsTxt]);
      contentRoot.add(rowCont);
      rowContainers.push(rowCont);
    });

    const statsTxt = this.add
      .text(
        px,
        py + panelH / 2 - 80,
        `Tổng số hiệp đã đấu: ${this.summary.roundNumber}   •   Số hiệp hòa: ${this.summary.ties}`,
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '14px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
        },
      )
      .setOrigin(0.5, 0.5);

    const triggerRematch = () => {
      if (isGuest) return;
      if (isOnline && peerMultiplayer.getRole() === 'host') {
        const cfg = peerMultiplayer.hostTriggerRematch();
        if (cfg) {
          this.scene.start('GameScene', {
            freshMatch: true,
            seed: cfg.matchSeed,
            onlineMatch: cfg,
          });
          return;
        }
      }
      this.scene.start('GameScene', { freshMatch: true });
    };

    const rematchBtn = createArcadeButton(this, {
      x: px - 135,
      y: py + panelH / 2 - 34,
      width: 256,
      height: 48,
      label: isGuest ? 'CHỜ CHỦ PHÒNG ĐẤU LẠI…' : 'ĐẤU LẠI NGAY (ENTER)',
      fontSize: 15,
      fillColor: isGuest ? 0x90a4ae : 0x43a047,
      hoverColor: isGuest ? 0x90a4ae : 0x4caf50,
      textColor: '#FFFFFF',
      onClick: triggerRematch,
    });

    const menuBtn = createArcadeButton(this, {
      x: px + 148,
      y: py + panelH / 2 - 34,
      width: 224,
      height: 48,
      label: isOnline ? 'RỜI PHÒNG ONLINE' : 'VỀ TRANG CHỦ',
      fontSize: 15.5,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        if (isOnline) {
          peerMultiplayer.disconnect();
        }
        this.scene.start('MenuScene');
      },
    });

    contentRoot.add([statsTxt, rematchBtn.container, menuBtn.container]);
    animateModalOpen(this, backdropAlpha, contentRoot);
    animateStaggeredEntrance(this, rowContainers, 14, 55);

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.code === 'Enter' || e.code === 'Space') && !isGuest) {
        audioManager.playUiClick(false);
        triggerRematch();
      } else if (e.code === 'Escape') {
        audioManager.playUiClick(true);
        if (isOnline) peerMultiplayer.disconnect();
        this.scene.start('MenuScene');
      }
    };
    window.addEventListener('keydown', this.onKeyDownBound);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onKeyDownBound);
      confetti.destroy();
    });
  }

  update(_time: number, delta: number): void {
    if (this.heroTank?.active) {
      this.heroTank.rotation += (delta / 1000) * 0.9;
    }

    if (peerMultiplayer.getRole() === 'guest') {
      const events = peerMultiplayer.drainPendingEventsOnGuest();
      for (const ev of events) {
        if (ev.kind === 'rematch_start') {
          this.scene.start('GameScene', {
            freshMatch: true,
            seed: ev.config.matchSeed,
            onlineMatch: ev.config,
          });
          return;
        }
      }
    }
  }
}

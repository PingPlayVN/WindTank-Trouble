import type {
  AIDifficulty,
  GameSettings,
  PlayerKeyBindings,
  SkillId,
  TankColorPalette,
} from '../types/gameTypes';

export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 760;

export const ARENA_VIEWPORT = {
  topBarHeight: 46,
  bottomBarHeight: 112,
  maxWidth: 1080,
  maxHeight: 552,
  centerX: DESIGN_WIDTH / 2,
  centerY: 344,
} as const;

/**
 * Expanded vertical maze viewport with safe left/right thumb gutters (`x: 0..224` and `x: 1056..1280`)
 * and top compact score-pill header (`y: 0..96`) for Mobile Touch mode!
 */
export const MOBILE_ARENA_VIEWPORT = {
  topBarHeight: 76,
  bottomBarHeight: 16,
  maxWidth: 856,
  maxHeight: 644,
  centerX: DESIGN_WIDTH / 2,
  centerY: 414,
} as const;

export interface DeviceDetectProbe {
  search?: string;
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentDataMobile?: boolean;
  hoverNone?: boolean;
  pointerCoarse?: boolean;
}

export function isTouchDeviceDetected(probe?: DeviceDetectProbe): boolean {
  if (!probe && typeof window === 'undefined') return false;

  const search = probe?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (search) {
    try {
      const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
      const forced = params.get('device');
      if (forced === 'mobile') return true;
      if (forced === 'pc' || forced === 'desktop') return false;
    } catch {
      // Ignore URL parse issues
    }
  }

  const nav =
    !probe && typeof navigator !== 'undefined'
      ? (navigator as Navigator & {
          userAgentData?: { mobile?: boolean; platform?: string };
        })
      : undefined;

  const uaMobile = probe?.userAgentDataMobile ?? nav?.userAgentData?.mobile;
  if (uaMobile === true) {
    return true;
  }

  const ua = probe?.userAgent ?? nav?.userAgent ?? '';

  // Dedicated Mobile / Tablet OS User-Agents (Android, iPhone, iPad, iPod, Mobile browsers)
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }

  const maxTouch = probe?.maxTouchPoints ?? nav?.maxTouchPoints ?? 0;
  const hoverNone =
    probe?.hoverNone ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: none)').matches);

  // iPadOS 13+ (reports "Macintosh" in UA, has multi-touch, and primary input has no hover)
  if (/Macintosh/i.test(ua) && maxTouch > 1 && hoverNone) {
    return true;
  }

  // Explicit Desktop OS guard: Windows / Desktop Linux / explicit non-mobile Client Hint MUST stay in PC mode,
  // even on touchscreen laptops, pen tablets, or Remote Desktop sessions!
  if (uaMobile === false || /Windows NT|Win64|WOW64|Linux x86_64/i.test(ua)) {
    return false;
  }

  const pointerCoarse =
    probe?.pointerCoarse ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches);

  return Boolean(pointerCoarse && hoverNone);
}

export const UI_COLORS = {
  pageBg: 0xdcdedf,
  pageBgHex: '#DCDEDF',
  menuBg: 0xeeeeec,
  menuBgHex: '#EEEEEC',
  arenaFloor: 0xf3f3f1,
  arenaFloorHex: '#F3F3F1',
  arenaGridLine: 0xe6e6e2,
  wallFill: 0x4b4e53,
  wallFillHex: '#4B4E53',
  wallHighlight: 0x656970,
  wallStroke: 0x222428,
  wallStrokeHex: '#222428',
  inkDark: 0x1d1f22,
  inkDarkHex: '#1D1F22',
  inkMuted: 0x5c6066,
  inkMutedHex: '#5C6066',
  cardBg: 0xffffff,
  cardBgHex: '#FFFFFF',
  cardAltBg: 0xe7e9ec,
  accentGold: 0xf9a825,
  accentGoldHex: '#F9A825',
  dangerRed: 0xd32f2f,
  dangerRedHex: '#D32F2F',
  successGreen: 0x2e7d32,
  successGreenHex: '#2E7D32',
} as const;

export const TANK_PALETTES: readonly TankColorPalette[] = [
  {
    id: 'red',
    name: 'Đỏ Thẫm',
    primary: 0xe53935,
    primaryHex: '#E53935',
    highlight: 0xff6f60,
    highlightHex: '#FF6F60',
    shadow: 0xab000d,
    shadowHex: '#AB000D',
    tread: 0x2b2d30,
    outline: 0x18191b,
  },
  {
    id: 'green',
    name: 'Ngọc Lục',
    primary: 0x43a047,
    primaryHex: '#43A047',
    highlight: 0x76d275,
    highlightHex: '#76D275',
    shadow: 0x1b5e20,
    shadowHex: '#1B5E20',
    tread: 0x2b2d30,
    outline: 0x18191b,
  },
  {
    id: 'blue',
    name: 'Xanh Lam',
    primary: 0x1e88e5,
    primaryHex: '#1E88E5',
    highlight: 0x6ab7ff,
    highlightHex: '#6AB7FF',
    shadow: 0x0d47a1,
    shadowHex: '#0D47A1',
    tread: 0x2b2d30,
    outline: 0x18191b,
  },
  {
    id: 'gold',
    name: 'Hổ Phách',
    primary: 0xf9a825,
    primaryHex: '#F9A825',
    highlight: 0xffd95a,
    highlightHex: '#FFD95A',
    shadow: 0xc17900,
    shadowHex: '#C17900',
    tread: 0x2b2d30,
    outline: 0x18191b,
  },
  {
    id: 'purple',
    name: 'Tím Huyền',
    primary: 0x8e24aa,
    primaryHex: '#8E24AA',
    highlight: 0xc158dc,
    highlightHex: '#C158DC',
    shadow: 0x5c007a,
    shadowHex: '#5C007A',
    tread: 0x2b2d30,
    outline: 0x18191b,
  },
  {
    id: 'cyan',
    name: 'Xanh Ngọc',
    primary: 0x00acc1,
    primaryHex: '#00ACC1',
    highlight: 0x5ddef4,
    highlightHex: '#5DDEF4',
    shadow: 0x007c91,
    shadowHex: '#007C91',
    tread: 0x2b2d30,
    outline: 0x18191b,
  },
] as const;

export function getPaletteById(id: string): TankColorPalette {
  return TANK_PALETTES.find((p) => p.id === id) ?? TANK_PALETTES[0];
}

export const BASE_GAMEPLAY = {
  referenceCellSize: 84,
  wallThickness: 8,
  tankForwardSpeed: 163.8, // 0.9x of 182 for tighter tactical maze control
  tankBackwardSpeed: 117, // 0.9x of 130
  tankTurnSpeedRad: 3.65,
  tankVelocityLerp: 18,
  tankRadius: 14.5,
  tankBarrelLength: 21,
  projectileSpeed: 296,
  projectileRadius: 4.5,
  maxProjectilesPerTank: 10,
  projectileLifetimeSec: 11.5,
  projectileMaxBounces: 14,
  fireCooldownSec: 0.14,
  fireBufferWindowSec: 0.12,
  selfHitGraceSec: 0.065,
  roundCountdownSec: 1.5,
  roundAftermathSec: 1.75,
  roundEndBannerSec: 1.35,
} as const;

export const DEFAULT_PLAYER_BINDINGS: [
  PlayerKeyBindings,
  PlayerKeyBindings,
  PlayerKeyBindings,
  PlayerKeyBindings,
] = [
  {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    fire: 'Space',
  },
  {
    forward: 'ArrowUp',
    backward: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    fire: 'Enter',
  },
  {
    forward: 'KeyI',
    backward: 'KeyK',
    left: 'KeyJ',
    right: 'KeyL',
    fire: 'KeyU',
  },
  {
    forward: 'Numpad8',
    backward: 'Numpad5',
    left: 'Numpad4',
    right: 'Numpad6',
    fire: 'Numpad0',
  },
];

export const WINNING_SCORE_OPTIONS = [0, 3, 5, 7, 10, 15, 25] as const;

export function normalizeWinningScore(raw: number): number {
  if (!Number.isFinite(raw)) return 5;
  const rounded = Math.round(raw);
  if (rounded <= 0) return 0; // 0 = Unlimited mode
  return Math.min(999, rounded);
}

export function parseCustomScoreInput(rawBuffer: string, fallbackScore: number): number {
  const trimmed = rawBuffer.trim();
  if (!trimmed) return normalizeWinningScore(fallbackScore);
  if (!/^\d+$/.test(trimmed)) return normalizeWinningScore(fallbackScore);
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return normalizeWinningScore(fallbackScore);
  if (parsed <= 0) return 0;
  return Math.min(999, parsed);
}

export function stepWinningScore(current: number, delta: 1 | -1): number {
  const cur = normalizeWinningScore(current);
  if (delta < 0) {
    if (cur === 1) return 0; // 1 -> Unlimited
    if (cur === 0) return 99; // Unlimited -> 99
    return cur - 1;
  }
  if (cur === 0) return 1; // Unlimited -> 1
  if (cur >= 999) return 0;
  return cur + 1;
}

export function formatWinningScoreLabel(score: number, compact = false): string {
  const norm = normalizeWinningScore(score);
  if (norm === 0) {
    return compact ? '∞ VÔ TẬN' : 'ĐIỂM THẮNG: ∞ VÔ TẬN';
  }
  return compact ? `THẮNG: ${norm} ĐIỂM` : `ĐẠT TRƯỚC: ${norm} ĐIỂM`;
}

export function normalizeCrateSpawnInterval(raw: number): number {
  if (!Number.isFinite(raw)) return 20;
  const rounded = Math.round(raw);
  if (rounded <= 0) return 0; // 0 = Power-Up Crates OFF
  return Math.min(300, rounded);
}

export function parseCustomIntervalInput(rawBuffer: string, fallbackSec: number): number {
  const trimmed = rawBuffer.trim();
  if (!trimmed) return normalizeCrateSpawnInterval(fallbackSec);
  if (!/^\d+$/.test(trimmed)) return normalizeCrateSpawnInterval(fallbackSec);
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return normalizeCrateSpawnInterval(fallbackSec);
  if (parsed <= 0) return 0;
  return Math.min(300, parsed);
}

export function stepCrateSpawnInterval(current: number, delta: 1 | -1): number {
  const cur = normalizeCrateSpawnInterval(current);
  if (delta < 0) {
    if (cur === 1) return 0; // 1s -> OFF
    if (cur === 0) return 120; // OFF -> 120s
    return cur - 1;
  }
  if (cur === 0) return 1; // OFF -> 1s
  if (cur >= 300) return 0;
  return cur + 1;
}

export function formatCrateSpawnIntervalLabel(sec: number, compact = false): string {
  const norm = normalizeCrateSpawnInterval(sec);
  if (norm === 0) {
    return compact ? 'THÙNG: TẮT' : 'THÙNG GỖ: TẮT';
  }
  return compact ? `THÙNG: ${norm}s` : `THÙNG RƠI: ${norm} GIÂY`;
}

export function normalizeMaxCrates(raw: number): number {
  if (!Number.isFinite(raw)) return 4;
  return Math.max(1, Math.min(12, Math.round(raw)));
}

export interface AIDifficultyDescriptor {
  id: AIDifficulty;
  label: string;
  shortBadge: string;
  fillColor: number;
  hoverColor: number;
  textHex: string;
  summary: string;
}

export const AI_DIFFICULTY_ORDER: readonly AIDifficulty[] = [
  'easy',
  'normal',
  'hard',
  'super_hard',
] as const;

export const AI_DIFFICULTY_DESCRIPTORS: readonly AIDifficultyDescriptor[] = [
  {
    id: 'easy',
    label: 'DỄ',
    shortBadge: 'AI DỄ',
    fillColor: 0x43a047,
    hoverColor: 0x4caf50,
    textHex: '#2E7D32',
    summary: 'Đi tuần chậm • Bắn thẳng trực diện • Không né đạn',
  },
  {
    id: 'normal',
    label: 'B.THƯỜNG',
    shortBadge: 'AI THƯỜNG',
    fillColor: 0x1e88e5,
    hoverColor: 0x2196f3,
    textHex: '#1565C0',
    summary: 'Dò đường mê cung • Nảy tường 1 góc • Né đạn cơ bản',
  },
  {
    id: 'hard',
    label: 'KHÓ',
    shortBadge: 'AI KHÓ',
    fillColor: 0xfb8c00,
    hoverColor: 0xff9800,
    textHex: '#EF6C00',
    summary: 'Tính nảy 2 góc • Chủ động né đạn/bẫy • Tranh thùng gỗ',
  },
  {
    id: 'super_hard',
    label: 'SIÊU KHÓ',
    shortBadge: 'AI SIÊU KHÓ',
    fillColor: 0xe53935,
    hoverColor: 0xf44336,
    textHex: '#C62828',
    summary: 'Nảy 3 góc chuẩn xác • Né đạn vây • Làm chủ 10 kỹ năng',
  },
] as const;

export function getAIDifficultyDescriptor(diff: AIDifficulty): AIDifficultyDescriptor {
  return AI_DIFFICULTY_DESCRIPTORS.find((d) => d.id === diff) ?? AI_DIFFICULTY_DESCRIPTORS[1];
}

export interface SkillDescriptor {
  id: SkillId;
  name: string;
  hudShort: string;
  suitTitle: string;
  weight: number;
  dropPercent: number;
  ammo: number;
  ammoLabel: string;
  accentColor: number;
  accentHex: string;
  summary: string;
  traits: readonly string[];
}

export const POWERUP_CONFIG = {
  spawnIntervalSec: 20,
  maxCratesOnFloor: 4,
  crateRadius: 13,
  // 1. Laser
  laserChargeSec: 2.0,
  laserAutoAimConeDeg: 15,
  laserBeamHalfWidth: 5.5,
  // 2. Spike
  spikeFlightDetonateSec: 3.0,
  spikeRadiusMultiplier: 1.28,
  spikeSpeedMultiplier: 0.82,
  spikeShrapnelCount: 16,
  spikeShrapnelSpeedMultiplier: 1.22,
  spikeShrapnelLifetimeSec: 0.55,
  spikeGroundDurationSec: 5.0,
  spikeGroundRadius: 36,
  spikeGroundNodeCount: 14,
  spikeGroundNodeRadius: 4.8,
  // 3. Gatling (with tactical recoil kick + barrel bloom)
  gatlingAmmo: 20,
  gatlingCooldownSec: 0.068,
  gatlingRadiusMultiplier: 0.72,
  gatlingSpeedMultiplier: 1.36,
  gatlingMaxBounces: 10,
  gatlingLifetimeSec: 8.5,
  gatlingRecoilImpulse: 22,
  gatlingSpreadRad: 0.068, // ~+-3.9 deg recoil bloom
  // 4. Homing
  homingBallisticSec: 4.0,
  homingTotalLifetimeSec: 16.0,
  homingRadiusMultiplier: 1.08,
  homingBallisticSpeedMultiplier: 0.95,
  homingSeekSpeedMultiplier: 1.14,
  homingTurnRateRad: 11.5,
  // 5. Scatter (Pháo Chùm Hải Tặc)
  scatterAmmo: 3,
  scatterPelletCount: 5,
  scatterSpreadStepRad: 0.155, // ~8.9 deg per step -> +-17.8 deg fan
  scatterSpeedMultiplier: 1.16,
  scatterRadiusMultiplier: 0.84,
  scatterMaxBounces: 7,
  scatterLifetimeSec: 5.2,
  scatterCooldownSec: 0.42,
  scatterRecoilImpulse: 45,
  // 6. Mine (Mìn Bóng Ma)
  mineAmmo: 3,
  mineCooldownSec: 0.3,
  mineArmingSec: 1.6,
  mineDurationSec: 28.0,
  mineTriggerRadius: 26,
  mineBlastRadius: 46,
  // 7. Flame (Hỏa Long Phun Lửa — ultra-long corridor reach & dense inferno stream!)
  flameAmmo: 80,
  flameCooldownSec: 0.024,
  flameSpreadRad: 0.16,
  flameSpeedMultiplier: 1.96,
  flameLifetimeSec: 1.38,
  flameStartRadius: 5.0,
  flameEndRadius: 18.5,
  flameDragPerSec: 0.78,
  // 8. Drill (Mũi Khoan Địa Chấn)
  drillAmmo: 2,
  drillWallsPerShot: 4,
  drillSpeedMultiplier: 1.18,
  drillRadiusMultiplier: 1.16,
  drillCooldownSec: 0.36,
  drillLifetimeSec: 9.0,
  // 9. Shield (Khiên Từ Trường)
  shieldDurationSec: 5.5,
  shieldRadiusFactor: 1.68,
  shieldReflectSpeedBoost: 1.18,
  // 10. Reaper (Lưỡi Hái Tử Thần — Obsidian-Black & Crimson-Red, halved to 0.8375 rad/s, exact 180-deg sweep!)
  reaperWindupSec: 0.55,
  reaperSpinSpeedRad: 0.8375,
  reaperSpinDurationSec: Math.PI / 0.8375,
  reaperBladeCellsLength: 4.7,
  reaperBladeHalfWidth: 7.5,
} as const;

export const SKILL_DESCRIPTORS: readonly SkillDescriptor[] = [
  {
    id: 'scatter',
    name: 'PHÁO CHÙM HẢI TẶC',
    hudShort: 'PHÁO CHÙM',
    suitTitle: 'Giáp Hải Tặc Pháo Chùm',
    weight: 15,
    dropPercent: 15,
    ammo: POWERUP_CONFIG.scatterAmmo,
    ammoLabel: '3 LOẠT × 5 VIÊN',
    accentColor: 0x2979ff,
    accentHex: '#2979FF',
    summary: 'Khai hỏa chùm 5 viên đạn quạt cực rát, phủ kín các khúc cua hẹp.',
    traits: [
      '3 loạt bắn • Mỗi phát tung ra 5 viên đạn chùm góc quạt ±18°',
      'Đạn bay nhanh hơn 16%, nảy tường liên hoàn kèm lực giật lùi chiến thuật',
      'Khắc chế cực mạnh các pha đối đầu trực diện hoặc rải đạn ngã tư',
    ],
  },
  {
    id: 'gatling',
    name: 'ĐẠN LIÊN THANH',
    hudShort: 'LIÊN THANH',
    suitTitle: 'Giáp Chiến Binh Bão Đạn',
    weight: 14,
    dropPercent: 14,
    ammo: POWERUP_CONFIG.gatlingAmmo,
    ammoLabel: '20 VIÊN',
    accentColor: 0xfb8c00,
    accentHex: '#FB8C00',
    summary: 'Băng đạn 20 viên tốc độ cao kèm lực giật lùi nòng cực phấn khích.',
    traits: [
      '20 viên đạn vật lý nhỏ gọn • Nảy tường như đạn thường',
      'Tốc độ bay +36%, xả đạn liên thanh cực gắt kèm độ giật lùi thân xe & rung nòng!',
      'Hết 20 viên tự động quay về giáp và đạn mặc định',
    ],
  },
  {
    id: 'mine',
    name: 'MÌN BÓNG MA',
    hudShort: 'MÌN TÀNG HÌNH',
    suitTitle: 'Giáp Đặc Công Bóng Đêm',
    weight: 13,
    dropPercent: 13,
    ammo: POWERUP_CONFIG.mineAmmo,
    ammoLabel: '3 QUẢ MÌN',
    accentColor: 0x455a64,
    accentHex: '#455A64',
    summary: 'Rải mìn cảm ứng sau đuôi xe, tự động tàng hình sau 1.6s gài chốt.',
    traits: [
      '3 quả mìn thả sau đuôi xe • Có 1.6s nhấp nháy chờ gài chốt an toàn',
      'Sau khi gài chốt sẽ TÀNG HÌNH trên sàn (chỉ lóe sáng mờ chu kỳ 3.2s)',
      'Phát nổ cực mạnh khi có xe đi gần hoặc bị đạn/tia lửa quét trúng!',
    ],
  },
  {
    id: 'flame',
    name: 'HỎA LONG PHUN LỬA',
    hudShort: 'PHUN LỬA',
    suitTitle: 'Giáp Hỏa Long Nhiệt Hạch',
    weight: 12,
    dropPercent: 12,
    ammo: POWERUP_CONFIG.flameAmmo,
    ammoLabel: '80 LUỒNG LỬA DÀY',
    accentColor: 0xff3d00,
    accentHex: '#FF3D00',
    summary: 'Phun bão lửa dày đặc tầm cực xa dọc hành lang, đốt cháy cả xe địch lẫn đạn bay tới.',
    traits: [
      'Bình nhiên liệu 80 nhịp phun kép siêu dày, vươn xa xuyên suốt cả dãy hành lang dài!',
      'ĐỐT CHÁY & TIÊU HỦY toàn bộ đạn vật lý bay ngược chiều vào biển lửa',
      'Trượt ôm theo góc tường mê cung kèm tàn lửa & khói nhiệt hạch rực cháy',
    ],
  },
  {
    id: 'spike',
    name: 'ĐẠN GAI SẮT',
    hudShort: 'ĐẠN GAI',
    suitTitle: 'Giáp Thiết Giáp Gai Sắt',
    weight: 11,
    dropPercent: 11,
    ammo: 1,
    ammoLabel: '1 CẦU GAI',
    accentColor: 0x6d4c41,
    accentHex: '#6D4C41',
    summary: 'Đạn cầu gai cỡ lớn, bay 3s sẽ phát nổ văng gai sắt và cắm bẫy gai trên sàn.',
    traits: [
      '1 viên to & chậm hơn đạn thường • Nảy tường vật lý trong 3s đầu',
      'Sau 3s (hoặc khi trúng xe) nổ tung 16 mảnh gai sắt bay tỏa 360°',
      'Để lại bãi gai sắt sát thương trên mặt đất trong 5s tiêu diệt mọi xe cán qua',
    ],
  },
  {
    id: 'drill',
    name: 'MŨI KHOAN ĐỊA CHẤN',
    hudShort: 'MŨI KHOAN',
    suitTitle: 'Giáp Khoan Phá Địa Chấn',
    weight: 10,
    dropPercent: 10,
    ammo: POWERUP_CONFIG.drillAmmo,
    ammoLabel: '2 MŨI KHOAN',
    accentColor: 0xf9a825,
    accentHex: '#F57F17',
    summary: 'Đạn mũi khoan xoay siêu tốc đục thủng các bức tường ngăn mê cung.',
    traits: [
      '2 mũi khoan hạng nặng • Mỗi mũi ĐỤC THỦNG tối đa 4 bức tường nội khu!',
      'Mở thông đường tắt mới ngay lập tức (giữ nguyên tường bao viền ngoài)',
      'Xuyên tường đánh úp bất ngờ các mục tiêu đang cố thủ trong góc kín',
    ],
  },
  {
    id: 'shield',
    name: 'KHIÊN TỪ TRƯỜNG',
    hudShort: 'KHIÊN HỘ THỂ',
    suitTitle: 'Giáp Hộ Vệ Từ Trường',
    weight: 9,
    dropPercent: 9,
    ammo: 1,
    ammoLabel: '5.5 GIÂY HỘ THỂ',
    accentColor: 0x00bfa5,
    accentHex: '#00897B',
    summary: 'Bật vòm từ trường 5.5s phản ngược đạn địch và chặn đứng Laser/Mìn/Gai.',
    traits: [
      'Bấm bắn để bật Khiên Từ Trường trong 5.5s (vẫn bắn đạn thường tự do!)',
      'PHẢN NGƯỢC & CƯỚP QUYỀN SỞ HỮU mọi viên đạn lao vào vòm khiên!',
      'Miễn nhiễm hoàn toàn tia Laser, Lưỡi Hái, Mìn Bóng Ma và bẫy Gai Sắt',
    ],
  },
  {
    id: 'homing',
    name: 'ĐẠN ĐỊNH VỊ',
    hudShort: 'ĐỊNH VỊ',
    suitTitle: 'Giáp Chiến Cơ Tầm Nhiệt',
    weight: 8,
    dropPercent: 8,
    ammo: 1,
    ammoLabel: '1 TÊN LỬA',
    accentColor: 0xe53935,
    accentHex: '#E53935',
    summary: 'Tên lửa nảy tường 4s đầu rồi bật radar tìm đường ngắn nhất qua mê cung.',
    traits: [
      '4s đầu nảy tường như đạn vật lý • Sau 4s kích hoạt động cơ dò tìm',
      'Tự luồn lách theo đường ngắn nhất mê cung tới xe gần nhất (KỂ CẢ NGƯỜI BẮN!)',
      'Tự động đổi mục tiêu ngay lập tức nếu có xe khác tiến lại gần hơn',
    ],
  },
  {
    id: 'laser',
    name: 'LASER SIÊU CẤP',
    hudShort: 'LASER',
    suitTitle: 'Giáp Quang Năng Tối Thượng',
    weight: 5,
    dropPercent: 5,
    ammo: 1,
    ammoLabel: '1 TIA XUYÊN MAP',
    accentColor: 0x0091ea,
    accentHex: '#0091EA',
    summary: 'Tụ lực 2s bắn tia laser xanh dương xuyên toàn bộ tường mê cung.',
    traits: [
      'Tụ lực 2s trước khi khai hỏa (trong lúc tụ lực KHÔNG THỂ di chuyển & xoay)',
      'Tia laser xanh dương chiếu xuyên thấu toàn bộ bản đồ bất chấp tường chắn',
      'Đối thủ nằm trong góc ±15° trước nòng sẽ hút tia uốn cong parabol trúng đích!',
    ],
  },
  {
    id: 'reaper',
    name: 'LƯỠI HÁI TỬ THẦN',
    hudShort: 'LƯỠI HÁI ĐỎ',
    suitTitle: 'Giáp Tử Thần Huyết Ảnh',
    weight: 3,
    dropPercent: 3,
    ammo: 1,
    ammoLabel: 'QUÉT 180° ĐỎ-ĐEN',
    accentColor: 0xd50000,
    accentHex: '#C62828',
    summary: 'CỰC HIẾM: Triệu hồi đại lưỡi liềm Đỏ-Đen khổng lồ xuyên tường, quét chậm 180°.',
    traits: [
      'Tụ huyết ấn 0.55s rồi bung đôi lưỡi hái Đen-Đỏ dài 4.7 ô có 2 đầu LƯỠI LIỀM sắc lẹm!',
      'Xoay trầm hùng 180° (2 cánh đối xứng quét sạch trọn 360° quanh xe, vẫn lái xe được)',
      'Chém hạ mọi đối thủ không có Khiên Từ Trường chạm vào trục hắc ám hoặc lưỡi liềm đỏ',
    ],
  },
] as const;

export const ALL_SKILL_IDS: readonly SkillId[] = SKILL_DESCRIPTORS.map((s) => s.id);

export function getSkillDescriptor(id: SkillId): SkillDescriptor {
  return SKILL_DESCRIPTORS.find((s) => s.id === id) ?? SKILL_DESCRIPTORS[0];
}

export const DEFAULT_SETTINGS: GameSettings = {
  playerCount: 2,
  winningScore: 5,
  mapMode: 'mix',
  powerUpSpawnIntervalSec: POWERUP_CONFIG.spawnIntervalSec,
  maxCratesOnFloor: POWERUP_CONFIG.maxCratesOnFloor,
  enabledSkills: [...ALL_SKILL_IDS],
  playerIsAI: [false, false, false, false],
  playerAIDifficulty: ['normal', 'normal', 'normal', 'normal'],
  touchScheme: 'vector_stick',
  touchSensitivity: 1.0,
  touchAimZone: 0.42,
  touchButtonScale: 1.0,
  touchFloatingStick: true,
  touchSwapHands: false,
  soundEnabled: true,
  masterVolume: 0.75,
  screenShake: true,
  playerColors: ['red', 'green', 'blue', 'gold'],
  playerBindings: [
    { ...DEFAULT_PLAYER_BINDINGS[0] },
    { ...DEFAULT_PLAYER_BINDINGS[1] },
    { ...DEFAULT_PLAYER_BINDINGS[2] },
    { ...DEFAULT_PLAYER_BINDINGS[3] },
  ],
};

export function formatKeyCodeLabel(code: string): string {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) {
    const rest = code.slice(6);
    const shortMap: Record<string, string> = {
      Add: 'Num+',
      Subtract: 'Num-',
      Multiply: 'Num*',
      Divide: 'Num/',
      Decimal: 'Num.',
      Enter: 'NumEnt',
    };
    return shortMap[rest] ?? `Num${rest}`;
  }
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Enter: 'Enter',
    ShiftLeft: 'LShift',
    ShiftRight: 'RShift',
    ControlLeft: 'LCtrl',
    ControlRight: 'RCtrl',
    AltLeft: 'LAlt',
    AltRight: 'RAlt',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    Tab: 'Tab',
  };
  return map[code] ?? code;
}

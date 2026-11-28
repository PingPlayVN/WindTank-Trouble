import type { AIDifficulty, AITacticId, BattleModeId } from '../types/gameTypes';

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
    summary: 'Nảy 3 góc chuẩn xác • Né đạn vây • Làm chủ 15 kỹ năng',
  },
] as const;

export function getAIDifficultyDescriptor(diff: AIDifficulty): AIDifficultyDescriptor {
  return AI_DIFFICULTY_DESCRIPTORS.find((d) => d.id === diff) ?? AI_DIFFICULTY_DESCRIPTORS[1];
}

export interface BattleModeDescriptor {
  id: BattleModeId;
  title: string;
  shortBadge: string;
  tagline: string;
  accentColor: number;
  accentHex: string;
  bgTint: number;
  hasArmorHp: boolean;
  isNightOps: boolean;
  defaultTntBarrels: boolean;
  bullets: readonly string[];
}

export const BATTLE_MODE_ORDER: readonly BattleModeId[] = [
  'classic',
  'armored_tnt',
  'night_ops',
  'night_armored',
];

export const BATTLE_MODE_DESCRIPTORS: readonly BattleModeDescriptor[] = [
  {
    id: 'classic',
    title: 'CỔ ĐIỂN (1 VIÊN HẠ)',
    shortBadge: '☀️ CỔ ĐIỂN',
    tagline: 'Ban ngày rõ nét • 1 phát tiêu diệt ngay',
    accentColor: 0xf57c00,
    accentHex: '#E65100',
    bgTint: 0xfff8e1,
    hasArmorHp: false,
    isNightOps: false,
    defaultTntBarrels: false,
    bullets: [
      'Ánh sáng chiến trường rõ nét 100%',
      'Trúng 1 viên đạn hoặc kỹ năng là nổ tung ngay',
      'Thiên về phản xạ né đạn & căn góc nảy tường',
    ],
  },
  {
    id: 'armored_tnt',
    title: 'ĐỘ BỀN GIÁP & TNT',
    shortBadge: '🛡️ GIÁP HP + TNT',
    tagline: 'Giáp 100 HP • Sát thương riêng • Thùng nổ phá tường',
    accentColor: 0xc62828,
    accentHex: '#C62828',
    bgTint: 0xffebee,
    hasArmorHp: true,
    isNightOps: false,
    defaultTntBarrels: true,
    bullets: [
      'Mỗi xe có Thanh Độ Bền Giáp (100–200 HP)',
      'Bốc khói, bén lửa & chập điện khi giáp sắp vỡ',
      'Thùng nổ TNT kích nổ dây chuyền thổi bay tường mê cung',
    ],
  },
  {
    id: 'night_ops',
    title: 'CHIẾN ĐẤU BÓNG TỐI',
    shortBadge: '🔦 BÓNG TỐI',
    tagline: 'Shader Đèn Pha Đôi • Đạn Pháo Sáng 360° mở đường',
    accentColor: 0x1565c0,
    accentHex: '#0D47A1',
    bgTint: 0xe3f2fd,
    hasArmorHp: false,
    isNightOps: true,
    defaultTntBarrels: false,
    bullets: [
      'Bóng đêm đặc 100% + Shader Đèn Pha Đôi đổ bóng mềm',
      'Đạn bắn ra hóa Pháo Sáng 360° soi rõ lối đi & ngã rẽ',
      'Đối thủ, Hòm gỗ & Mìn ẩn kín cho tới khi trúng ánh sáng',
    ],
  },
  {
    id: 'night_armored',
    title: 'ĐÊM TỬ CHIẾN (TỔNG LỰC)',
    shortBadge: '⚡ ĐÊM TỬ CHIẾN',
    tagline: 'Shader Đèn Pha + Đạn Pháo Sáng + Giáp HP & TNT',
    accentColor: 0x6a1b9a,
    accentHex: '#4A148C',
    bgTint: 0xf3e5f5,
    hasArmorHp: true,
    isNightOps: true,
    defaultTntBarrels: true,
    bullets: [
      'Shader Đèn Pha Đôi + Đạn Pháo Sáng dò đường trong đêm',
      'Thanh Độ Bền Giáp HP + Thùng nổ TNT ẩn kín phá tường',
      'Bắn pháo sáng soi góc khuất & kích nổ TNT đánh úp',
    ],
  },
];

export function getBattleModeDescriptor(id: BattleModeId): BattleModeDescriptor {
  return BATTLE_MODE_DESCRIPTORS.find((m) => m.id === id) ?? BATTLE_MODE_DESCRIPTORS[0];
}

export interface AITacticDescriptor {
  id: AITacticId;
  label: string;
  shortLabel: string;
  desc: string;
}

export const AI_TACTIC_ORDER: readonly AITacticId[] = ['balanced', 'rusher', 'sniper', 'camper'];

export const AI_TACTIC_DESCRIPTORS: readonly AITacticDescriptor[] = [
  {
    id: 'balanced',
    label: '🤖 CÂN BẰNG',
    shortLabel: '🤖 CÂN BẰNG',
    desc: 'Công thủ toàn diện, vừa nhặt thùng gỗ vừa căn góc bắn',
  },
  {
    id: 'rusher',
    label: '⚔️ XUNG KÍCH',
    shortLabel: '⚔️ XUNG KÍCH',
    desc: 'Áp sát tốc độ cao, dồn ép cận chiến liên tục',
  },
  {
    id: 'sniper',
    label: '🎯 BẮN TỈA',
    shortLabel: '🎯 BẮN TỈA',
    desc: 'Giữ cự ly an toàn, ưu tiên đạn nảy xa cực chuẩn',
  },
  {
    id: 'camper',
    label: '⛺ PHỤC KÍCH',
    shortLabel: '⛺ PHỤC KÍCH',
    desc: 'Thủ chắc hành lang, gài bẫy & chờ sơ hở phản kích',
  },
];

export function getAITacticDescriptor(id: AITacticId): AITacticDescriptor {
  return AI_TACTIC_DESCRIPTORS.find((t) => t.id === id) ?? AI_TACTIC_DESCRIPTORS[0];
}

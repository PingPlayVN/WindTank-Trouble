const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Normalizes user-entered room codes (`"wt-4829"`, `"4829"`, `"WT4829"`) into a 4-char uppercase key (`"4829"`).
 */
export function normalizeRoomCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const stripped = cleaned.startsWith('WT') && cleaned.length >= 6 ? cleaned.slice(2) : cleaned;
  return stripped.slice(0, 6);
}

/**
 * Formats a normalized room key as a 6-character human-friendly room badge (`"WT-4829"`).
 */
export function formatRoomCode(raw: string): string {
  const key = normalizeRoomCode(raw);
  return key ? `WT-${key}` : 'WT-----';
}

export function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export function peerIdFromRoomCode(raw: string): string {
  const key = normalizeRoomCode(raw);
  return `windtank-p2p-v1-${key.toLowerCase()}`;
}

export function extractRoomCodeFromSearch(search: string): string | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const raw = params.get('room');
    if (!raw) return null;
    const norm = normalizeRoomCode(raw);
    return norm.length >= 4 ? norm : null;
  } catch {
    return null;
  }
}

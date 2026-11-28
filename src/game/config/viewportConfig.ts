export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 760;
export const MAX_MOBILE_LOGICAL_WIDTH = 1680;

export function computeMobileLogicalWidth(
  availW: number,
  availH: number,
  isMobile: boolean,
): number {
  if (!isMobile || availW <= 0 || availH <= 0) {
    return DESIGN_WIDTH;
  }
  const rawW = Math.round((availW / availH) * DESIGN_HEIGHT);
  const evenW = rawW + (rawW % 2);
  return Math.max(DESIGN_WIDTH, Math.min(MAX_MOBILE_LOGICAL_WIDTH, evenW));
}

export const ARENA_VIEWPORT = {
  topBarHeight: 46,
  bottomBarHeight: 112,
  maxWidth: 1080,
  maxHeight: 552,
  centerX: DESIGN_WIDTH / 2,
  centerY: 344,
} as const;

export const MOBILE_ARENA_VIEWPORT = {
  topBarHeight: 74,
  bottomBarHeight: 12,
  maxWidth: 872,
  maxHeight: 668,
  centerX: DESIGN_WIDTH / 2,
  centerY: 415,
} as const;

export function resolveLocalMobileArenaViewport(logicalWidth: number): {
  readonly topBarHeight: number;
  readonly bottomBarHeight: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly centerX: number;
  readonly centerY: number;
} {
  const safeLogicalW = Number.isFinite(logicalWidth)
    ? Math.max(DESIGN_WIDTH, Math.min(MAX_MOBILE_LOGICAL_WIDTH, Math.round(logicalWidth)))
    : DESIGN_WIDTH;
  const dynamicMaxW = Math.max(824, Math.min(1096, safeLogicalW - 496));
  return {
    topBarHeight: MOBILE_ARENA_VIEWPORT.topBarHeight,
    bottomBarHeight: MOBILE_ARENA_VIEWPORT.bottomBarHeight,
    maxWidth: dynamicMaxW,
    maxHeight: 668,
    centerX: DESIGN_WIDTH / 2,
    centerY: 415,
  };
}

export const CROSS_PLATFORM_ARENA_VIEWPORT = {
  topBarHeight: 86,
  bottomBarHeight: 114,
  maxWidth: 872,
  maxHeight: 540,
  centerX: DESIGN_WIDTH / 2,
  centerY: 368,
} as const;

export function resolveOnlineArenaViewport(
  hostTouchActive: boolean,
  guestTouchActive: boolean,
): {
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly centerX: number;
  readonly centerY: number;
} {
  if (hostTouchActive && guestTouchActive) {
    return MOBILE_ARENA_VIEWPORT;
  }
  if (!hostTouchActive && !guestTouchActive) {
    return ARENA_VIEWPORT;
  }
  return CROSS_PLATFORM_ARENA_VIEWPORT;
}

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

  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }

  const maxTouch = probe?.maxTouchPoints ?? nav?.maxTouchPoints ?? 0;
  const hoverNone =
    probe?.hoverNone ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: none)').matches);

  if (/Macintosh/i.test(ua) && maxTouch > 1 && hoverNone) {
    return true;
  }

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

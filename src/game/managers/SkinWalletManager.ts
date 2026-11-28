import type { TankSkinId } from '../types/gameTypes';

const OWNED_SKINS_GLOBAL_KEY = 'windtank_owned_skins_v1';
const OWNED_SKINS_USER_PREFIX = 'windtank_owned_skins_';

export interface WindHubWalletSnapshot {
  connectedToWindHub: boolean;
  authenticated: boolean;
  online: boolean;
  uid: string | null;
  displayName: string;
  avatarUrl: string;
  balance: number;
  ownedSkins: TankSkinId[];
}

export interface SkinPurchaseResult {
  success: boolean;
  code?: 'AUTH_REQUIRED' | 'OFFLINE' | 'INSUFFICIENT_FUNDS' | 'ERROR';
  alreadyOwned?: boolean;
  newBalance?: number;
  ownedSkins?: string[];
  message: string;
}

interface ExternalWindHubBridge {
  getState?: () => {
    connectedToWindHub?: boolean;
    authenticated?: boolean;
    online?: boolean;
    uid?: string | null;
    displayName?: string;
    avatarUrl?: string;
    balance?: number;
    ownedSkins?: string[];
  };
  subscribe?: (listener: (state: unknown) => void) => () => void;
  purchaseSkin?: (args: {
    skinId: TankSkinId;
    skinName: string;
    costXu: number;
  }) => Promise<SkinPurchaseResult>;
  openWindHubLogin?: () => void;
}

const VALID_SKIN_ID_SET = new Set<TankSkinId>([
  'classic',
  'viper_scout',
  'titan_heavy',
  'falcon_sniper',
  'arachnid_barrage',
  'hover_specter',
  'magma_drake',
  'cyber_omega',
]);

function isValidSkinId(val: unknown): val is TankSkinId {
  return typeof val === 'string' && VALID_SKIN_ID_SET.has(val as TankSkinId);
}

function getSafeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore restricted storage environments
  }
  return null;
}

/**
 * Manages WindHub Account & Coin Wallet synchronization AND 100% Offline persistence
 * of unlocked Tank Skins (`ownedSkins`).
 * - Online inside WindHub: auto-detects logged-in account & live `betBalance` Xu via same-origin bridge.
 * - Offline (or standalone): preserves 100% of unlocked skins in LocalStorage so every purchased
 *   chassis remains selectable without internet!
 */
export class SkinWalletManager {
  private memoryOwnedSkins: Set<TankSkinId> = new Set<TankSkinId>(['classic']);
  private listeners: Set<(snap: WindHubWalletSnapshot) => void> = new Set();
  private bridgeUnsub: (() => void) | null = null;

  constructor() {
    this.syncFromLocalStorage(null);
    this.attachExternalBridgeIfAvailable();
  }

  private resolveExternalBridge(): ExternalWindHubBridge | null {
    if (typeof window === 'undefined') return null;
    const winAny = window as unknown as { __WINDHUB_TANK_WALLET_BRIDGE__?: ExternalWindHubBridge };
    if (winAny.__WINDHUB_TANK_WALLET_BRIDGE__) {
      return winAny.__WINDHUB_TANK_WALLET_BRIDGE__;
    }
    try {
      if (window.parent && window.parent !== window) {
        const parentAny = window.parent as unknown as {
          __WINDHUB_TANK_WALLET_BRIDGE__?: ExternalWindHubBridge;
        };
        if (parentAny.__WINDHUB_TANK_WALLET_BRIDGE__) {
          return parentAny.__WINDHUB_TANK_WALLET_BRIDGE__;
        }
      }
    } catch {
      // Cross-origin parent frame; ignore safely
    }
    return null;
  }

  private attachExternalBridgeIfAvailable(): void {
    const bridge = this.resolveExternalBridge();
    if (!bridge || this.bridgeUnsub) return;
    if (typeof bridge.subscribe === 'function') {
      this.bridgeUnsub = bridge.subscribe(() => {
        const snap = this.getSnapshot();
        this.emit(snap);
      });
    }
  }

  private syncFromLocalStorage(uid: string | null): TankSkinId[] {
    this.memoryOwnedSkins.add('classic');
    const storage = getSafeStorage();
    if (!storage) {
      return Array.from(this.memoryOwnedSkins);
    }
    try {
      const rawGlobal = storage.getItem(OWNED_SKINS_GLOBAL_KEY);
      if (rawGlobal) {
        const parsed = JSON.parse(rawGlobal);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (isValidSkinId(item)) this.memoryOwnedSkins.add(item);
          }
        }
      }
      const effectiveUid = uid || storage.getItem('windhub_last_user_id');
      if (effectiveUid) {
        const rawUser = storage.getItem(`${OWNED_SKINS_USER_PREFIX}${effectiveUid}`);
        if (rawUser) {
          const parsedUser = JSON.parse(rawUser);
          if (Array.isArray(parsedUser)) {
            for (const item of parsedUser) {
              if (isValidSkinId(item)) this.memoryOwnedSkins.add(item);
            }
          }
        }
      }
    } catch {
      // Ignore storage access failures
    }
    return Array.from(this.memoryOwnedSkins);
  }

  persistOwnedSkins(skins: ReadonlyArray<string>, uid?: string | null): TankSkinId[] {
    this.memoryOwnedSkins.add('classic');
    for (const s of skins) {
      if (isValidSkinId(s)) {
        this.memoryOwnedSkins.add(s);
      }
    }
    const merged = Array.from(this.memoryOwnedSkins);
    const storage = getSafeStorage();
    if (storage) {
      try {
        storage.setItem(OWNED_SKINS_GLOBAL_KEY, JSON.stringify(merged));
        const effectiveUid = uid ?? storage.getItem('windhub_last_user_id');
        if (effectiveUid) {
          storage.setItem(`${OWNED_SKINS_USER_PREFIX}${effectiveUid}`, JSON.stringify(merged));
        }
      } catch {
        // Ignore quota errors
      }
    }
    return merged;
  }

  getOwnedSkins(): TankSkinId[] {
    const snap = this.getSnapshot();
    return snap.ownedSkins;
  }

  isSkinOwned(skinId: TankSkinId): boolean {
    if (skinId === 'classic') return true;
    return this.getOwnedSkins().includes(skinId);
  }

  getSnapshot(): WindHubWalletSnapshot {
    this.attachExternalBridgeIfAvailable();
    const online =
      typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
        ? navigator.onLine
        : true;

    const bridge = this.resolveExternalBridge();
    if (bridge && typeof bridge.getState === 'function') {
      try {
        const st = bridge.getState();
        const uid = st?.uid ?? null;
        const localSkins = this.syncFromLocalStorage(uid);
        const remoteSkins = Array.isArray(st?.ownedSkins) ? st.ownedSkins : [];
        const mergedSkins = this.persistOwnedSkins([...localSkins, ...remoteSkins], uid);
        return {
          connectedToWindHub: Boolean(st?.connectedToWindHub ?? true),
          authenticated: Boolean(st?.authenticated),
          online: typeof st?.online === 'boolean' ? st.online : online,
          uid,
          displayName: st?.displayName || 'Chiến Binh WindHub',
          avatarUrl: st?.avatarUrl || '',
          balance: typeof st?.balance === 'number' ? Math.max(0, Math.floor(st.balance)) : 0,
          ownedSkins: mergedSkins,
        };
      } catch {
        // Fall through to same-origin localStorage fallback
      }
    }

    // Same-origin / Offline LocalStorage fallback
    let uid: string | null = null;
    let balance = 0;
    let hasStoredSession = false;
    const storage = getSafeStorage();
    if (storage) {
      try {
        uid = storage.getItem('windhub_last_user_id');
        hasStoredSession = Boolean(uid || storage.getItem('windhub_session_token'));
        const rawBal =
          (uid ? storage.getItem(`windhub_wallet_balance_${uid}`) : null) ||
          storage.getItem('windhub_dev_balance');
        if (rawBal && !Number.isNaN(Number(rawBal))) {
          balance = Math.max(0, Math.floor(Number(rawBal)));
        }
      } catch {
        // Ignore
      }
    }
    const ownedSkins = this.syncFromLocalStorage(uid);

    return {
      connectedToWindHub: hasStoredSession,
      authenticated: Boolean(uid),
      online,
      uid,
      displayName: uid ? 'Tài Khoản WindHub' : 'Khách (Chưa đăng nhập)',
      avatarUrl: '',
      balance,
      ownedSkins,
    };
  }

  subscribe(listener: (snap: WindHubWalletSnapshot) => void): () => void {
    this.attachExternalBridgeIfAvailable();
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(snap: WindHubWalletSnapshot): void {
    for (const fn of this.listeners) {
      fn(snap);
    }
  }

  openWindHubLogin(): boolean {
    const bridge = this.resolveExternalBridge();
    if (bridge && typeof bridge.openWindHubLogin === 'function') {
      bridge.openWindHubLogin();
      return true;
    }
    return false;
  }

  async purchaseSkin(
    skinId: TankSkinId,
    skinName: string,
    costXu: number,
  ): Promise<SkinPurchaseResult> {
    if (skinId === 'classic' || this.isSkinOwned(skinId)) {
      const owned = this.persistOwnedSkins([skinId]);
      this.emit(this.getSnapshot());
      return {
        success: true,
        alreadyOwned: true,
        ownedSkins: owned,
        message: `Chiến Xa ${skinName} đã có sẵn trong kho của bạn!`,
      };
    }

    const snap = this.getSnapshot();
    if (!snap.online) {
      return {
        success: false,
        code: 'OFFLINE',
        message:
          '📴 Cần kết nối mạng & tài khoản WindHub để mua Chiến Xa mới. Các xe đã mua vẫn dùng Offline 100%!',
      };
    }

    const bridge = this.resolveExternalBridge();
    if (bridge && typeof bridge.purchaseSkin === 'function') {
      const res = await bridge.purchaseSkin({ skinId, skinName, costXu });
      if (res.success) {
        this.persistOwnedSkins([...(res.ownedSkins ?? []), skinId], snap.uid);
      }
      this.emit(this.getSnapshot());
      return res;
    }

    // Same-origin fallback if opened directly on WindHub domain outside React wrapper
    const storage = getSafeStorage();
    if (snap.authenticated && snap.uid && storage) {
      if (snap.balance < costXu) {
        return {
          success: false,
          code: 'INSUFFICIENT_FUNDS',
          newBalance: snap.balance,
          message: `Không đủ Xu! Cần ${costXu.toLocaleString()} Xu (hiện có ${snap.balance.toLocaleString()} Xu).`,
        };
      }
      const nextBal = snap.balance - costXu;
      try {
        storage.setItem(`windhub_wallet_balance_${snap.uid}`, String(nextBal));
        storage.setItem('windhub_dev_balance', String(nextBal));
      } catch {
        // Ignore
      }
      const owned = this.persistOwnedSkins([skinId], snap.uid);
      this.emit(this.getSnapshot());
      return {
        success: true,
        newBalance: nextBal,
        ownedSkins: owned,
        message: `🎉 Đã mở khóa ${skinName}! Đã lưu vào kho Offline vĩnh viễn.`,
      };
    }

    return {
      success: false,
      code: 'AUTH_REQUIRED',
      message: '🔑 Vui lòng mở game từ WindHub & đăng nhập tài khoản để dùng Xu mở khóa Chiến Xa!',
    };
  }
}

export const skinWalletManager = new SkinWalletManager();

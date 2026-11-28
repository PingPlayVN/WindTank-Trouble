import type { TankSkinId } from '../types/gameTypes';

const OWNED_SKINS_LEGACY_GLOBAL_KEY = 'windtank_owned_skins_v1';
const OWNED_SKINS_USER_PREFIX = 'windtank_owned_skins_';
const OWNED_SKINS_ACCOUNT_PREFIX = 'windtank_owned_skins_acct_';
const LAST_GOOGLE_ACCOUNT_KEY = 'windtank_last_google_account';
const LAST_GOOGLE_LABEL_KEY = 'windtank_last_google_label';

export const DEFAULT_DAILY_REWARD_AMOUNTS = [5000, 10000, 15000, 25000, 40000, 60000, 100000];

export interface WindHubDailyRewardSnapshot {
  currentStreak: number;
  claimedToday: boolean;
  canClaimToday: boolean;
  nextStreakDay: number;
  nextRewardAmount: number;
  rewardAmounts: number[];
}

export interface WindHubWalletSnapshot {
  connectedToWindHub: boolean;
  authenticated: boolean;
  online: boolean;
  uid: string | null;
  accountKey: string | null;
  email: string;
  displayName: string;
  avatarUrl: string;
  balance: number;
  cloudSynced: boolean;
  ownedSkins: TankSkinId[];
  redeemedGiftcodes: string[];
  dailyReward: WindHubDailyRewardSnapshot | null;
}

export interface SkinPurchaseResult {
  success: boolean;
  code?: 'AUTH_REQUIRED' | 'OFFLINE' | 'INSUFFICIENT_FUNDS' | 'ERROR';
  alreadyOwned?: boolean;
  newBalance?: number;
  ownedSkins?: string[];
  message: string;
}

export interface DailyRewardClaimResult {
  ok?: boolean;
  success: boolean;
  code?: string;
  amount?: number;
  rewardAmount?: number;
  streakDay?: number;
  newBalance?: number;
  message?: string;
}

export interface GiftCodeRedeemResult {
  success: boolean;
  code?: string;
  rewardAmount?: number;
  newBalance?: number;
  message: string;
}

interface ExternalWindHubBridge {
  getState?: () => {
    connectedToWindHub?: boolean;
    authenticated?: boolean;
    online?: boolean;
    uid?: string | null;
    googleSub?: string | null;
    accountKey?: string | null;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
    balance?: number;
    cloudSynced?: boolean;
    ownedSkins?: string[];
    redeemedGiftcodes?: string[];
    dailyReward?: Partial<WindHubDailyRewardSnapshot> | null;
  };
  subscribe?: (listener: (state: unknown) => void) => () => void;
  purchaseSkin?: (args: {
    skinId: TankSkinId;
    skinName: string;
    costXu: number;
  }) => Promise<SkinPurchaseResult>;
  syncOwnedSkins?: (ownedSkins: TankSkinId[]) => Promise<unknown>;
  claimDailyReward?: () => Promise<DailyRewardClaimResult>;
  redeemGiftCode?: (code: string) => Promise<GiftCodeRedeemResult>;
  logoutAccount?: () => Promise<unknown>;
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

export function normalizeGoogleAccountKey(input: {
  accountKey?: string | null;
  googleSub?: string | null;
  email?: string | null;
  uid?: string | null;
}): string | null {
  const emailNorm = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (emailNorm && emailNorm.includes('@')) {
    return `google_${emailNorm}`;
  }
  const acct = typeof input.accountKey === 'string' ? input.accountKey.trim() : '';
  if (acct) return acct;
  const sub = typeof input.googleSub === 'string' ? input.googleSub.trim() : '';
  if (sub) return `sub_${sub}`;
  const uid = typeof input.uid === 'string' ? input.uid.trim() : '';
  if (uid) return `uid_${uid}`;
  return null;
}

function parseSkinListJson(raw: string | null): TankSkinId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: TankSkinId[] = [];
    for (const item of parsed) {
      if (isValidSkinId(item)) out.push(item);
    }
    return out;
  } catch {
    return [];
  }
}

function normalizeDailySnapshot(
  raw: Partial<WindHubDailyRewardSnapshot> | null | undefined,
): WindHubDailyRewardSnapshot | null {
  if (!raw) return null;
  const amounts =
    Array.isArray(raw.rewardAmounts) && raw.rewardAmounts.length === 7
      ? raw.rewardAmounts
      : DEFAULT_DAILY_REWARD_AMOUNTS;
  const nextDay = Math.min(7, Math.max(1, Number(raw.nextStreakDay) || 1));
  const claimedToday = Boolean(raw.claimedToday);
  const canClaimToday = raw.canClaimToday !== undefined ? Boolean(raw.canClaimToday) : !claimedToday;
  return {
    currentStreak: Math.max(0, Number(raw.currentStreak) || 0),
    claimedToday,
    canClaimToday,
    nextStreakDay: nextDay,
    nextRewardAmount: Number(raw.nextRewardAmount) || amounts[nextDay - 1] || 5000,
    rewardAmounts: amounts,
  };
}

/**
 * Manages Google Account Cloud Synchronization + Shared WindHub Coin Wallet,
 * Shared 7-Day Daily Check-in Reward, Shared Giftcode Redemption (100% synced with Tài Xỉu),
 * and 100% Offline persistence of unlocked Tank Skins (`ownedSkins`) per Google Account!
 */
export class SkinWalletManager {
  private memoryByAccount: Map<string, Set<TankSkinId>> = new Map();
  private lastSyncedSignature = '';
  private listeners: Set<(snap: WindHubWalletSnapshot) => void> = new Set();
  private bridgeUnsub: (() => void) | null = null;

  constructor() {
    this.attachExternalBridgeIfAvailable();
  }

  private getMemorySet(accountKey: string): Set<TankSkinId> {
    const key = accountKey || '__guest__';
    let set = this.memoryByAccount.get(key);
    if (!set) {
      set = new Set<TankSkinId>(['classic']);
      this.memoryByAccount.set(key, set);
    }
    set.add('classic');
    return set;
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

  private readAccountSkinsFromStorage(
    accountKey: string | null,
    uid: string | null,
    allowLegacyMigration: boolean,
  ): TankSkinId[] {
    if (!accountKey) {
      return ['classic'];
    }
    const mem = this.getMemorySet(accountKey);
    const storage = getSafeStorage();
    if (!storage) {
      return Array.from(mem);
    }

    try {
      const acctStorageKey = `${OWNED_SKINS_ACCOUNT_PREFIX}${accountKey}`;
      const rawAcct = storage.getItem(acctStorageKey);
      if (rawAcct !== null) {
        for (const sk of parseSkinListJson(rawAcct)) {
          mem.add(sk);
        }
      } else if (allowLegacyMigration) {
        if (uid) {
          for (const sk of parseSkinListJson(storage.getItem(`${OWNED_SKINS_USER_PREFIX}${uid}`))) {
            mem.add(sk);
          }
        }
        const legacyGlobal = parseSkinListJson(storage.getItem(OWNED_SKINS_LEGACY_GLOBAL_KEY));
        if (legacyGlobal.length > 0) {
          for (const sk of legacyGlobal) {
            mem.add(sk);
          }
          storage.removeItem(OWNED_SKINS_LEGACY_GLOBAL_KEY);
        }
        storage.setItem(acctStorageKey, JSON.stringify(Array.from(mem)));
      }

      if (uid) {
        for (const sk of parseSkinListJson(storage.getItem(`${OWNED_SKINS_USER_PREFIX}${uid}`))) {
          mem.add(sk);
        }
      }
    } catch {
      // Ignore storage access failures
    }

    return Array.from(mem);
  }

  persistOwnedSkins(
    skins: ReadonlyArray<string>,
    uid?: string | null,
    accountKey?: string | null,
    accountLabel?: string,
  ): TankSkinId[] {
    const storage = getSafeStorage();
    const resolvedAcct =
      accountKey ||
      normalizeGoogleAccountKey({ uid }) ||
      storage?.getItem(LAST_GOOGLE_ACCOUNT_KEY) ||
      '__guest__';

    const mem = this.getMemorySet(resolvedAcct);
    for (const s of skins) {
      if (isValidSkinId(s)) {
        mem.add(s);
      }
    }
    const merged = Array.from(mem);

    if (storage) {
      try {
        storage.setItem(`${OWNED_SKINS_ACCOUNT_PREFIX}${resolvedAcct}`, JSON.stringify(merged));
        if (resolvedAcct !== '__guest__') {
          storage.setItem(LAST_GOOGLE_ACCOUNT_KEY, resolvedAcct);
          if (accountLabel) {
            storage.setItem(LAST_GOOGLE_LABEL_KEY, accountLabel);
          }
        }
        const effectiveUid = uid ?? storage.getItem('windhub_last_user_id');
        if (effectiveUid && resolvedAcct !== '__guest__') {
          storage.setItem(`${OWNED_SKINS_USER_PREFIX}${effectiveUid}`, JSON.stringify(merged));
        }
      } catch {
        // Ignore quota errors
      }
    }
    return merged;
  }

  getOwnedSkins(): TankSkinId[] {
    return this.getSnapshot().ownedSkins;
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
    const storage = getSafeStorage();

    const bridge = this.resolveExternalBridge();
    if (bridge && typeof bridge.getState === 'function') {
      try {
        const st = bridge.getState();
        const isOnline = typeof st?.online === 'boolean' ? st.online : online;
        const authenticated = Boolean(st?.authenticated);
        const uid = st?.uid ?? null;
        const email = st?.email || '';
        const displayName =
          st?.displayName || email || (authenticated ? 'Tài Khoản Google' : 'Chưa đăng nhập Google');

        if (authenticated) {
          const accountKey = normalizeGoogleAccountKey({
            accountKey: st?.accountKey,
            googleSub: st?.googleSub,
            email,
            uid,
          });
          const localSkins = this.readAccountSkinsFromStorage(accountKey, uid, true);
          const remoteSkins = Array.isArray(st?.ownedSkins)
            ? st.ownedSkins.filter(isValidSkinId)
            : [];
          const mergedSkins = this.persistOwnedSkins(
            [...localSkins, ...remoteSkins],
            uid,
            accountKey,
            email || displayName,
          );

          if (
            isOnline &&
            typeof bridge.syncOwnedSkins === 'function' &&
            mergedSkins.some((sk) => sk !== 'classic' && !remoteSkins.includes(sk))
          ) {
            const sig = `${accountKey}:${mergedSkins.slice().sort().join(',')}`;
            if (this.lastSyncedSignature !== sig) {
              this.lastSyncedSignature = sig;
              void bridge.syncOwnedSkins(mergedSkins).catch(() => {});
            }
          }

          const redeemedGiftcodes = Array.isArray(st?.redeemedGiftcodes)
            ? st.redeemedGiftcodes.filter((c): c is string => typeof c === 'string')
            : [];

          return {
            connectedToWindHub: Boolean(st?.connectedToWindHub ?? true),
            authenticated: true,
            online: isOnline,
            uid,
            accountKey,
            email,
            displayName,
            avatarUrl: st?.avatarUrl || '',
            balance: typeof st?.balance === 'number' ? Math.max(0, Math.floor(st.balance)) : 0,
            cloudSynced: Boolean(st?.cloudSynced ?? true),
            ownedSkins: mergedSkins,
            redeemedGiftcodes,
            dailyReward: normalizeDailySnapshot(st?.dailyReward),
          };
        }

        if (!isOnline) {
          const lastAcct =
            storage?.getItem(LAST_GOOGLE_ACCOUNT_KEY) ||
            normalizeGoogleAccountKey({ uid: storage?.getItem('windhub_last_user_id') });
          const lastLabel = storage?.getItem(LAST_GOOGLE_LABEL_KEY) || 'Tài khoản đã lưu';
          const offlineSkins = lastAcct
            ? this.readAccountSkinsFromStorage(lastAcct, storage?.getItem('windhub_last_user_id') ?? null, true)
            : (['classic'] as TankSkinId[]);
          return {
            connectedToWindHub: true,
            authenticated: Boolean(lastAcct),
            online: false,
            uid: storage?.getItem('windhub_last_user_id') ?? null,
            accountKey: lastAcct,
            email: '',
            displayName: lastLabel,
            avatarUrl: '',
            balance: 0,
            cloudSynced: false,
            ownedSkins: offlineSkins,
            redeemedGiftcodes: [],
            dailyReward: null,
          };
        }

        return {
          connectedToWindHub: Boolean(st?.connectedToWindHub ?? true),
          authenticated: false,
          online: isOnline,
          uid: null,
          accountKey: null,
          email: '',
          displayName: 'Chưa đăng nhập Google',
          avatarUrl: '',
          balance: 0,
          cloudSynced: false,
          ownedSkins: ['classic'],
          redeemedGiftcodes: [],
          dailyReward: null,
        };
      } catch {
        // Fall through to standalone / offline localStorage fallback
      }
    }

    let uid: string | null = null;
    let lastAcct: string | null = null;
    let lastLabel = '';
    let balance = 0;
    let hasStoredSession = false;

    if (storage) {
      try {
        uid = storage.getItem('windhub_last_user_id');
        lastAcct =
          storage.getItem(LAST_GOOGLE_ACCOUNT_KEY) || normalizeGoogleAccountKey({ uid });
        lastLabel = storage.getItem(LAST_GOOGLE_LABEL_KEY) || '';
        hasStoredSession = Boolean(lastAcct || uid || storage.getItem('windhub_session_token'));
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

    const ownedSkins = lastAcct
      ? this.readAccountSkinsFromStorage(lastAcct, uid, true)
      : this.readAccountSkinsFromStorage('__guest__', null, true);

    return {
      connectedToWindHub: hasStoredSession,
      authenticated: Boolean(lastAcct || uid),
      online,
      uid,
      accountKey: lastAcct,
      email: '',
      displayName: lastLabel || (lastAcct || uid ? 'Tài Khoản Google (Đã lưu)' : 'Khách (Chưa đăng nhập)'),
      avatarUrl: '',
      balance,
      cloudSynced: false,
      ownedSkins,
      redeemedGiftcodes: [],
      dailyReward: null,
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

  async logoutAccount(): Promise<boolean> {
    const bridge = this.resolveExternalBridge();
    if (bridge && typeof bridge.logoutAccount === 'function') {
      await bridge.logoutAccount();
      this.emit(this.getSnapshot());
      return true;
    }
    return false;
  }

  async claimDailyReward(): Promise<DailyRewardClaimResult> {
    const snap = this.getSnapshot();
    if (!snap.online) {
      return {
        success: false,
        code: 'OFFLINE',
        message: '📴 Cần kết nối mạng để điểm danh nhận thưởng hằng ngày!',
      };
    }
    if (!snap.authenticated) {
      return {
        success: false,
        code: 'AUTH_REQUIRED',
        message: '🔑 Vui lòng đăng nhập tài khoản Google (WindHub) trước khi điểm danh!',
      };
    }
    if (snap.dailyReward?.claimedToday) {
      return {
        success: false,
        code: 'ALREADY_CLAIMED',
        message: '✓ Hôm nay bạn đã nhận thưởng đăng nhập rồi! (Dùng chung Tài Xỉu & WindTank)',
      };
    }

    const bridge = this.resolveExternalBridge();
    if (bridge && typeof bridge.claimDailyReward === 'function') {
      const res = await bridge.claimDailyReward();
      this.emit(this.getSnapshot());
      return {
        ...res,
        success: Boolean(res?.success || res?.ok),
      };
    }

    return {
      success: false,
      code: 'BRIDGE_UNAVAILABLE',
      message: 'Hãy mở WindTank bên trong mục Giải Trí trên WindHub để điểm danh nhận Xu!',
    };
  }

  async redeemGiftCode(rawCode: string): Promise<GiftCodeRedeemResult> {
    const cleanCode = rawCode.trim().toUpperCase();
    if (!cleanCode) {
      return {
        success: false,
        code: 'EMPTY_CODE',
        message: 'Vui lòng nhập mã Giftcode quà tặng!',
      };
    }

    const snap = this.getSnapshot();
    if (!snap.online) {
      return {
        success: false,
        code: 'OFFLINE',
        message: '📴 Cần kết nối mạng để xác thực mã Giftcode!',
      };
    }
    if (!snap.authenticated) {
      return {
        success: false,
        code: 'AUTH_REQUIRED',
        message: '🔑 Vui lòng đăng nhập tài khoản Google để nhập Giftcode!',
      };
    }
    if (snap.redeemedGiftcodes.includes(cleanCode)) {
      return {
        success: false,
        code: 'ALREADY_REDEEMED',
        message: `Bạn đã nhập mã ${cleanCode} rồi! Mỗi tài khoản chỉ được nhập 1 lần (dùng chung Tài Xỉu).`,
      };
    }

    const bridge = this.resolveExternalBridge();
    if (bridge && typeof bridge.redeemGiftCode === 'function') {
      const res = await bridge.redeemGiftCode(cleanCode);
      this.emit(this.getSnapshot());
      return res;
    }

    return {
      success: false,
      code: 'BRIDGE_UNAVAILABLE',
      message: 'Hãy mở WindTank bên trong mục Giải Trí trên WindHub để sử dụng Giftcode!',
    };
  }

  async purchaseSkin(
    skinId: TankSkinId,
    skinName: string,
    costXu: number,
  ): Promise<SkinPurchaseResult> {
    const snap = this.getSnapshot();
    if (skinId === 'classic' || snap.ownedSkins.includes(skinId)) {
      const owned = this.persistOwnedSkins(
        [skinId],
        snap.uid,
        snap.accountKey,
        snap.email || snap.displayName,
      );
      this.emit(this.getSnapshot());
      return {
        success: true,
        alreadyOwned: true,
        ownedSkins: owned,
        message: `Chiến Xa ${skinName} đã có sẵn trong tài khoản Google của bạn!`,
      };
    }

    if (!snap.online) {
      return {
        success: false,
        code: 'OFFLINE',
        message:
          '📴 Cần kết nối mạng & tài khoản Google để mua Chiến Xa mới. Các xe đã mua vẫn dùng Offline 100%!',
      };
    }

    const bridge = this.resolveExternalBridge();
    if (bridge && typeof bridge.purchaseSkin === 'function') {
      const res = await bridge.purchaseSkin({ skinId, skinName, costXu });
      if (res.success) {
        const freshSnap = this.getSnapshot();
        this.persistOwnedSkins(
          [...(res.ownedSkins ?? []), skinId],
          freshSnap.uid ?? snap.uid,
          freshSnap.accountKey ?? snap.accountKey,
          freshSnap.email || freshSnap.displayName,
        );
      }
      this.emit(this.getSnapshot());
      return res;
    }

    const storage = getSafeStorage();
    if (snap.authenticated && (snap.uid || snap.accountKey) && storage) {
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
        if (snap.uid) {
          storage.setItem(`windhub_wallet_balance_${snap.uid}`, String(nextBal));
        }
        storage.setItem('windhub_dev_balance', String(nextBal));
      } catch {
        // Ignore
      }
      const owned = this.persistOwnedSkins(
        [skinId],
        snap.uid,
        snap.accountKey,
        snap.email || snap.displayName,
      );
      this.emit(this.getSnapshot());
      return {
        success: true,
        newBalance: nextBal,
        ownedSkins: owned,
        message: `🎉 Đã mở khóa ${skinName}! Đã đồng bộ tài khoản & lưu kho Offline.`,
      };
    }

    return {
      success: false,
      code: 'AUTH_REQUIRED',
      message: '🔑 Vui lòng đăng nhập tài khoản Google trên WindHub để mở khóa & đồng bộ Chiến Xa!',
    };
  }
}

export const skinWalletManager = new SkinWalletManager();

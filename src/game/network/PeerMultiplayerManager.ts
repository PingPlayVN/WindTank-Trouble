import Peer, { type DataConnection } from 'peerjs';
import {
  ALL_SKILL_IDS,
  isValidTankSkinId,
  resolveOnlineArenaViewport,
  TANK_PALETTES,
} from '../config/constants';
import { settingsManager } from '../managers/SettingsManager';
import { resolveMazeForRound } from '../maps/mapDefinitions';
import type { ArenaViewportSpec } from '../maps/MazeBuilder';
import { isMazeValidAndConnected } from '../systems/MazeSystem';
import {
  formatRoomCode,
  generateRoomCode,
  normalizeRoomCode,
  peerIdFromRoomCode,
} from './roomCode';
import type { NetBarrelSnapshot } from '../systems/TntBarrelSystem';
import type {
  BattleModeId,
  MapModeId,
  MazeGridData,
  NetworkRole,
  PlayerIndex,
  PlayerInputState,
  ProjectileVariant,
  RoundPhase,
  RoundResultSummary,
  SkillId,
  TankSkinId,
  TntBarrelsOption,
} from '../types/gameTypes';

const PUBLIC_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export interface LobbySharedState {
  roomCode: string;
  formattedCode: string;
  role: NetworkRole;
  status: 'idle' | 'creating' | 'waiting_guest' | 'connecting' | 'ready_room' | 'in_match' | 'error';
  statusMessage: string;
  connected: boolean;
  transport: 'none' | 'webrtc' | 'broadcast';
  pingMs: number;
  hostColorId: string;
  guestColorId: string;
  hostSkinId: TankSkinId;
  guestSkinId: TankSkinId;
  skinStatsEnabled: boolean;
  guestReady: boolean;
  hostTouchActive: boolean;
  guestTouchActive: boolean;
  mapMode: MapModeId;
  battleMode: BattleModeId;
  maxArmorHp: number;
  tntBarrelsOption: TntBarrelsOption;
  winningScore: number;
  powerUpSpawnIntervalSec: number;
  maxCratesOnFloor: number;
  enabledSkills: SkillId[];
}

export interface OnlineMatchConfig {
  matchSeed: number;
  useMobileViewport: boolean;
  hostTouchActive?: boolean;
  guestTouchActive?: boolean;
  authoritativeViewport?: ArenaViewportSpec;
  authoritativeRound?: number;
  authoritativeGrid?: MazeGridData;
  hostColorId: string;
  guestColorId: string;
  hostSkinId?: TankSkinId;
  guestSkinId?: TankSkinId;
  skinStatsEnabled?: boolean;
  mapMode: MapModeId;
  battleMode: BattleModeId;
  maxArmorHp: number;
  tntBarrelsOption: TntBarrelsOption;
  winningScore: number;
  powerUpSpawnIntervalSec: number;
  maxCratesOnFloor: number;
  enabledSkills: SkillId[];
}

export interface NetTankSnapshot {
  index: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  alive: boolean;
  ammo: number;
  hp?: number;
  maxHp?: number;
  hasArmor?: boolean;
  skill: SkillId | null;
  skillAmmo: number;
  chargingLaserRemaining: number;
  reaperWindupRemaining: number;
  reaperDeployRemaining?: number;
  reaperSpinRemaining: number;
  shieldRemaining: number;
  phantomRemaining?: number;
  empJamRemaining?: number;
  frozenRemaining?: number;
  cryoChillRatio?: number;
  onIceFloor?: boolean;
  warpBeaconPlaced?: boolean;
}

export interface NetProjectileSnapshot {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  age: number;
  maxLifetime: number;
  variant: ProjectileVariant;
}

export interface NetCrateSnapshot {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export interface NetMineSnapshot {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  age: number;
  armingSec: number;
  triggerRadius: number;
}

export interface NetSpikeZoneSnapshot {
  id: number;
  x: number;
  y: number;
  age: number;
  duration: number;
  nodes: Array<{ x: number; y: number; angle: number }>;
}

export interface NetCryoZoneSnapshot {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
}

export interface NetBarrierSnapshot {
  id: number;
  ownerIndex: PlayerIndex;
  kind: 'h' | 'v';
  r: number;
  c: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
  duration: number;
}

export interface NetWarpBeaconSnapshot {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  age: number;
  maxDuration: number;
}

export interface WorldSnapshotPacket {
  t: 'world_snapshot';
  seq: number;
  roundNumber: number;
  arenaKey?: string;
  phase: RoundPhase;
  scores: [number, number];
  ties: number;
  crateTimerSec: number;
  tanks: NetTankSnapshot[];
  projectiles: NetProjectileSnapshot[];
  crates: NetCrateSnapshot[];
  mines: NetMineSnapshot[];
  spikeZones: NetSpikeZoneSnapshot[];
  cryoZones?: NetCryoZoneSnapshot[];
  barriers?: NetBarrierSnapshot[];
  warpBeacons?: NetWarpBeaconSnapshot[];
  barrels?: NetBarrelSnapshot[];
}

export type NetGameEvent =
  | { kind: 'countdown_step'; label: string }
  | { kind: 'fight_start' }
  | {
      kind: 'muzzle_fx';
      variant: 'standard' | 'gatling' | 'flame' | 'scatter' | 'drill' | 'emp_orb' | 'cryo_orb';
      x: number;
      y: number;
      angle: number;
    }
  | { kind: 'wall_bounce'; x: number; y: number; bounces: number }
  | { kind: 'wall_drilled'; hitX: number; hitY: number }
  | {
      kind: 'laser_blast';
      points: Array<{ x: number; y: number }>;
      victims: Array<{ x: number; y: number }>;
    }
  | { kind: 'shield_fx'; sub: 'activate' | 'deflect'; x: number; y: number }
  | { kind: 'crate_fx'; sub: 'spawn' | 'pickup'; x: number; y: number; skillId?: SkillId }
  | {
      kind: 'hazard_fx';
      sub:
        | 'spike_burst'
        | 'mine_deploy'
        | 'mine_blast'
        | 'reaper_unfurl'
        | 'bullet_burned'
        | 'emp_blast'
        | 'phantom_activate'
        | 'cryo_shatter'
        | 'barrier_deploy'
        | 'barrier_shatter'
        | 'warp_plant'
        | 'warp_teleport';
      x: number;
      y: number;
      x2?: number;
      y2?: number;
      radius?: number;
    }
  | { kind: 'armor_hit'; victimIndex: PlayerIndex; x: number; y: number; hpRatio: number }
  | { kind: 'barrel_blast'; x: number; y: number; blastRadius: number }
  | { kind: 'tank_eliminated'; victimIndex: PlayerIndex; x: number; y: number }
  | { kind: 'round_resolved'; summary: RoundResultSummary }
  | {
      kind: 'advance_round';
      roundNumber: number;
      crateTimerSec: number;
      grid?: MazeGridData;
      viewport?: ArenaViewportSpec;
    }
  | {
      kind: 'arena_resync';
      roundNumber: number;
      grid: MazeGridData;
      viewport: ArenaViewportSpec;
    }
  | { kind: 'match_victory'; summary: RoundResultSummary }
  | { kind: 'rematch_start'; config: OnlineMatchConfig };

type PeerPacket =
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | {
      t: 'lobby_state';
      roomCode: string;
      hostColorId: string;
      guestColorId: string;
      hostSkinId?: TankSkinId;
      guestSkinId?: TankSkinId;
      skinStatsEnabled?: boolean;
      guestReady: boolean;
      hostTouchActive: boolean;
      guestTouchActive?: boolean;
      mapMode: MapModeId;
      battleMode: BattleModeId;
      maxArmorHp: number;
      tntBarrelsOption: TntBarrelsOption;
      winningScore: number;
      powerUpSpawnIntervalSec: number;
      maxCratesOnFloor: number;
      enabledSkills: SkillId[];
    }
  | {
      t: 'guest_lobby_update';
      preferredColorId?: string;
      preferredSkinId?: TankSkinId;
      ready: boolean;
      guestTouchActive: boolean;
    }
  | { t: 'match_start'; config: OnlineMatchConfig }
  | { t: 'request_arena_sync'; roundNumber: number }
  | {
      t: 'guest_input';
      seq: number;
      forward: boolean;
      backward: boolean;
      left: boolean;
      right: boolean;
      fireHeld: boolean;
      firePressCount: number;
    }
  | WorldSnapshotPacket
  | { t: 'net_event'; event: NetGameEvent }
  | { t: 'peer_bye' };

interface BroadcastEnvelope {
  __wtBc: true;
  senderId: string;
  targetId?: string;
  action: 'join_req' | 'join_ack' | 'packet' | 'bye';
  packet?: PeerPacket;
}

type LobbyListener = (state: LobbySharedState) => void;
type MatchStartListener = (config: OnlineMatchConfig) => void;

export class PeerMultiplayerManager {
  private readonly instanceId = `wt_${Math.random().toString(36).slice(2, 10)}`;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private bc: BroadcastChannel | null = null;
  private bcPeerId: string | null = null;
  private pingIntervalId: number | null = null;
  private joinTimeoutId: number | null = null;

  private state: LobbySharedState = this.createDefaultState();
  private activeMatchConfig: OnlineMatchConfig | null = null;

  // Guest -> Host input state
  private guestSeq = 0;
  private latestGuestInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    fireHeld: false,
    firePressCount: 0,
  };
  private lastConsumedGuestFireCount = 0;
  private guestFirePendingCount = 0;

  // Host -> Guest world snapshots & events
  private snapshotSeq = 0;
  private latestSnapshot: WorldSnapshotPacket | null = null;
  private pendingNetEvents: NetGameEvent[] = [];
  private peerDisconnectedDuringMatch = false;

  private readonly lobbyListeners = new Set<LobbyListener>();
  private readonly matchStartListeners = new Set<MatchStartListener>();
  private hostArenaSyncResponder: ((roundNumber: number) => void) | null = null;

  setHostArenaSyncResponder(fn: ((roundNumber: number) => void) | null): void {
    this.hostArenaSyncResponder = fn;
  }

  requestArenaSyncFromHost(roundNumber: number): void {
    if (this.state.role !== 'guest' || !this.state.connected) return;
    this.sendRaw({ t: 'request_arena_sync', roundNumber });
  }

  buildAuthoritativeRoundGrid(mapMode: MapModeId, roundNumber: number, matchSeed: number): MazeGridData {
    const roundSeed = (matchSeed + Math.imul(roundNumber, 0x85ebca6b)) >>> 0;
    let grid = resolveMazeForRound(mapMode, roundNumber, 2, roundSeed);
    if (!isMazeValidAndConnected(grid)) {
      grid = resolveMazeForRound('procedural_large', roundNumber, 2, roundSeed ^ 7);
    }
    return grid;
  }

  private createDefaultState(): LobbySharedState {
    const s = settingsManager.getSettings();
    const hostCol = s.playerColors[0] ?? 'red';
    const guestCol =
      s.playerColors[1] && s.playerColors[1] !== hostCol
        ? s.playerColors[1]
        : (TANK_PALETTES.find((p) => p.id !== hostCol)?.id ?? 'green');
    return {
      roomCode: '',
      formattedCode: 'WT-----',
      role: 'offline',
      status: 'idle',
      statusMessage: 'Chọn Tạo Phòng Mới hoặc Nhập Mã Phòng 6 ký tự từ bạn bè.',
      connected: false,
      transport: 'none',
      pingMs: 0,
      hostColorId: hostCol,
      guestColorId: guestCol,
      hostSkinId: settingsManager.getPlayerSkin(0),
      guestSkinId: settingsManager.getPlayerSkin(0),
      skinStatsEnabled: s.skinStatsEnabled,
      guestReady: false,
      hostTouchActive: settingsManager.isTouchControlsActive(),
      guestTouchActive: false,
      mapMode: s.mapMode,
      battleMode: s.battleMode,
      maxArmorHp: s.maxArmorHp,
      tntBarrelsOption: s.tntBarrelsOption,
      winningScore: s.winningScore,
      powerUpSpawnIntervalSec: s.powerUpSpawnIntervalSec,
      maxCratesOnFloor: s.maxCratesOnFloor,
      enabledSkills: [...s.enabledSkills],
    };
  }

  getState(): Readonly<LobbySharedState> {
    return this.state;
  }

  getRole(): NetworkRole {
    return this.state.role;
  }

  isActive(): boolean {
    return this.state.role !== 'offline' && this.state.connected;
  }

  isOnlineSession(): boolean {
    return this.state.role !== 'offline';
  }

  getPingMs(): number {
    return this.state.pingMs;
  }

  getActiveMatchConfig(): OnlineMatchConfig | null {
    return this.activeMatchConfig;
  }

  hasPeerDisconnectedDuringMatch(): boolean {
    return this.peerDisconnectedDuringMatch;
  }

  subscribeLobby(fn: LobbyListener): () => void {
    this.lobbyListeners.add(fn);
    fn(this.state);
    return () => {
      this.lobbyListeners.delete(fn);
    };
  }

  subscribeMatchStart(fn: MatchStartListener): () => void {
    this.matchStartListeners.add(fn);
    return () => {
      this.matchStartListeners.delete(fn);
    };
  }

  private emitLobbyChange(): void {
    for (const fn of this.lobbyListeners) {
      fn(this.state);
    }
  }

  private shouldSkipCloudSignaling(): boolean {
    if (typeof window === 'undefined') return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('p2p') === 'local';
    } catch {
      return false;
    }
  }

  getInviteLink(): string {
    if (typeof window === 'undefined' || !this.state.roomCode) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', formatRoomCode(this.state.roomCode));
    return url.toString();
  }

  /**
   * Creates a Host 1vs1 room with a 6-char badge (`WT-XXXX`) using PeerJS Cloud + Google/Cloudflare STUN
   * (plus zero-latency BroadcastChannel support for same-device / local multi-tab testing).
   */
  hostRoom(preferredCode?: string, retryCount = 0): void {
    this.disconnect(true);
    const code = preferredCode ? normalizeRoomCode(preferredCode) : generateRoomCode();
    const s = settingsManager.getSettings();
    const hostCol = s.playerColors[0] ?? 'red';
    const guestCol =
      s.playerColors[1] && s.playerColors[1] !== hostCol
        ? s.playerColors[1]
        : (TANK_PALETTES.find((p) => p.id !== hostCol)?.id ?? 'green');

    this.state = {
      ...this.createDefaultState(),
      roomCode: code,
      formattedCode: formatRoomCode(code),
      role: 'host',
      status: 'waiting_guest',
      statusMessage: `Phòng ${formatRoomCode(code)} đã sẵn sàng! Gửi mã hoặc Link Mời cho bạn bè.`,
      hostColorId: hostCol,
      guestColorId: guestCol,
      hostSkinId: settingsManager.getPlayerSkin(0),
      guestSkinId: 'classic',
      skinStatsEnabled: s.skinStatsEnabled,
      hostTouchActive: settingsManager.isTouchControlsActive(),
      mapMode: s.mapMode,
      battleMode: s.battleMode,
      maxArmorHp: s.maxArmorHp,
      tntBarrelsOption: s.tntBarrelsOption,
      winningScore: s.winningScore,
      powerUpSpawnIntervalSec: s.powerUpSpawnIntervalSec,
      maxCratesOnFloor: s.maxCratesOnFloor,
      enabledSkills: s.enabledSkills.length > 0 ? [...s.enabledSkills] : [...ALL_SKILL_IDS],
    };
    this.emitLobbyChange();

    // 1. Open Same-Origin BroadcastChannel fast-path
    this.openHostBroadcastChannel(code);

    // 2. Open Global WebRTC PeerJS Cloud endpoint with Google + Cloudflare STUN
    if (this.shouldSkipCloudSignaling()) return;
    try {
      const peer = new Peer(peerIdFromRoomCode(code), {
        debug: 0,
        config: { iceServers: PUBLIC_ICE_SERVERS },
      });
      this.peer = peer;

      peer.on('open', () => {
        if (this.peer !== peer) return;
        if (!this.state.connected) {
          this.state.status = 'waiting_guest';
          this.state.statusMessage = `Đang chờ đối thủ vào phòng ${this.state.formattedCode} (STUN Google/Cloudflare)…`;
          this.emitLobbyChange();
        }
      });

      peer.on('connection', (incoming) => {
        if (this.peer !== peer) return;
        if (this.state.connected) {
          // 1vs1 strictly: reject 3rd party connections
          incoming.close();
          return;
        }
        this.bindDataConnection(incoming, 'host');
      });

      peer.on('error', (err: { type?: string; message?: string }) => {
        if (this.peer !== peer) return;
        if (err?.type === 'unavailable-id' && retryCount < 4 && !preferredCode) {
          this.hostRoom(undefined, retryCount + 1);
          return;
        }
        // Keep BroadcastChannel alive even if signaling cloud is blocked offline!
        if (!this.state.connected && !this.bc) {
          this.state.status = 'error';
          this.state.statusMessage = `Lỗi máy chủ tín hiệu P2P: ${err?.message ?? 'Không thể kết nối'}`;
          this.emitLobbyChange();
        }
      });
    } catch {
      // Fallback seamlessly to BroadcastChannel if WebRTC constructor unavailable
    }
  }

  /**
   * Joins an existing friend's `WT-XXXX` room as Guest (`XE 2`).
   */
  joinRoom(rawCode: string): void {
    const code = normalizeRoomCode(rawCode);
    if (code.length < 4) {
      this.state.status = 'error';
      this.state.statusMessage = 'Vui lòng nhập đủ mã phòng 4–6 ký tự (ví dụ: WT-4829 hoặc 4829).';
      this.emitLobbyChange();
      return;
    }

    this.disconnect(true);
    this.state = {
      ...this.createDefaultState(),
      roomCode: code,
      formattedCode: formatRoomCode(code),
      role: 'guest',
      status: 'connecting',
      statusMessage: `Đang kết nối P2P tới phòng ${formatRoomCode(code)}…`,
      guestSkinId: settingsManager.getPlayerSkin(0),
      guestTouchActive: settingsManager.isTouchControlsActive(),
    };
    this.emitLobbyChange();

    // 1. Probe BroadcastChannel (instantaneous if Host is on same browser/test runner)
    this.openGuestBroadcastChannel(code);

    // 2. Connect via PeerJS Cloud + Google/Cloudflare STUN
    if (!this.shouldSkipCloudSignaling()) {
      try {
        const peer = new Peer({
          debug: 0,
          config: { iceServers: PUBLIC_ICE_SERVERS },
        });
        this.peer = peer;

        peer.on('open', () => {
          if (this.peer !== peer || this.state.connected) return;
          const conn = peer.connect(peerIdFromRoomCode(code), {
            reliable: true,
            serialization: 'json',
          });
          this.bindDataConnection(conn, 'guest');
        });

        peer.on('error', (err: { type?: string }) => {
          if (this.peer !== peer || this.state.connected) return;
          if (err?.type === 'peer-unavailable') {
            // Give BroadcastChannel 450ms grace before reporting room not found
            window.setTimeout(() => {
              if (!this.state.connected && this.state.role === 'guest') {
                this.state.status = 'error';
                this.state.statusMessage = `Không tìm thấy phòng ${formatRoomCode(code)} hoặc Chủ Phòng đã đóng phòng.`;
                this.emitLobbyChange();
              }
            }, 450);
          }
        });
      } catch {
        // Handled by timeout if BC doesn't connect
      }
    }

    this.joinTimeoutId = window.setTimeout(() => {
      if (!this.state.connected && this.state.role === 'guest') {
        this.state.status = 'error';
        this.state.statusMessage = `Hết thời gian kết nối phòng ${formatRoomCode(code)}. Kiểm tra lại mã phòng!`;
        this.emitLobbyChange();
      }
    }, 10000);
  }

  private openHostBroadcastChannel(code: string): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const bc = new BroadcastChannel(`windtank-bc-v1-${code}`);
      this.bc = bc;
      bc.onmessage = (ev: MessageEvent<BroadcastEnvelope>) => {
        const msg = ev.data;
        if (!msg || !msg.__wtBc || msg.senderId === this.instanceId) return;
        if (msg.targetId && msg.targetId !== this.instanceId) return;

        if (msg.action === 'join_req') {
          if (this.state.connected && this.bcPeerId !== msg.senderId) return;
          this.bcPeerId = msg.senderId;
          bc.postMessage({
            __wtBc: true,
            senderId: this.instanceId,
            targetId: msg.senderId,
            action: 'join_ack',
          } satisfies BroadcastEnvelope);
          this.onTransportEstablished('broadcast');
          this.broadcastHostLobbyState();
          return;
        }

        if (this.bcPeerId === msg.senderId && this.state.transport === 'broadcast') {
          if (msg.action === 'packet' && msg.packet) {
            this.handlePacket(msg.packet);
          } else if (msg.action === 'bye') {
            this.handleRemoteDisconnect();
          }
        }
      };
    } catch {
      this.bc = null;
    }
  }

  private openGuestBroadcastChannel(code: string): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const bc = new BroadcastChannel(`windtank-bc-v1-${code}`);
      this.bc = bc;
      bc.onmessage = (ev: MessageEvent<BroadcastEnvelope>) => {
        const msg = ev.data;
        if (!msg || !msg.__wtBc || msg.senderId === this.instanceId) return;
        if (msg.targetId && msg.targetId !== this.instanceId) return;

        if (msg.action === 'join_ack' && !this.state.connected) {
          this.bcPeerId = msg.senderId;
          this.onTransportEstablished('broadcast');
          this.sendGuestLobbyUpdate(this.state.guestReady);
          return;
        }

        if (this.bcPeerId === msg.senderId && this.state.transport === 'broadcast') {
          if (msg.action === 'packet' && msg.packet) {
            this.handlePacket(msg.packet);
          } else if (msg.action === 'bye') {
            this.handleRemoteDisconnect();
          }
        }
      };

      bc.postMessage({
        __wtBc: true,
        senderId: this.instanceId,
        action: 'join_req',
      } satisfies BroadcastEnvelope);
    } catch {
      this.bc = null;
    }
  }

  private bindDataConnection(conn: DataConnection, role: 'host' | 'guest'): void {
    const finalizeOpen = () => {
      if (this.state.connected) {
        if (this.conn !== conn) conn.close();
        return;
      }
      this.conn = conn;
      this.onTransportEstablished('webrtc');
      if (role === 'host') {
        this.broadcastHostLobbyState();
      } else {
        this.sendGuestLobbyUpdate(this.state.guestReady);
      }
    };

    conn.on('open', finalizeOpen);
    if (conn.open) {
      finalizeOpen();
    }

    conn.on('data', (raw) => {
      if (this.conn !== conn || this.state.transport !== 'webrtc') return;
      if (raw && typeof raw === 'object' && 't' in (raw as Record<string, unknown>)) {
        this.handlePacket(raw as PeerPacket);
      }
    });

    conn.on('close', () => {
      if (this.conn === conn && this.state.transport === 'webrtc') {
        this.handleRemoteDisconnect();
      }
    });

    conn.on('error', () => {
      if (this.conn === conn && this.state.transport === 'webrtc') {
        this.handleRemoteDisconnect();
      }
    });
  }

  private onTransportEstablished(transport: 'webrtc' | 'broadcast'): void {
    if (this.joinTimeoutId !== null) {
      clearTimeout(this.joinTimeoutId);
      this.joinTimeoutId = null;
    }
    this.peerDisconnectedDuringMatch = false;
    this.state.connected = true;
    this.state.transport = transport;
    this.state.status = 'ready_room';
    this.state.pingMs = transport === 'broadcast' ? 2 : 18;
    this.state.statusMessage =
      this.state.role === 'host'
        ? 'Đối thủ đã vào phòng! Chờ Khách bấm SẴN SÀNG để khai chiến.'
        : `Đã kết nối phòng ${this.state.formattedCode}! Chọn màu xe và bấm SẴN SÀNG.`;

    this.startPingHeartbeat();
    this.emitLobbyChange();
  }

  private startPingHeartbeat(): void {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
    }
    this.sendRaw({ t: 'ping', ts: performance.now() });
    this.pingIntervalId = window.setInterval(() => {
      if (this.state.connected) {
        this.sendRaw({ t: 'ping', ts: performance.now() });
      }
    }, 1200);
  }

  private sendRaw(packet: PeerPacket): void {
    if (!this.state.connected) return;
    if (this.state.transport === 'webrtc' && this.conn?.open) {
      this.conn.send(packet);
    } else if (this.state.transport === 'broadcast' && this.bc && this.bcPeerId) {
      this.bc.postMessage({
        __wtBc: true,
        senderId: this.instanceId,
        targetId: this.bcPeerId,
        action: 'packet',
        packet,
      } satisfies BroadcastEnvelope);
    }
  }

  syncHostSettingsFromManager(): void {
    if (this.state.role !== 'host') return;
    const s = settingsManager.getSettings();
    this.state.mapMode = s.mapMode;
    this.state.battleMode = s.battleMode;
    this.state.maxArmorHp = s.maxArmorHp;
    this.state.tntBarrelsOption = s.tntBarrelsOption;
    this.state.winningScore = s.winningScore;
    this.state.powerUpSpawnIntervalSec = s.powerUpSpawnIntervalSec;
    this.state.maxCratesOnFloor = s.maxCratesOnFloor;
    this.state.enabledSkills = s.enabledSkills.length > 0 ? [...s.enabledSkills] : [...ALL_SKILL_IDS];
    this.state.hostSkinId = settingsManager.getPlayerSkin(0);
    this.state.skinStatsEnabled = s.skinStatsEnabled;
    this.state.hostTouchActive = settingsManager.isTouchControlsActive();
    this.broadcastHostLobbyState();
    this.emitLobbyChange();
  }

  syncLobbyTankSkinFromWallet(): void {
    const ownedSkin = settingsManager.getPlayerSkin(0);
    if (this.state.role === 'host') {
      this.state.hostSkinId = ownedSkin;
      this.broadcastHostLobbyState();
      this.emitLobbyChange();
    } else if (this.state.role === 'guest') {
      this.state.guestSkinId = ownedSkin;
      this.sendGuestLobbyUpdate(this.state.guestReady, undefined, ownedSkin);
      this.emitLobbyChange();
    }
  }

  cycleLobbyTankSkin(slot: 'host' | 'guest'): void {
    if (slot === 'host' && this.state.role === 'host') {
      const next = settingsManager.cyclePlayerOwnedSkin(0, 1);
      this.state.hostSkinId = next;
      this.broadcastHostLobbyState();
      this.emitLobbyChange();
    } else if (slot === 'guest' && this.state.role === 'guest') {
      const next = settingsManager.cyclePlayerOwnedSkin(0, 1);
      this.state.guestSkinId = next;
      this.sendGuestLobbyUpdate(this.state.guestReady, undefined, next);
      this.emitLobbyChange();
    }
  }

  cycleLobbyTankColor(slot: 'host' | 'guest'): void {
    const currentId = slot === 'host' ? this.state.hostColorId : this.state.guestColorId;
    const otherId = slot === 'host' ? this.state.guestColorId : this.state.hostColorId;
    const idx = Math.max(0, TANK_PALETTES.findIndex((p) => p.id === currentId));

    for (let step = 1; step <= TANK_PALETTES.length; step++) {
      const candidate = TANK_PALETTES[(idx + step) % TANK_PALETTES.length].id;
      if (candidate !== otherId) {
        if (slot === 'host' && this.state.role === 'host') {
          this.state.hostColorId = candidate;
          this.broadcastHostLobbyState();
          this.emitLobbyChange();
        } else if (slot === 'guest' && this.state.role === 'guest') {
          this.state.guestColorId = candidate;
          this.sendGuestLobbyUpdate(this.state.guestReady, candidate);
          this.emitLobbyChange();
        }
        return;
      }
    }
  }

  toggleGuestReady(): void {
    if (this.state.role !== 'guest' || !this.state.connected) return;
    const next = !this.state.guestReady;
    this.state.guestReady = next;
    this.sendGuestLobbyUpdate(next);
    this.emitLobbyChange();
  }

  private broadcastHostLobbyState(): void {
    if (this.state.role !== 'host' || !this.state.connected) return;
    this.state.hostTouchActive = settingsManager.isTouchControlsActive();
    this.sendRaw({
      t: 'lobby_state',
      roomCode: this.state.roomCode,
      hostColorId: this.state.hostColorId,
      guestColorId: this.state.guestColorId,
      hostSkinId: this.state.hostSkinId,
      guestSkinId: this.state.guestSkinId,
      skinStatsEnabled: this.state.skinStatsEnabled,
      guestReady: this.state.guestReady,
      hostTouchActive: this.state.hostTouchActive,
      guestTouchActive: this.state.guestTouchActive,
      mapMode: this.state.mapMode,
      battleMode: this.state.battleMode,
      maxArmorHp: this.state.maxArmorHp,
      tntBarrelsOption: this.state.tntBarrelsOption,
      winningScore: this.state.winningScore,
      powerUpSpawnIntervalSec: this.state.powerUpSpawnIntervalSec,
      maxCratesOnFloor: this.state.maxCratesOnFloor,
      enabledSkills: this.state.enabledSkills,
    });
  }

  private sendGuestLobbyUpdate(
    ready: boolean,
    preferredColorId?: string,
    preferredSkinId?: TankSkinId,
  ): void {
    if (this.state.role !== 'guest' || !this.state.connected) return;
    this.state.guestTouchActive = settingsManager.isTouchControlsActive();
    this.sendRaw({
      t: 'guest_lobby_update',
      preferredColorId,
      preferredSkinId: preferredSkinId ?? this.state.guestSkinId,
      ready,
      guestTouchActive: this.state.guestTouchActive,
    });
  }

  /**
   * Host launches the synchronized 1vs1 match with an authoritative Round 1 MazeGridData & Viewport!
   */
  hostStartMatch(overrideSeed?: number): OnlineMatchConfig | null {
    if (this.state.role !== 'host' || !this.state.connected) return null;
    this.syncHostSettingsFromManager();

    const matchSeed = overrideSeed ?? (((Date.now() ^ 0x9e3779b9) >>> 0) || 4829);
    const hostTouch = Boolean(this.state.hostTouchActive);
    const guestTouch = Boolean(this.state.guestTouchActive);
    const authoritativeViewport = resolveOnlineArenaViewport(hostTouch, guestTouch);
    const authoritativeGrid = this.buildAuthoritativeRoundGrid(this.state.mapMode, 1, matchSeed);

    const config: OnlineMatchConfig = {
      matchSeed,
      useMobileViewport: Boolean(hostTouch || guestTouch),
      hostTouchActive: hostTouch,
      guestTouchActive: guestTouch,
      authoritativeViewport: { ...authoritativeViewport },
      authoritativeRound: 1,
      authoritativeGrid,
      hostColorId: this.state.hostColorId,
      guestColorId: this.state.guestColorId,
      hostSkinId: this.state.hostSkinId,
      guestSkinId: this.state.guestSkinId,
      skinStatsEnabled: this.state.skinStatsEnabled,
      mapMode: this.state.mapMode,
      battleMode: this.state.battleMode,
      maxArmorHp: this.state.maxArmorHp,
      tntBarrelsOption: this.state.tntBarrelsOption,
      winningScore: this.state.winningScore,
      powerUpSpawnIntervalSec: this.state.powerUpSpawnIntervalSec,
      maxCratesOnFloor: this.state.maxCratesOnFloor,
      enabledSkills: [...this.state.enabledSkills],
    };

    this.prepareMatchBuffers(config);
    this.sendRaw({ t: 'match_start', config });

    for (const fn of this.matchStartListeners) {
      fn(config);
    }
    return config;
  }

  hostTriggerRematch(): OnlineMatchConfig | null {
    if (this.state.role !== 'host' || !this.state.connected) return null;
    this.syncHostSettingsFromManager();
    const matchSeed = ((Date.now() ^ 0x517cc1b7) >>> 0) || 7777;
    const hostTouch = Boolean(this.state.hostTouchActive);
    const guestTouch = Boolean(this.state.guestTouchActive);
    const authoritativeViewport = resolveOnlineArenaViewport(hostTouch, guestTouch);
    const authoritativeGrid = this.buildAuthoritativeRoundGrid(this.state.mapMode, 1, matchSeed);

    const config: OnlineMatchConfig = {
      matchSeed,
      useMobileViewport: Boolean(hostTouch || guestTouch),
      hostTouchActive: hostTouch,
      guestTouchActive: guestTouch,
      authoritativeViewport: { ...authoritativeViewport },
      authoritativeRound: 1,
      authoritativeGrid,
      hostColorId: this.state.hostColorId,
      guestColorId: this.state.guestColorId,
      hostSkinId: this.state.hostSkinId,
      guestSkinId: this.state.guestSkinId,
      skinStatsEnabled: this.state.skinStatsEnabled,
      mapMode: this.state.mapMode,
      battleMode: this.state.battleMode,
      maxArmorHp: this.state.maxArmorHp,
      tntBarrelsOption: this.state.tntBarrelsOption,
      winningScore: this.state.winningScore,
      powerUpSpawnIntervalSec: this.state.powerUpSpawnIntervalSec,
      maxCratesOnFloor: this.state.maxCratesOnFloor,
      enabledSkills: [...this.state.enabledSkills],
    };
    this.prepareMatchBuffers(config);
    this.sendEvent({ kind: 'rematch_start', config });
    return config;
  }

  private prepareMatchBuffers(config: OnlineMatchConfig): void {
    this.activeMatchConfig = config;
    this.state.status = 'in_match';
    this.peerDisconnectedDuringMatch = false;
    this.guestSeq = 0;
    this.snapshotSeq = 0;
    this.latestSnapshot = null;
    this.pendingNetEvents = [];
    this.lastConsumedGuestFireCount = 0;
    this.guestFirePendingCount = 0;
    this.latestGuestInput = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      fireHeld: false,
      firePressCount: 0,
    };
  }

  // --- Match Runtime Data Methods ---

  sendGuestInput(input: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    fireHeld: boolean;
    firePressCount: number;
  }): void {
    if (this.state.role !== 'guest' || !this.state.connected) return;
    this.sendRaw({
      t: 'guest_input',
      seq: ++this.guestSeq,
      ...input,
    });
  }

  readGuestInputOnHost(): PlayerInputState {
    return {
      forward: this.latestGuestInput.forward,
      backward: this.latestGuestInput.backward,
      left: this.latestGuestInput.left,
      right: this.latestGuestInput.right,
      firePressed: this.guestFirePendingCount > 0,
      fireHeld: this.latestGuestInput.fireHeld,
      fireBufferedUntil: this.guestFirePendingCount > 0 ? 999999 : -1,
    };
  }

  consumeGuestBufferedFireOnHost(): boolean {
    if (this.guestFirePendingCount > 0) {
      this.guestFirePendingCount--;
      return true;
    }
    return false;
  }

  sendWorldSnapshot(payload: Omit<WorldSnapshotPacket, 't' | 'seq'>): void {
    if (this.state.role !== 'host' || !this.state.connected) return;
    this.sendRaw({
      t: 'world_snapshot',
      seq: ++this.snapshotSeq,
      ...payload,
    });
  }

  consumeLatestSnapshotOnGuest(): WorldSnapshotPacket | null {
    const snap = this.latestSnapshot;
    this.latestSnapshot = null;
    return snap;
  }

  sendEvent(event: NetGameEvent): void {
    if (this.state.role !== 'host' || !this.state.connected) return;
    this.sendRaw({ t: 'net_event', event });
  }

  drainPendingEventsOnGuest(): NetGameEvent[] {
    if (this.pendingNetEvents.length === 0) return [];
    const copy = [...this.pendingNetEvents];
    this.pendingNetEvents.length = 0;
    return copy;
  }

  private handlePacket(pkt: PeerPacket): void {
    switch (pkt.t) {
      case 'ping':
        this.sendRaw({ t: 'pong', ts: pkt.ts });
        return;

      case 'pong': {
        const rtt = Math.max(1, Math.round(performance.now() - pkt.ts));
        this.state.pingMs =
          this.state.pingMs > 0 ? Math.round(this.state.pingMs * 0.65 + rtt * 0.35) : rtt;
        this.emitLobbyChange();
        return;
      }

      case 'lobby_state':
        if (this.state.role === 'guest') {
          this.state.hostColorId = pkt.hostColorId;
          this.state.guestColorId = pkt.guestColorId;
          if (pkt.hostSkinId && isValidTankSkinId(pkt.hostSkinId)) {
            this.state.hostSkinId = pkt.hostSkinId;
          }
          if (pkt.guestSkinId && isValidTankSkinId(pkt.guestSkinId)) {
            this.state.guestSkinId = pkt.guestSkinId;
          }
          if (typeof pkt.skinStatsEnabled === 'boolean') {
            this.state.skinStatsEnabled = pkt.skinStatsEnabled;
          }
          this.state.guestReady = pkt.guestReady;
          this.state.hostTouchActive = pkt.hostTouchActive;
          if (typeof pkt.guestTouchActive === 'boolean') {
            this.state.guestTouchActive = pkt.guestTouchActive;
          }
          this.state.mapMode = pkt.mapMode;
          this.state.battleMode = pkt.battleMode ?? 'classic';
          this.state.maxArmorHp = pkt.maxArmorHp ?? 100;
          this.state.tntBarrelsOption = pkt.tntBarrelsOption ?? 'auto';
          this.state.winningScore = pkt.winningScore;
          this.state.powerUpSpawnIntervalSec = pkt.powerUpSpawnIntervalSec;
          this.state.maxCratesOnFloor = pkt.maxCratesOnFloor;
          this.state.enabledSkills = [...pkt.enabledSkills];
          this.emitLobbyChange();
        }
        return;

      case 'guest_lobby_update':
        if (this.state.role === 'host') {
          if (pkt.preferredColorId && pkt.preferredColorId !== this.state.hostColorId) {
            this.state.guestColorId = pkt.preferredColorId;
          } else if (this.state.guestColorId === this.state.hostColorId) {
            this.state.guestColorId =
              TANK_PALETTES.find((p) => p.id !== this.state.hostColorId)?.id ?? 'green';
          }
          if (pkt.preferredSkinId && isValidTankSkinId(pkt.preferredSkinId)) {
            this.state.guestSkinId = pkt.preferredSkinId;
          }
          this.state.guestReady = pkt.ready;
          this.state.guestTouchActive = pkt.guestTouchActive;
          this.state.statusMessage = pkt.ready
            ? 'Khách đã SẴN SÀNG! Bấm "BẮT ĐẦU ĐẤU 1VS1" ngay!'
            : 'Đối thủ đang chọn màu xe… Chờ Khách bấm SẴN SÀNG.';
          this.broadcastHostLobbyState();
          this.emitLobbyChange();
        }
        return;

      case 'match_start':
        if (this.state.role === 'guest') {
          this.prepareMatchBuffers(pkt.config);
          this.emitLobbyChange();
          for (const fn of this.matchStartListeners) {
            fn(pkt.config);
          }
        }
        return;

      case 'request_arena_sync':
        if (this.state.role === 'host') {
          this.hostArenaSyncResponder?.(pkt.roundNumber);
        }
        return;

      case 'guest_input':
        if (this.state.role === 'host') {
          this.latestGuestInput = {
            forward: pkt.forward,
            backward: pkt.backward,
            left: pkt.left,
            right: pkt.right,
            fireHeld: pkt.fireHeld,
            firePressCount: pkt.firePressCount,
          };
          if (pkt.firePressCount > this.lastConsumedGuestFireCount) {
            const delta = Math.min(4, pkt.firePressCount - this.lastConsumedGuestFireCount);
            this.guestFirePendingCount = Math.min(4, this.guestFirePendingCount + delta);
            this.lastConsumedGuestFireCount = pkt.firePressCount;
          }
        }
        return;

      case 'world_snapshot':
        if (this.state.role === 'guest') {
          if (!this.latestSnapshot || pkt.seq >= this.latestSnapshot.seq) {
            this.latestSnapshot = pkt;
          }
        }
        return;

      case 'net_event':
        if (this.state.role === 'guest') {
          if (pkt.event.kind === 'rematch_start') {
            this.prepareMatchBuffers(pkt.event.config);
            this.pendingNetEvents.push(pkt.event);
          } else {
            this.pendingNetEvents.push(pkt.event);
          }
        }
        return;

      case 'peer_bye':
        this.handleRemoteDisconnect();
        return;
    }
  }

  private handleRemoteDisconnect(): void {
    const wasInMatch = this.state.status === 'in_match';
    this.state.connected = false;
    this.state.guestReady = false;
    this.conn = null;
    this.bcPeerId = null;

    if (wasInMatch) {
      this.peerDisconnectedDuringMatch = true;
      this.state.status = 'error';
      this.state.statusMessage = 'Đối thủ đã ngắt kết nối khỏi trận đấu Online.';
    } else if (this.state.role === 'host') {
      this.state.transport = 'none';
      this.state.status = 'waiting_guest';
      this.state.statusMessage = `Đối thủ đã rời phòng. Đang chờ người mới vào ${this.state.formattedCode}…`;
    } else {
      this.state.status = 'error';
      this.state.statusMessage = 'Chủ Phòng đã đóng phòng đấu.';
    }
    this.emitLobbyChange();
  }

  disconnect(silent = false): void {
    if (this.joinTimeoutId !== null) {
      clearTimeout(this.joinTimeoutId);
      this.joinTimeoutId = null;
    }
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }

    try {
      if (this.state.connected) {
        if (this.state.transport === 'webrtc' && this.conn?.open) {
          this.conn.send({ t: 'peer_bye' });
        } else if (this.state.transport === 'broadcast' && this.bc && this.bcPeerId) {
          this.bc.postMessage({
            __wtBc: true,
            senderId: this.instanceId,
            targetId: this.bcPeerId,
            action: 'bye',
          } satisfies BroadcastEnvelope);
        }
      }
    } catch {
      // Ignore teardown errors
    }

    try {
      this.conn?.close();
    } catch {
      // Ignore
    }
    this.conn = null;

    try {
      this.peer?.destroy();
    } catch {
      // Ignore
    }
    this.peer = null;

    try {
      this.bc?.close();
    } catch {
      // Ignore
    }
    this.bc = null;
    this.bcPeerId = null;
    this.activeMatchConfig = null;
    this.latestSnapshot = null;
    this.pendingNetEvents = [];
    this.peerDisconnectedDuringMatch = false;

    this.state = this.createDefaultState();
    if (!silent) {
      this.emitLobbyChange();
    }
  }
}

export const peerMultiplayer = new PeerMultiplayerManager();

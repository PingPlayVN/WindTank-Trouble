import { settingsManager } from './SettingsManager';

/**
 * Zero-dependency Web Audio API arcade sound synthesizer crafted for WindTank:
 * punchy cannon pop, pitched wall ricochets, layered tank explosions, crate drops,
 * superhero transformations, 2s laser charge + blast, spike bursts, gatling fire, and radar lock.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private unlocked = false;

  unlock(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this.noiseBuffer = this.createNoiseBuffer(this.ctx, 0.7);
      } catch {
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
  }

  private getGainScale(): number {
    const s = settingsManager.getSettings();
    if (!s.soundEnabled) return 0;
    return s.masterVolume;
  }

  private ensureReady(): AudioContext | null {
    const vol = this.getGainScale();
    if (vol <= 0.001) return null;
    if (!this.unlocked) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  playFire(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.28;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.09);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);

    this.playFilteredNoise(ctx, now, 0.045, 1600, 'bandpass', vol * 0.55);
  }

  playWallBounce(bounceCount = 1): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.16;

    const pitchFactor = 1 + Math.min(bounceCount, 12) * 0.035;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520 * pitchFactor, now);
    osc.frequency.exponentialRampToValueAtTime(260 * pitchFactor, now + 0.038);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  playTankExplosion(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.45;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.38);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);

    this.playFilteredNoise(ctx, now, 0.36, 680, 'lowpass', vol * 0.98);
    this.playFilteredNoise(ctx, now + 0.02, 0.2, 2200, 'bandpass', vol * 0.5);
  }

  playCountdownTick(isFinalGo = false): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.2;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const freq = isFinalGo ? 784 : 440;
    const dur = isFinalGo ? 0.16 : 0.085;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  playScorePoint(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.22;

    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    });
  }

  playRoundTie(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.2;

    [310, 245].forEach((freq, idx) => {
      const start = now + idx * 0.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol * 0.65, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  playMatchVictory(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.25;

    const melody = [523.25, 659.25, 783.99, 1046.5];
    melody.forEach((freq, idx) => {
      const start = now + idx * 0.095;
      const dur = idx === melody.length - 1 ? 0.38 : 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  playUiClick(subtle = false): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * (subtle ? 0.08 : 0.16);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(subtle ? 620 : 720, now);
    osc.frequency.exponentialRampToValueAtTime(subtle ? 480 : 420, now + 0.035);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  playCrateSpawn(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.22;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.11);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);

    const ping = ctx.createOscillator();
    const pGain = ctx.createGain();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(880, now + 0.04);
    ping.frequency.exponentialRampToValueAtTime(1320, now + 0.16);
    pGain.gain.setValueAtTime(vol * 0.55, now + 0.04);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    ping.connect(pGain).connect(ctx.destination);
    ping.start(now + 0.04);
    ping.stop(now + 0.19);
  }

  playPowerUpEquip(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.24;

    this.playFilteredNoise(ctx, now, 0.08, 1200, 'bandpass', vol * 0.65);

    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.048;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol * 0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  playLaserCharge(durationSec = 2.0): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.24;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(1480, now + durationSec);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(vol, now + durationSec * 0.88);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, now);
    sub.frequency.exponentialRampToValueAtTime(520, now + durationSec);
    subGain.gain.setValueAtTime(0.01, now);
    subGain.gain.linearRampToValueAtTime(vol * 0.65, now + durationSec * 0.9);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    sub.connect(subGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + durationSec + 0.02);
  }

  playLaserBlast(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.48;

    const sub = ctx.createOscillator();
    const sGain = ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(360, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.48);
    sGain.gain.setValueAtTime(vol, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    sub.connect(sGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.52);

    const zap = ctx.createOscillator();
    const zGain = ctx.createGain();
    zap.type = 'square';
    zap.frequency.setValueAtTime(2200, now);
    zap.frequency.exponentialRampToValueAtTime(190, now + 0.32);
    zGain.gain.setValueAtTime(vol * 0.55, now);
    zGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    zap.connect(zGain).connect(ctx.destination);
    zap.start(now);
    zap.stop(now + 0.35);

    const chime = ctx.createOscillator();
    const cGain = ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(1320, now + 0.03);
    chime.frequency.exponentialRampToValueAtTime(440, now + 0.36);
    cGain.gain.setValueAtTime(vol * 0.35, now + 0.03);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    chime.connect(cGain).connect(ctx.destination);
    chime.start(now + 0.03);
    chime.stop(now + 0.39);

    this.playFilteredNoise(ctx, now, 0.44, 1950, 'bandpass', vol * 0.9);
  }

  playSpikeBurst(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.38;

    const boom = ctx.createOscillator();
    const bGain = ctx.createGain();
    boom.type = 'triangle';
    boom.frequency.setValueAtTime(170, now);
    boom.frequency.exponentialRampToValueAtTime(42, now + 0.28);
    bGain.gain.setValueAtTime(vol, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    boom.connect(bGain).connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.31);

    this.playFilteredNoise(ctx, now, 0.24, 2800, 'highpass', vol * 0.75);
  }

  playGatlingFire(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.22;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(390, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.055);
    gain.gain.setValueAtTime(vol * 0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);

    this.playFilteredNoise(ctx, now, 0.035, 2400, 'bandpass', vol * 0.55);
  }

  playMissileLock(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.24;

    [1320, 1760].forEach((freq, idx) => {
      const t = now + idx * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    });

    this.playFilteredNoise(ctx, now + 0.1, 0.22, 1100, 'bandpass', vol * 0.55);
  }

  playShieldActivate(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.24;
    [587.33, 880, 1174.66].forEach((freq, idx) => {
      const t = now + idx * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  playShieldDeflect(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.24;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.09);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playMineDeploy(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.2;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.setValueAtTime(640, now + 0.04);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playWallDrill(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.34;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
    this.playFilteredNoise(ctx, now, 0.16, 950, 'bandpass', vol * 0.85);
  }

  playFlameSpray(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.14;
    this.playFilteredNoise(ctx, now, 0.075, 850, 'lowpass', vol);
  }

  playScatterShot(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.36;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.15);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
    this.playFilteredNoise(ctx, now, 0.12, 1500, 'bandpass', vol * 0.8);
  }

  playReaperActivate(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.3;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.42);
    gain.gain.setValueAtTime(vol * 0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  playEmpLaunch(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.16);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playEmpBlast(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.38;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.34);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);
    this.playFilteredNoise(ctx, now, 0.22, 2400, 'bandpass', vol * 0.72);
  }

  playPhantomActivate(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.28;
    for (const [freqStart, freqEnd, delay] of [
      [330, 660, 0],
      [495, 990, 0.05],
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqStart, now + delay);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, now + delay + 0.28);
      gain.gain.setValueAtTime(vol * 0.75, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.34);
    }
  }

  playCryoShot(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.26;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playCryoShatter(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.32;
    for (const [f, d] of [
      [1320, 0],
      [1760, 0.035],
      [1046, 0.07],
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + d);
      osc.frequency.exponentialRampToValueAtTime(f * 0.65, now + d + 0.15);
      gain.gain.setValueAtTime(vol * 0.65, now + d);
      gain.gain.exponentialRampToValueAtTime(0.001, now + d + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + d);
      osc.stop(now + d + 0.18);
    }
    this.playFilteredNoise(ctx, now, 0.16, 3600, 'highpass', vol * 0.6);
  }

  playBarrierDeploy(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.18);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  playWarpBeacon(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.26;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playWarpTeleport(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = this.getGainScale() * 0.36;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(1240, now + 0.24);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    this.playFilteredNoise(ctx, now, 0.18, 1900, 'bandpass', vol * 0.7);
  }

  private playFilteredNoise(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    cutoffHz: number,
    filterType: BiquadFilterType,
    volume: number,
  ): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoffHz, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, volume), startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

export const audioManager = new AudioManager();

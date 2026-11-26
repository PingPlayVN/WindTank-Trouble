import { BASE_GAMEPLAY } from '../config/constants';
import { audioManager } from '../managers/AudioManager';
import type { ScoreManager } from '../managers/ScoreManager';
import type { Tank } from '../entities/Tank';
import type { PlayerIndex, RoundPhase, RoundResultSummary } from '../types/gameTypes';

export interface MatchSystemCallbacks {
  onCountdownStep: (label: string) => void;
  onFightStart: () => void;
  onRoundResolved: (summary: RoundResultSummary) => void;
  onAdvanceNextRound: () => void;
  onMatchVictory: (summary: RoundResultSummary) => void;
}

/**
 * Orchestrates the authentic Tank Trouble round lifecycle:
 * `countdown` -> `playing` -> `aftermath` (1.75s post-kill window allowing double-KO ties!)
 * -> `round_end` -> next round or `match_over`.
 */
export class MatchSystem {
  private phase: RoundPhase = 'countdown';
  private phaseTimer: number = BASE_GAMEPLAY.roundCountdownSec;
  private lastCountdownStep = -1;
  private pendingSummary: RoundResultSummary | null = null;

  private readonly scoreManager: ScoreManager;
  private readonly callbacks: MatchSystemCallbacks;

  constructor(scoreManager: ScoreManager, callbacks: MatchSystemCallbacks) {
    this.scoreManager = scoreManager;
    this.callbacks = callbacks;
  }

  startRoundCountdown(): void {
    this.phase = 'countdown';
    this.phaseTimer = BASE_GAMEPLAY.roundCountdownSec;
    this.lastCountdownStep = 4;
    this.pendingSummary = null;
    this.callbacks.onCountdownStep('3');
    audioManager.playCountdownTick(false);
  }

  getPhase(): RoundPhase {
    return this.phase;
  }

  isSimulationActive(): boolean {
    return this.phase === 'playing' || this.phase === 'aftermath';
  }

  getPhaseTimer(): number {
    return this.phaseTimer;
  }

  update(dt: number, tanks: readonly Tank[]): void {
    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      const step = Math.ceil((this.phaseTimer / BASE_GAMEPLAY.roundCountdownSec) * 3);
      if (step >= 1 && step < this.lastCountdownStep) {
        this.lastCountdownStep = step;
        this.callbacks.onCountdownStep(String(step));
        audioManager.playCountdownTick(false);
      }
      if (this.phaseTimer <= 0) {
        this.phase = 'playing';
        this.phaseTimer = 0;
        audioManager.playCountdownTick(true);
        this.callbacks.onFightStart();
      }
      return;
    }

    if (this.phase === 'playing') {
      const aliveTanks = tanks.filter((t) => t.kinematics.alive);
      if (aliveTanks.length === 0) {
        // Simultaneous mutual elimination -> immediate tie resolution
        this.resolveRound(null);
      } else if (aliveTanks.length === 1) {
        // Enter authentic Tank Trouble aftermath window so stray ricochets can still tie!
        this.phase = 'aftermath';
        this.phaseTimer = BASE_GAMEPLAY.roundAftermathSec;
      }
      return;
    }

    if (this.phase === 'aftermath') {
      const aliveTanks = tanks.filter((t) => t.kinematics.alive);
      if (aliveTanks.length === 0) {
        // Survivor got hit by a bouncing shell during aftermath -> DRAW!
        this.resolveRound(null);
        return;
      }
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        const survivor: PlayerIndex | null = aliveTanks.length === 1 ? aliveTanks[0].index : null;
        this.resolveRound(survivor);
      }
      return;
    }

    if (this.phase === 'round_end') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0 && this.pendingSummary) {
        const summary = this.pendingSummary;
        this.pendingSummary = null;
        if (summary.matchWinnerIndex !== null) {
          this.phase = 'match_over';
          audioManager.playMatchVictory();
          this.callbacks.onMatchVictory(summary);
        } else {
          this.scoreManager.advanceToNextRound();
          this.callbacks.onAdvanceNextRound();
        }
      }
    }
  }

  private resolveRound(winnerIndex: PlayerIndex | null): void {
    const summary = this.scoreManager.recordRoundOutcome(winnerIndex);
    this.pendingSummary = summary;
    this.phase = 'round_end';
    this.phaseTimer = BASE_GAMEPLAY.roundEndBannerSec;

    if (winnerIndex !== null) {
      audioManager.playScorePoint();
    } else {
      audioManager.playRoundTie();
    }
    this.callbacks.onRoundResolved(summary);
  }
}

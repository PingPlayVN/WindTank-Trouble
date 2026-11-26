import type { PlayerIndex, RoundResultSummary } from '../types/gameTypes';

export class ScoreManager {
  private scores: number[] = [0, 0, 0, 0];
  private ties = 0;
  private roundNumber = 1;
  private winningScore: number;
  private playerCount: number;

  constructor(playerCount: number, winningScore: number) {
    this.playerCount = playerCount;
    this.winningScore = winningScore;
  }

  resetMatch(playerCount = this.playerCount, winningScore = this.winningScore): void {
    this.playerCount = playerCount;
    this.winningScore = winningScore;
    this.scores = [0, 0, 0, 0];
    this.ties = 0;
    this.roundNumber = 1;
  }

  getRoundNumber(): number {
    return this.roundNumber;
  }

  getScores(): number[] {
    return this.scores.slice(0, this.playerCount);
  }

  getScore(playerIndex: PlayerIndex): number {
    return this.scores[playerIndex] ?? 0;
  }

  getTies(): number {
    return this.ties;
  }

  getWinningScore(): number {
    return this.winningScore;
  }

  setWinningScore(winningScore: number): void {
    this.winningScore = winningScore;
  }

  recordRoundOutcome(winnerIndex: PlayerIndex | null): RoundResultSummary {
    if (winnerIndex !== null && winnerIndex < this.playerCount) {
      this.scores[winnerIndex] += 1;
    } else {
      this.ties += 1;
    }

    let matchWinnerIndex: PlayerIndex | null = null;
    if (this.winningScore > 0 && winnerIndex !== null && this.scores[winnerIndex] >= this.winningScore) {
      matchWinnerIndex = winnerIndex;
    }

    const summary: RoundResultSummary = {
      roundNumber: this.roundNumber,
      winnerIndex,
      scores: this.getScores(),
      ties: this.ties,
      matchWinnerIndex,
    };

    return summary;
  }

  advanceToNextRound(): void {
    this.roundNumber += 1;
  }

  syncFromNetwork(scores: readonly number[], ties: number, roundNumber?: number): void {
    for (let i = 0; i < this.playerCount && i < scores.length; i++) {
      this.scores[i] = scores[i] ?? 0;
    }
    this.ties = ties;
    if (typeof roundNumber === 'number' && roundNumber >= 1) {
      this.roundNumber = roundNumber;
    }
  }
}

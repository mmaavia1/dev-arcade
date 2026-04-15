import { Injectable } from '@angular/core';

export interface GameScore { best: number; plays: number; }

@Injectable({ providedIn: 'root' })
export class HubScoreService {
  private readonly KEY = 'devgames_scores';

  getAll(): Record<string, GameScore> {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (_e) { return {}; }
  }

  getBest(gameId: string): number {
    return this.getAll()[gameId]?.best ?? 0;
  }

  save(gameId: string, score: number): void {
    const all = this.getAll();
    const prev = all[gameId] ?? { best: 0, plays: 0 };
    all[gameId] = { best: Math.max(prev.best, score), plays: prev.plays + 1 };
    localStorage.setItem(this.KEY, JSON.stringify(all));
  }
}

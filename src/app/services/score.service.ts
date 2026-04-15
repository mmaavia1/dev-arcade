import { Injectable } from '@angular/core';

export interface ScoreEntry {
  score: number;
  date: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ScoreService {
  private readonly STORAGE_KEY = 'flappy_high_scores';
  private readonly MAX_ENTRIES = 10;

  getHighScores(): ScoreEntry[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : this.defaultScores();
    } catch (_e) {
      return this.defaultScores();
    }
  }

  private defaultScores(): ScoreEntry[] {
    const seeds: ScoreEntry[] = [
      { name: 'mmaavia', score: 99, date: '4/15/2026' },
      { name: 'mmaavia', score: 75, date: '4/15/2026' },
      { name: 'mmaavia', score: 50, date: '4/15/2026' },
    ];
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(seeds));
    return seeds;
  }

  getBestScore(): number {
    const scores = this.getHighScores();
    return scores.length ? scores[0].score : 0;
  }

  isHighScore(score: number): boolean {
    if (score === 0) return false;
    const scores = this.getHighScores();
    if (scores.length < this.MAX_ENTRIES) return true;
    return score > scores[scores.length - 1].score;
  }

  saveScore(score: number, name: string = 'Anonymous'): boolean {
    if (score === 0) return false;
    const isNew = this.isHighScore(score);
    if (!isNew) return false;

    const scores = this.getHighScores();
    const entry: ScoreEntry = {
      score,
      name: name.trim() || 'Anonymous',
      date: new Date().toLocaleDateString()
    };
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    const trimmed = scores.slice(0, this.MAX_ENTRIES);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmed));
    return true;
  }

  clearScores(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

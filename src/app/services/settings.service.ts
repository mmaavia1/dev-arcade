import { Injectable, signal } from '@angular/core';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameSettings {
  soundEnabled: boolean;
  difficulty: Difficulty;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly STORAGE_KEY = 'flappy_settings';

  private _settings = signal<GameSettings>(this.load());

  readonly settings = this._settings.asReadonly();

  private load(): GameSettings {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? { ...this.defaults(), ...JSON.parse(raw) } : this.defaults();
    } catch (_e) {
      return this.defaults();
    }
  }

  private defaults(): GameSettings {
    return { soundEnabled: true, difficulty: 'easy' };
  }

  private save(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._settings()));
  }

  toggleSound(): void {
    this._settings.update(s => ({ ...s, soundEnabled: !s.soundEnabled }));
    this.save();
  }

  setDifficulty(difficulty: Difficulty): void {
    this._settings.update(s => ({ ...s, difficulty }));
    this.save();
  }

  getDifficultyParams(): { pipeSpeed: number; pipeGap: number; spawnRate: number } {
    switch (this._settings().difficulty) {
      case 'easy':   return { pipeSpeed: 1.8, pipeGap: 210, spawnRate: 150 };
      case 'hard':   return { pipeSpeed: 4.5, pipeGap: 130, spawnRate: 80 };
      default:       return { pipeSpeed: 3.2, pipeGap: 155, spawnRate: 100 };
    }
  }
}

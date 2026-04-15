import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

interface Bug { id: number; x: number; y: number; speed: number; emoji: string; size: number; angle: number; rotSpeed: number; }

@Component({ selector: 'app-bug-squash', standalone: true, templateUrl: './bug-squash.component.html', styleUrl: './bug-squash.component.scss' })
export class BugSquashComponent implements OnInit, OnDestroy {
  readonly GAME_ID = 'bug-squash';
  state: 'ready' | 'playing' | 'dead' = 'ready';
  score = 0; lives = 3; level = 1; bestScore = 0;
  bugs: Bug[] = [];
  particles: Array<{ id: number; x: number; y: number; emoji: string; life: number }> = [];

  private spawnTimer: any; private levelTimer: any;
  private bugId = 0; private particleId = 0;
  private spawnInterval = 1400;
  private readonly EMOJIS = ['🐛','🐞','🦗','🦟','🐜','🕷️'];

  constructor(private router: Router, private scoreService: HubScoreService) {}

  ngOnInit(): void { this.bestScore = this.scoreService.getBest(this.GAME_ID); }
  ngOnDestroy(): void { this.clearTimers(); }

  startGame(): void {
    this.state = 'playing'; this.score = 0; this.lives = 3; this.level = 1;
    this.bugs = []; this.particles = []; this.spawnInterval = 1400;
    this.scheduleSpawn(); this.startLevelTimer();
  }

  private scheduleSpawn(): void {
    this.spawnTimer = setTimeout(() => {
      if (this.state !== 'playing') return;
      this.spawnBug();
      this.scheduleSpawn();
    }, this.spawnInterval + Math.random() * 400 - 200);
  }

  private startLevelTimer(): void {
    this.levelTimer = setInterval(() => {
      if (this.state !== 'playing') return;
      this.level++;
      this.spawnInterval = Math.max(500, this.spawnInterval - 120);
    }, 8000);
  }

  private spawnBug(): void {
    const margin = 60;
    const area = document.querySelector('.game-area');
    const w = area?.clientWidth ?? 600;
    const h = area?.clientHeight ?? 500;
    this.bugs.push({
      id: this.bugId++,
      x: margin + Math.random() * (w - margin * 2),
      y: margin + Math.random() * (h - margin * 2),
      speed: 0.6 + this.level * 0.25 + Math.random() * 0.5,
      emoji: this.EMOJIS[Math.floor(Math.random() * this.EMOJIS.length)],
      size: 36 + Math.random() * 20,
      angle: 0, rotSpeed: (Math.random() - 0.5) * 6
    });

    // Bug escapes after 4s
    setTimeout(() => {
      const idx = this.bugs.findIndex(b => b.id === this.bugs[this.bugs.length - 1]?.id);
      this.bugEscape(this.bugId - 1);
    }, Math.max(2200, 4000 - this.level * 200));
  }

  private bugEscape(id: number): void {
    const idx = this.bugs.findIndex(b => b.id === id);
    if (idx === -1 || this.state !== 'playing') return;
    this.bugs.splice(idx, 1);
    this.lives--;
    if (this.lives <= 0) this.endGame();
  }

  squash(bug: Bug, event: MouseEvent): void {
    event.stopPropagation();
    if (this.state !== 'playing') return;
    const idx = this.bugs.findIndex(b => b.id === bug.id);
    if (idx === -1) return;
    this.bugs.splice(idx, 1);
    this.score += 10 * this.level;
    this.spawnParticle(bug.x, bug.y, bug.emoji);
  }

  private spawnParticle(x: number, y: number, emoji: string): void {
    const p = { id: this.particleId++, x, y, emoji, life: 1 };
    this.particles.push(p);
    setTimeout(() => { this.particles = this.particles.filter(pt => pt.id !== p.id); }, 700);
  }

  private endGame(): void {
    this.state = 'dead';
    this.clearTimers();
    this.bugs = [];
    this.scoreService.save(this.GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(this.GAME_ID);
  }

  private clearTimers(): void {
    clearTimeout(this.spawnTimer);
    clearInterval(this.levelTimer);
  }

  goHome(): void { this.router.navigate(['/']); }
  playAgain(): void { this.startGame(); }
  livesArr(): number[] { return Array(this.lives).fill(0); }
}

import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

interface TestItem { id: number; x: number; y: number; type: 'pass' | 'fail'; speed: number; label: string; }

const PASS_LABELS = ['✅ login.test','✅ api.spec','✅ auth.test','✅ db.spec','✅ util.test','✅ ui.spec'];
const FAIL_LABELS = ['❌ crash.test','❌ null.spec','❌ timeout','❌ 500.test','❌ broken.spec','❌ leak.test'];

@Component({ selector: 'app-test-runner', standalone: true, templateUrl: './test-runner.component.html', styleUrl: './test-runner.component.scss' })
export class TestRunnerComponent implements OnInit, OnDestroy {
  readonly GAME_ID = 'test-runner';
  @ViewChild('arena', { static: false }) arenaRef!: ElementRef<HTMLDivElement>;

  state: 'ready' | 'playing' | 'dead' = 'ready';
  score = 0; lives = 3; bestScore = 0;
  items: TestItem[] = [];
  catcherX = 50; // percent
  feedback: 'good' | 'bad' | null = null;
  private itemId = 0;
  private spawnTimer: any; private moveTimer: any; private feedTimer: any;
  private speed = 1.8;

  constructor(private router: Router, private scoreService: HubScoreService) {}
  ngOnInit(): void { this.bestScore = this.scoreService.getBest(this.GAME_ID); }
  ngOnDestroy(): void { this.clearTimers(); }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.state !== 'playing') return;
    if (e.key === 'ArrowLeft'  || e.key === 'a') this.catcherX = Math.max(8, this.catcherX - 5);
    if (e.key === 'ArrowRight' || e.key === 'd') this.catcherX = Math.min(92, this.catcherX + 5);
  }

  @HostListener('window:mousemove', ['$event'])
  onMouse(e: MouseEvent): void {
    if (this.state !== 'playing') return;
    const arena = this.arenaRef?.nativeElement;
    if (!arena) return;
    const rect = arena.getBoundingClientRect();
    this.catcherX = Math.min(92, Math.max(8, ((e.clientX - rect.left) / rect.width) * 100));
  }

  startGame(): void {
    this.state = 'playing'; this.score = 0; this.lives = 3; this.items = []; this.speed = 1.8;
    this.spawnTimer = setInterval(() => this.spawnItem(), 1200);
    this.moveTimer  = setInterval(() => this.moveItems(), 50);
  }

  private spawnItem(): void {
    const isPass = Math.random() > 0.4;
    const labels = isPass ? PASS_LABELS : FAIL_LABELS;
    this.items.push({
      id: this.itemId++, x: 5 + Math.random() * 90, y: 0,
      type: isPass ? 'pass' : 'fail',
      speed: this.speed + Math.random() * 0.8,
      label: labels[Math.floor(Math.random() * labels.length)]
    });
    this.speed = Math.min(5, this.speed + 0.04);
  }

  private moveItems(): void {
    for (const item of this.items) item.y += item.speed;
    const caught: TestItem[] = [];
    const missed: TestItem[] = [];
    for (const item of this.items) {
      if (item.y >= 88) {
        const dist = Math.abs(item.x - this.catcherX);
        if (dist < 12) { caught.push(item); }
        else           { missed.push(item); }
      }
    }
    for (const item of caught) {
      this.items = this.items.filter(i => i.id !== item.id);
      if (item.type === 'pass') { this.score += 10; this.showFeedback('good'); }
      else                       { this.lives--;   this.showFeedback('bad'); if (this.lives <= 0) { this.endGame(); return; } }
    }
    for (const item of missed) {
      this.items = this.items.filter(i => i.id !== item.id);
      if (item.type === 'pass') { this.lives--; this.showFeedback('bad'); if (this.lives <= 0) { this.endGame(); return; } }
    }
  }

  private showFeedback(type: 'good' | 'bad'): void {
    this.feedback = type;
    clearTimeout(this.feedTimer);
    this.feedTimer = setTimeout(() => this.feedback = null, 400);
  }

  private endGame(): void {
    this.state = 'dead'; this.clearTimers(); this.items = [];
    this.scoreService.save(this.GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(this.GAME_ID);
  }

  private clearTimers(): void { clearInterval(this.spawnTimer); clearInterval(this.moveTimer); clearTimeout(this.feedTimer); }
  livesArr(): number[] { return Array(this.lives).fill(0); }
  goHome(): void { this.router.navigate(['/']); }
  playAgain(): void { this.clearTimers(); this.startGame(); }
}

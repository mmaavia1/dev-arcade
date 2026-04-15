import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

interface Meeting { id: number; x: number; y: number; vx: number; vy: number; label: string; size: number; deadly: boolean; }
interface Task    { id: number; x: number; y: number; collected: boolean; }

const MEETING_LABELS = ['📅 Sync','📞 Call','🗣️ All-hands','📊 Review','👥 1:1','🔔 Stand-up','💼 Interview','📋 Retro'];
const DEADLY_LABELS  = ['☠️ CEO Review','🚨 Incident Call','💀 Board Meeting'];

@Component({ selector: 'app-meeting-dodge', standalone: true, templateUrl: './meeting-dodge.component.html', styleUrl: './meeting-dodge.component.scss' })
export class MeetingDodgeComponent implements OnInit, OnDestroy {
  readonly GAME_ID = 'meeting-dodge';
  @ViewChild('arena', { static: false }) arenaRef!: ElementRef<HTMLDivElement>;

  state: 'ready' | 'playing' | 'dead' = 'ready';
  score = 0; bestScore = 0; survived = 0;
  playerX = 50; playerY = 50;
  meetings: Meeting[] = []; tasks: Task[] = [];
  private meetingId = 0; private taskId = 0;
  private animId = 0; private frame = 0;
  private spawnNext = 80; private taskSpawnNext = 60;
  private keys = new Set<string>();
  private speed = 3.5;

  constructor(private router: Router, private scoreService: HubScoreService) {}
  ngOnInit(): void { this.bestScore = this.scoreService.getBest(this.GAME_ID); }
  ngOnDestroy(): void { cancelAnimationFrame(this.animId); }

  @HostListener('window:keydown', ['$event']) onKeyDown(e: KeyboardEvent) { this.keys.add(e.key); }
  @HostListener('window:keyup',   ['$event']) onKeyUp(e: KeyboardEvent)   { this.keys.delete(e.key); }

  @HostListener('window:mousemove', ['$event'])
  onMouse(e: MouseEvent): void {
    if (this.state !== 'playing') return;
    const arena = this.arenaRef?.nativeElement;
    if (!arena) return;
    const rect = arena.getBoundingClientRect();
    this.playerX = Math.min(95, Math.max(5, ((e.clientX - rect.left) / rect.width) * 100));
    this.playerY = Math.min(92, Math.max(5, ((e.clientY - rect.top)  / rect.height) * 100));
  }

  startGame(): void {
    this.state = 'playing'; this.score = 0; this.survived = 0;
    this.meetings = []; this.tasks = [];
    this.playerX = 50; this.playerY = 50;
    this.frame = 0; this.spawnNext = 80; this.taskSpawnNext = 60; this.speed = 3.5;
    this.animId = requestAnimationFrame(() => this.loop());
  }

  private loop(): void {
    this.frame++;
    this.survived = Math.floor(this.frame / 60);
    this.speed = 3.5 + this.survived * 0.15;

    // Keyboard movement
    if (this.keys.has('ArrowLeft')  || this.keys.has('a')) this.playerX = Math.max(5,  this.playerX - 1.2);
    if (this.keys.has('ArrowRight') || this.keys.has('d')) this.playerX = Math.min(95, this.playerX + 1.2);
    if (this.keys.has('ArrowUp')    || this.keys.has('w')) this.playerY = Math.max(5,  this.playerY - 1.2);
    if (this.keys.has('ArrowDown')  || this.keys.has('s')) this.playerY = Math.min(92, this.playerY + 1.2);

    // Spawn meetings
    this.spawnNext--;
    if (this.spawnNext <= 0) { this.spawnMeeting(); this.spawnNext = Math.max(30, 80 - this.survived * 3); }

    // Spawn tasks (collect for points)
    this.taskSpawnNext--;
    if (this.taskSpawnNext <= 0) { this.spawnTask(); this.taskSpawnNext = 90 + Math.random() * 60; }

    // Move meetings
    for (const m of this.meetings) { m.x += m.vx; m.y += m.vy; if (m.x < 0||m.x > 100) m.vx *= -1; if (m.y < 0||m.y > 95) m.vy *= -1; }
    this.meetings = this.meetings.filter(m => m.x > -5 && m.x < 110 && m.y > -5 && m.y < 110);

    // Collision: meetings
    for (const m of this.meetings) {
      const dx = m.x - this.playerX, dy = m.y - this.playerY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < (m.deadly ? 6 : 5)) { this.endGame(); return; }
    }

    // Collect tasks
    for (const t of this.tasks) {
      if (t.collected) continue;
      const dx = t.x - this.playerX, dy = t.y - this.playerY;
      if (Math.sqrt(dx*dx + dy*dy) < 5) { t.collected = true; this.score += 15; }
    }
    this.tasks = this.tasks.filter(t => !t.collected);

    this.score = this.survived * 5 + this.score;
    this.animId = requestAnimationFrame(() => this.loop());
  }

  private spawnMeeting(): void {
    const deadly = Math.random() < 0.08 + this.survived * 0.005;
    const labels = deadly ? DEADLY_LABELS : MEETING_LABELS;
    const edge = Math.floor(Math.random() * 4);
    let x = Math.random() * 100, y = Math.random() * 100;
    if (edge === 0) y = 0; if (edge === 1) y = 100; if (edge === 2) x = 0; if (edge === 3) x = 100;
    const angle = Math.atan2(50 - y, 50 - x) + (Math.random() - 0.5) * 0.8;
    const spd = this.speed * (deadly ? 1.4 : 1);
    this.meetings.push({ id: this.meetingId++, x, y, vx: Math.cos(angle) * spd * 0.4, vy: Math.sin(angle) * spd * 0.4,
      label: labels[Math.floor(Math.random() * labels.length)], size: deadly ? 52 : 36 + Math.random() * 10, deadly });
  }

  private spawnTask(): void {
    this.tasks.push({ id: this.taskId++, x: 10 + Math.random() * 80, y: 10 + Math.random() * 80, collected: false });
  }

  private endGame(): void {
    this.state = 'dead'; cancelAnimationFrame(this.animId);
    const finalScore = this.survived * 5;
    this.scoreService.save(this.GAME_ID, finalScore);
    this.bestScore = this.scoreService.getBest(this.GAME_ID);
    this.score = finalScore;
  }

  goHome(): void { this.router.navigate(['/']); }
  playAgain(): void { cancelAnimationFrame(this.animId); this.startGame(); }
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

export interface Task { id: number; title: string; points: number; role: 'Dev' | 'QA' | 'Design' | 'Manager'; emoji: string; }

const TASK_POOL: Omit<Task,'id'>[] = [
  { title:'Fix login bug',      points:3, role:'Dev',     emoji:'🐛' },
  { title:'Write API tests',    points:2, role:'QA',      emoji:'🧪' },
  { title:'Redesign dashboard', points:5, role:'Design',  emoji:'🎨' },
  { title:'Sprint planning',    points:1, role:'Manager', emoji:'📋' },
  { title:'Code review',        points:2, role:'Dev',     emoji:'👀' },
  { title:'Regression testing', points:3, role:'QA',      emoji:'✅' },
  { title:'Update UI kit',      points:3, role:'Design',  emoji:'🖌️' },
  { title:'Daily standup',      points:1, role:'Manager', emoji:'🗣️' },
  { title:'Deploy hotfix',      points:4, role:'Dev',     emoji:'🚀' },
  { title:'Load testing',       points:3, role:'QA',      emoji:'⚡' },
  { title:'Icon redesign',      points:2, role:'Design',  emoji:'✏️' },
  { title:'Backlog grooming',   points:2, role:'Manager', emoji:'📌' },
  { title:'Build new feature',  points:5, role:'Dev',     emoji:'⚙️' },
  { title:'Write test cases',   points:2, role:'QA',      emoji:'📝' },
  { title:'Color palette',      points:1, role:'Design',  emoji:'🎨' },
  { title:'Risk assessment',    points:3, role:'Manager', emoji:'⚠️' },
];

@Component({ selector: 'app-sprint-planner', standalone: true, templateUrl: './sprint-planner.component.html', styleUrl: './sprint-planner.component.scss' })
export class SprintPlannerComponent implements OnInit, OnDestroy {
  readonly GAME_ID = 'sprint-planner';
  state: 'ready' | 'playing' | 'dead' = 'ready';
  score = 0; bestScore = 0; timeLeft = 45; streak = 0;
  currentTask: Task | null = null;
  feedback: { msg: string; good: boolean } | null = null;
  readonly roles: Task['role'][] = ['Dev', 'QA', 'Design', 'Manager'];
  readonly roleEmojis: Record<string, string> = { Dev:'👨‍💻', QA:'🧪', Design:'🎨', Manager:'📊' };
  readonly roleColors: Record<string, string> = { Dev:'#4CAF50', QA:'#2196F3', Design:'#E91E63', Manager:'#FF9800' };
  private taskId = 0; private timer: any; private feedTimer: any;

  constructor(private router: Router, private scoreService: HubScoreService) {}
  ngOnInit(): void { this.bestScore = this.scoreService.getBest(this.GAME_ID); }
  ngOnDestroy(): void { clearInterval(this.timer); clearTimeout(this.feedTimer); }

  startGame(): void {
    this.state = 'playing'; this.score = 0; this.timeLeft = 45; this.streak = 0;
    this.nextTask();
    this.timer = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) this.endGame();
    }, 1000);
  }

  private nextTask(): void {
    const pool = [...TASK_POOL];
    const t = pool[Math.floor(Math.random() * pool.length)];
    this.currentTask = { ...t, id: this.taskId++ };
  }

  assign(role: Task['role']): void {
    if (!this.currentTask || this.state !== 'playing') return;
    const correct = this.currentTask.role === role;
    if (correct) {
      this.streak++;
      const bonus = this.streak >= 3 ? 2 : 1;
      this.score += this.currentTask.points * bonus;
      this.showFeedback(`+${this.currentTask.points * bonus} pts ${this.streak >= 3 ? '🔥 x'+bonus : ''}`, true);
    } else {
      this.streak = 0;
      this.timeLeft = Math.max(0, this.timeLeft - 3);
      this.showFeedback(`❌ Should be ${this.currentTask.role}! -3s`, false);
    }
    this.nextTask();
  }

  private showFeedback(msg: string, good: boolean): void {
    this.feedback = { msg, good };
    clearTimeout(this.feedTimer);
    this.feedTimer = setTimeout(() => this.feedback = null, 900);
  }

  private endGame(): void {
    this.state = 'dead'; clearInterval(this.timer);
    this.scoreService.save(this.GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(this.GAME_ID);
  }

  goHome(): void { this.router.navigate(['/']); }
  playAgain(): void { clearInterval(this.timer); this.startGame(); }
  timerPct(): number { return (this.timeLeft / 45) * 100; }
  timerColor(): string { return this.timeLeft > 20 ? '#4CAF50' : this.timeLeft > 10 ? '#FF9800' : '#f44336'; }
}

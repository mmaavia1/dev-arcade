import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

export interface Story {
  id: string;
  title: string;
  points: number;        // story points (effort)
  value: number;         // business value ($)
  role: string;          // who does it (FE, BE, QA, Design)
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependsOn?: string;    // story id this depends on
  inSprint: boolean;
}

const CAPACITY = 32; // team sprint capacity in story points

const ALL_STORIES: Omit<Story, 'inSprint'>[] = [
  { id:'s1',  title:'User authentication (login/signup)',  points:8, value:5000, role:'BE',     priority:'critical' },
  { id:'s2',  title:'Password reset email flow',           points:3, value:2000, role:'BE',     priority:'high',    dependsOn:'s1' },
  { id:'s3',  title:'Login page UI',                       points:2, value:1500, role:'FE',     priority:'critical', dependsOn:'s1' },
  { id:'s4',  title:'Dashboard analytics chart',           points:5, value:3000, role:'FE',     priority:'medium' },
  { id:'s5',  title:'Write auth unit tests',               points:3, value:800,  role:'QA',     priority:'high',    dependsOn:'s1' },
  { id:'s6',  title:'REST API for user profile',           points:5, value:2500, role:'BE',     priority:'high' },
  { id:'s7',  title:'Profile page UI',                     points:3, value:1800, role:'FE',     priority:'medium',  dependsOn:'s6' },
  { id:'s8',  title:'Design system components update',     points:8, value:4000, role:'Design', priority:'medium' },
  { id:'s9',  title:'Mobile responsive fixes',             points:2, value:2200, role:'FE',     priority:'high' },
  { id:'s10', title:'E2E test for checkout flow',          points:5, value:1200, role:'QA',     priority:'medium' },
  { id:'s11', title:'Payment gateway integration',         points:8, value:8000, role:'BE',     priority:'high' },
  { id:'s12', title:'Email notification templates',        points:2, value:900,  role:'Design', priority:'low' },
  { id:'s13', title:'Search functionality',                points:5, value:3500, role:'BE',     priority:'medium' },
  { id:'s14', title:'Performance optimisation (FE)',       points:3, value:1500, role:'FE',     priority:'low' },
];

const GAME_ID = 'sprint-optimizer';

@Component({
  selector: 'app-sprint-optimizer',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './sprint-optimizer.component.html',
  styleUrl:    './sprint-optimizer.component.scss'
})
export class SprintOptimizerComponent implements OnInit, OnDestroy {
  state: 'idle' | 'planning' | 'locked' | 'done' = 'idle';
  stories: Story[] = [];
  sprintNum = 1;
  score = 0;
  bestScore = 0;
  feedback: { msg: string; good: boolean } | null = null;
  lockedSprints: { sprintNum: number; value: number; pts: number; issues: string[] }[] = [];

  private feedTimer: ReturnType<typeof setTimeout> | null = null;

  readonly capacity = CAPACITY;
  readonly roleColors: Record<string, string> = { FE:'#3b82f6', BE:'#10b981', QA:'#f59e0b', Design:'#ec4899' };
  readonly priorityColors: Record<string, string> = { critical:'#ef4444', high:'#f97316', medium:'#eab308', low:'#6b7280' };

  get backlog():  Story[] { return this.stories.filter(s => !s.inSprint); }
  get sprint():   Story[] { return this.stories.filter(s => s.inSprint); }
  get usedPoints(): number { return this.sprint.reduce((s, t) => s + t.points, 0); }
  get capacityPct(): number { return Math.min(100, (this.usedPoints / this.capacity) * 100); }
  get sprintValue(): number { return this.sprint.reduce((s, t) => s + t.value, 0); }
  get overCapacity(): boolean { return this.usedPoints > this.capacity; }

  constructor(private router: Router, private scoreService: HubScoreService) {}
  ngOnInit(): void { this.bestScore = this.scoreService.getBest(GAME_ID); }
  ngOnDestroy(): void { if (this.feedTimer) clearTimeout(this.feedTimer); }

  startGame(): void {
    this.stories = ALL_STORIES.map(s => ({ ...s, inSprint: false }));
    this.sprintNum = 1; this.score = 0; this.lockedSprints = [];
    this.state = 'planning';
  }

  toggle(story: Story): void {
    if (this.state !== 'planning') return;
    if (!story.inSprint && this.usedPoints + story.points > this.capacity + 5) {
      this.flash('⚠️ Over capacity! Remove something first.', false); return;
    }
    story.inSprint = !story.inSprint;
  }

  lockSprint(): void {
    if (this.sprint.length === 0) { this.flash('Add at least one story to the sprint!', false); return; }

    const issues: string[] = [];
    let multiplier = 1;

    // Check over capacity
    if (this.overCapacity) { issues.push('Over capacity (-30% value)'); multiplier *= 0.7; }

    // Check broken dependencies
    for (const story of this.sprint) {
      if (story.dependsOn) {
        const dep = this.stories.find(s => s.id === story.dependsOn);
        if (dep && !dep.inSprint) {
          issues.push(`"${story.title}" depends on "${dep.title}" which isn't in sprint (-15%)`);
          multiplier *= 0.85;
        }
      }
    }

    // Check no critical items ignored if in backlog
    const missedCriticals = this.backlog.filter(s => s.priority === 'critical');
    if (missedCriticals.length > 0 && this.sprint.some(s => s.priority !== 'critical')) {
      issues.push(`${missedCriticals.length} critical item(s) left in backlog (-10%)`);
      multiplier *= 0.9;
    }

    const rawValue = this.sprintValue;
    const earnedValue = Math.round(rawValue * multiplier);
    const pts = Math.round(earnedValue / 100);
    this.score += pts;

    this.lockedSprints.push({ sprintNum: this.sprintNum, value: earnedValue, pts, issues });

    if (issues.length === 0) this.flash(`✅ Perfect sprint! +${pts} pts`, true);
    else this.flash(`Sprint locked: +${pts} pts (${issues.length} issue${issues.length > 1 ? 's' : ''})`, issues.length < 2);

    this.state = 'locked';
  }

  nextSprint(): void {
    // Move completed stories out, keep remaining backlog
    this.stories = this.stories
      .filter(s => !s.inSprint)
      .map(s => ({ ...s, inSprint: false }));

    if (this.stories.length === 0 || this.sprintNum >= 3) {
      this.endGame(); return;
    }
    this.sprintNum++;
    this.state = 'planning';
  }

  private endGame(): void {
    this.state = 'done';
    this.scoreService.save(GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(GAME_ID);
  }

  private flash(msg: string, good: boolean): void {
    this.feedback = { msg, good };
    if (this.feedTimer) clearTimeout(this.feedTimer);
    this.feedTimer = setTimeout(() => this.feedback = null, 3000);
  }

  pointsColor(): string {
    const pct = this.usedPoints / this.capacity;
    if (pct > 1)    return '#ef4444';
    if (pct > 0.85) return '#f97316';
    return '#10b981';
  }

  grade(): string {
    const totalValue = this.lockedSprints.reduce((s, sp) => s + sp.value, 0);
    if (this.score >= 600) return 'Product Director 🏆';
    if (this.score >= 400) return 'Senior PM ⭐';
    if (this.score >= 200) return 'Product Manager 📋';
    return 'Associate PM 📚';
  }

  hasDep(story: Story): boolean {
    if (!story.dependsOn) return false;
    const dep = this.stories.find(s => s.id === story.dependsOn);
    return !!dep && !dep.inSprint && story.inSprint;
  }

  getStoryTitle(id: string | undefined): string {
    if (!id) return '';
    return this.stories.find(s => s.id === id)?.title ?? id;
  }

  goHome(): void { this.router.navigate(['/']); }
}

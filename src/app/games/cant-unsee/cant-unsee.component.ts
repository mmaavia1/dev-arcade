import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

export interface DesignPair {
  id: number;
  category: string;
  question: string;
  correctSide: 'left' | 'right';
  explanation: string;
  principle: string; // the design rule being tested
}

const PAIRS: DesignPair[] = [
  { id:1, category:'Spacing', question:'Which button has correct internal padding?', correctSide:'right', principle:'Minimum 12px vertical, 20px horizontal padding for buttons', explanation:'The right button has comfortable padding (12px 24px). The left button is cramped — too little padding makes interactive elements feel compressed and hard to tap.' },
  { id:2, category:'Typography', question:'Which heading hierarchy is correct?', correctSide:'left', principle:'Visual hierarchy: H1 > H2 > body text with clear size differentiation', explanation:'The left side uses proper hierarchy: H1 at 32px, H2 at 20px, body at 14px. The right side uses nearly identical sizes, making it impossible to scan the page structure.' },
  { id:3, category:'Color', question:'Which text has sufficient contrast for accessibility?', correctSide:'right', principle:'WCAG AA: minimum 4.5:1 contrast ratio for body text', explanation:'The right side passes WCAG AA (contrast ratio 7:1). The left uses #999 on white — only 2.8:1, failing minimum accessibility standards and unreadable for low-vision users.' },
  { id:4, category:'Alignment', question:'Which layout has correct text alignment?', correctSide:'left', principle:'Left-align body text for readability; only center short labels', explanation:'Left-aligned body text (left side) is easier to read because the eye always returns to the same starting point. Centered body text (right side) creates ragged left edges that slow reading.' },
  { id:5, category:'Consistency', question:'Which button set follows a consistent style?', correctSide:'left', principle:'Consistent border-radius across the same component type', explanation:'The left set uses the same border-radius on all buttons (8px). The right mixes rounded-full on one and sharp corners on another — inconsistency breaks the design system.' },
  { id:6, category:'Iconography', question:'Which icon usage is correct?', correctSide:'right', principle:'Icons should be accompanied by labels unless universally recognized', explanation:'The right side pairs each icon with a text label. The left uses icons alone — only 3 icons are "universally" recognized (home, search, close). All others need labels.' },
  { id:7, category:'Spacing', question:'Which list has correct spacing between items?', correctSide:'left', principle:'Consistent spacing unit (8pt grid) between list items', explanation:'The left list uses consistent 16px between items following an 8pt grid. The right has uneven gaps — 12px in some places, 24px in others — creating visual tension.' },
  { id:8, category:'Forms', question:'Which form label position is better?', correctSide:'left', principle:'Top-aligned labels are preferred over right-aligned or placeholder-only', explanation:'Top-aligned labels (left) are visible while filling in the field. Placeholder-as-label (right) disappears when typing, making users forget what they\'re filling in.' },
  { id:9, category:'Typography', question:'Which text has correct line height?', correctSide:'right', principle:'Body text line-height should be 1.5–1.6× the font size', explanation:'The right paragraph uses line-height: 1.6, making it comfortable to read. The left uses line-height: 1.1 — lines are crammed together, making long text exhausting.' },
  { id:10, category:'Color', question:'Which error state is correct?', correctSide:'left', principle:'Error states: red border + red icon + red message text (redundant cues)', explanation:'The left uses 3 redundant cues (red border, ⚠ icon, red text) — accessible even for colorblind users. The right changes only the border color, which colorblind users can miss.' },
  { id:11, category:'Buttons', question:'Which CTA button is designed correctly?', correctSide:'right', principle:'Primary CTA should have the highest visual weight on the page', explanation:'The right button has high contrast, strong fill, and clear affordance. The left uses a ghost/outline button as the primary action — it gets visually lost and underperforms.' },
  { id:12, category:'Loading', question:'Which loading state is better UX?', correctSide:'left', principle:'Skeleton screens are preferred over spinners for content loading', explanation:'The left skeleton screen sets user expectations by showing the shape of incoming content. The right spinner gives no context — users don\'t know if a sentence or a full dashboard is loading.' },
  { id:13, category:'Spacing', question:'Which card has correct content padding?', correctSide:'right', principle:'Cards need consistent internal padding on all 4 sides (16-24px)', explanation:'The right card uses uniform 20px padding. The left card has inconsistent padding — more on top and bottom than left and right — creating an unbalanced, uncomfortable feel.' },
  { id:14, category:'Feedback', question:'Which success message is designed better?', correctSide:'left', principle:'Success feedback: icon + short message + clear next action', explanation:'The left provides a ✓ icon, clear message, and a dismiss action. The right is text-only with no icon — lower visual prominence means users often miss it entirely.' },
  { id:15, category:'Typography', question:'Which font weight pairing works better?', correctSide:'right', principle:'Minimum 2 weight difference between heading and body (e.g., 700 + 400)', explanation:'The right pairs 700 (heading) with 400 (body) — clear differentiation. The left uses 500 for both — insufficient contrast in weight makes scanning the page structure difficult.' },
];

const GAME_ID = 'cant-unsee';

@Component({
  selector: 'app-cant-unsee',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cant-unsee.component.html',
  styleUrl:    './cant-unsee.component.scss'
})
export class CantUnseeComponent implements OnInit, OnDestroy {
  state: 'idle' | 'playing' | 'answered' | 'done' = 'idle';
  pairs    = [...PAIRS].sort(() => Math.random() - 0.5).slice(0, 12);
  current  = 0;
  score    = 0;
  bestScore = 0;
  timeLeft = 8;
  selected: 'left' | 'right' | null = null;
  streak   = 0;
  results: { correct: boolean; pts: number }[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;

  get q(): DesignPair    { return this.pairs[this.current]; }
  get totalQ(): number   { return this.pairs.length; }
  get progress(): number { return (this.current / this.totalQ) * 100; }
  get timerPct(): number { return (this.timeLeft / 8) * 100; }
  get timerColor(): string { return this.timeLeft > 4 ? '#E91E63' : this.timeLeft > 2 ? '#FF9800' : '#f44336'; }

  constructor(private router: Router, private scoreService: HubScoreService) {}
  ngOnInit(): void { this.bestScore = this.scoreService.getBest(GAME_ID); }
  ngOnDestroy(): void { this.clearTimer(); }

  startGame(): void {
    this.pairs = [...PAIRS].sort(() => Math.random() - 0.5).slice(0, 12);
    this.state = 'playing'; this.current = 0; this.score = 0; this.streak = 0; this.results = [];
    this.startTimer();
  }

  private startTimer(): void {
    this.clearTimer(); this.selected = null; this.timeLeft = 8;
    this.timer = setInterval(() => { this.timeLeft--; if (this.timeLeft <= 0) this.pick(null); }, 1000);
  }
  private clearTimer(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  pick(side: 'left' | 'right' | null): void {
    if (this.state !== 'playing') return;
    this.clearTimer(); this.selected = side;
    const correct = side === this.q.correctSide;
    let pts = 0;
    if (correct) { this.streak++; pts = 100 + this.timeLeft * 10 + (this.streak >= 3 ? 50 : 0); this.score += pts; }
    else         { this.streak = 0; }
    this.results.push({ correct, pts });
    this.state = 'answered';
  }

  next(): void {
    this.current++;
    if (this.current >= this.totalQ) {
      this.state = 'done';
      this.scoreService.save(GAME_ID, this.score);
      this.bestScore = this.scoreService.getBest(GAME_ID);
    } else { this.state = 'playing'; this.startTimer(); }
  }

  correctCount(): number { return this.results.filter(r => r.correct).length; }
  grade(): string {
    const pct = this.correctCount() / this.totalQ;
    if (pct >= 0.9) return 'Design Lead 🏆';
    if (pct >= 0.7) return 'Senior Designer ⭐';
    if (pct >= 0.5) return 'Mid Designer 🎨';
    return 'Keep Training Your Eye 📚';
  }
  goHome(): void { this.router.navigate(['/']); }
}

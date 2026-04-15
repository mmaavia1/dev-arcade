import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

export interface Bug {
  id: string;
  label: string;       // short name shown in HUD
  description: string; // explanation shown after find
  found: boolean;
}

export interface Screen {
  id: number;
  title: string;       // e.g. "Login Form"
  bugs: Bug[];
}

const SCREENS: Screen[] = [
  {
    id: 1, title: 'Login Page',
    bugs: [
      { id: 'b1a', label: 'Wrong button color', description: 'The "Login" button uses green (#4CAF50) — but green means success/positive action. A neutral primary color should be used here.', found: false },
      { id: 'b1b', label: 'No error state', description: 'The error message "Invalid credentials" is styled in green text — errors must be red to follow convention and accessibility.', found: false },
      { id: 'b1c', label: 'Missing label', description: 'The password field has a placeholder but no visible <label> element — this breaks screen reader accessibility (WCAG 2.1).', found: false },
      { id: 'b1d', label: 'Typo in button', description: '"Fogort Password?" is a typo — should be "Forgot Password?". Always check copy.', found: false },
      { id: 'b1e', label: 'No password toggle', description: 'There\'s no show/hide toggle for the password field, reducing usability especially on mobile.', found: false },
    ]
  },
  {
    id: 2, title: 'Dashboard Header',
    bugs: [
      { id: 'b2a', label: 'Low contrast text', description: 'The subtitle "Last updated 3 mins ago" uses #aaaaaa on a #f5f5f5 background — fails WCAG AA contrast ratio (need 4.5:1).', found: false },
      { id: 'b2b', label: 'Wrong icon meaning', description: 'The notification bell shows a "settings gear" icon — icon meaning must match the action it triggers.', found: false },
      { id: 'b2c', label: 'Unclickable area too small', description: 'The avatar button is only 24×24px — minimum touch target size is 44×44px (Apple HIG / Material Design).', found: false },
      { id: 'b2d', label: 'Stale data badge', description: 'The "LIVE" badge is green but the data was last updated 3 hours ago — misleading status indicator.', found: false },
    ]
  },
  {
    id: 3, title: 'Data Table',
    bugs: [
      { id: 'b3a', label: 'No empty state', description: 'When the search returns 0 results, the table shows a blank space with no message — always handle empty states explicitly.', found: false },
      { id: 'b3b', label: 'Missing sort indicator', description: 'The table is sorted by "Date" but no column header shows an up/down arrow — users can\'t tell the current sort direction.', found: false },
      { id: 'b3c', label: 'Inconsistent date format', description: 'Some dates show "Apr 15, 2026" and others show "15/04/26" — inconsistent formatting breaks data readability.', found: false },
      { id: 'b3d', label: 'Delete without confirm', description: 'The delete button triggers immediate deletion with no confirmation dialog — destructive actions need a confirmation step.', found: false },
      { id: 'b3e', label: 'Truncated cell no tooltip', description: 'Long text in the "Description" column is truncated with "..." but hovering shows nothing — tooltips required for truncated content.', found: false },
    ]
  },
  {
    id: 4, title: 'Checkout Form',
    bugs: [
      { id: 'b4a', label: 'Required field unmarked', description: 'The CVV field is required but has no asterisk (*) or "Required" label — users won\'t know until they hit submit.', found: false },
      { id: 'b4b', label: 'Inline error timing', description: 'The "Invalid email" error appears as the user is still typing — inline validation should trigger on blur (leaving the field), not on keypress.', found: false },
      { id: 'b4c', label: 'Price mismatch', description: 'The line item shows $29.99 but the total shows $31.99 — the tax line is not displayed, causing a confusing $2 discrepancy.', found: false },
      { id: 'b4d', label: 'Submit button state', description: 'The "Place Order" button is enabled even when required fields are empty — it should be disabled until the form is valid.', found: false },
    ]
  },
  {
    id: 5, title: 'Mobile Navigation',
    bugs: [
      { id: 'b5a', label: 'Active state missing', description: 'The currently selected nav item "Home" looks identical to unselected items — active state must be visually distinct.', found: false },
      { id: 'b5b', label: 'Icon without label', description: 'One nav icon (a graph icon) has no text label — icon-only nav requires a tooltip or label for usability.', found: false },
      { id: 'b5c', label: 'Badge overflow', description: 'The notification badge shows "1247" — badges should cap at "99+" to prevent overflow and layout issues.', found: false },
      { id: 'b5d', label: 'Safe area ignored', description: 'The nav bar doesn\'t account for iPhone home indicator safe area — content is clipped on modern iPhones.', found: false },
    ]
  }
];

const GAME_ID = 'bug-bash';

@Component({
  selector: 'app-bug-bash',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bug-bash.component.html',
  styleUrl:    './bug-bash.component.scss'
})
export class BugBashComponent implements OnInit, OnDestroy {
  state: 'idle' | 'playing' | 'reveal' | 'done' = 'idle';
  screens = SCREENS.map(s => ({ ...s, bugs: s.bugs.map(b => ({ ...b, found: false })) }));
  screenIdx = 0;
  score     = 0;
  bestScore = 0;
  timeLeft  = 75;
  totalFound = 0;
  lastFound: Bug | null = null;
  showFoundToast = false;

  private timer: ReturnType<typeof setInterval> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  get screen() { return this.screens[this.screenIdx]; }
  get bugsFound(): number { return this.screen.bugs.filter(b => b.found).length; }
  get totalBugs(): number { return this.screen.bugs.length; }
  get allFound(): boolean { return this.screen.bugs.every(b => b.found); }
  get timerPct(): number  { return (this.timeLeft / 75) * 100; }
  get timerColor(): string { return this.timeLeft > 40 ? '#4CAF50' : this.timeLeft > 20 ? '#FF9800' : '#f44336'; }
  get grandTotal(): number { return this.screens.reduce((s, sc) => s + sc.bugs.length, 0); }
  get grandFound(): number { return this.screens.reduce((s, sc) => s + sc.bugs.filter(b => b.found).length, 0); }

  constructor(private router: Router, private scoreService: HubScoreService) {}

  ngOnInit(): void { this.bestScore = this.scoreService.getBest(GAME_ID); }
  ngOnDestroy(): void { this.clearTimer(); }

  startGame(): void {
    this.screens = SCREENS.map(s => ({ ...s, bugs: s.bugs.map(b => ({ ...b, found: false })) }));
    this.state = 'playing'; this.screenIdx = 0; this.score = 0;
    this.timeLeft = 75; this.totalFound = 0;
    this.startTimer();
  }

  private startTimer(): void {
    this.clearTimer();
    this.timer = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) this.endGame();
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  clickBug(bug: Bug): void {
    if (bug.found || this.state !== 'playing') return;
    bug.found = true;
    this.totalFound++;
    const pts = 100 + Math.floor(this.timeLeft * 2);
    this.score += pts;
    this.lastFound = bug;
    this.showFoundToast = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.showFoundToast = false; }, 2200);
  }

  reveal(): void { this.state = 'reveal'; this.clearTimer(); }

  nextScreen(): void {
    if (this.screenIdx < this.screens.length - 1) {
      this.screenIdx++;
      this.state = 'playing';
      this.startTimer();
    } else {
      this.endGame();
    }
  }

  private endGame(): void {
    this.clearTimer();
    this.state = 'done';
    this.scoreService.save(GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(GAME_ID);
  }

  grade(): string {
    const pct = this.grandFound / this.grandTotal;
    if (pct >= 0.9) return 'QA Lead 🏆';
    if (pct >= 0.7) return 'Senior Tester ⭐';
    if (pct >= 0.5) return 'QA Engineer 📋';
    return 'Needs More Practice 📚';
  }

  goHome(): void { this.router.navigate(['/']); }
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

export interface CssChallenge {
  id: number;
  category: string;
  prompt: string;                           // "What makes 3 boxes equally spaced?"
  codeLines: string[];                      // code shown with one line as {{BLANK}}
  blankIndex: number;                       // which line is the blank
  options: string[];                        // 4 choices shown
  correct: string;                          // correct option
  explanation: string;
  containerStyle: Record<string, string>;   // target live preview style
  boxes: { label: string; style?: Record<string, string> }[];
}

const CHALLENGES: CssChallenge[] = [
  {
    id: 1, category: 'Flexbox',
    prompt: 'Center items horizontally inside a flex container',
    codeLines: ['.container {', '  display: flex;', '  {{BLANK}}: center;', '}'],
    blankIndex: 2,
    options: ['justify-content', 'align-items', 'align-content', 'flex-align'],
    correct: 'justify-content',
    explanation: 'justify-content controls alignment along the main axis (horizontal in row direction). align-items controls the cross axis.',
    containerStyle: { display:'flex', justifyContent:'center', gap:'10px', padding:'20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', alignItems:'flex-start' },
    boxes: [{ label:'A' }, { label:'B' }, { label:'C' }]
  },
  {
    id: 2, category: 'Flexbox',
    prompt: 'Vertically center items in a flex container',
    codeLines: ['.container {', '  display: flex;', '  height: 120px;', '  {{BLANK}}: center;', '}'],
    blankIndex: 3,
    options: ['align-items', 'justify-content', 'vertical-align', 'align-self'],
    correct: 'align-items',
    explanation: 'align-items aligns flex children along the cross axis (vertical in row direction). vertical-align only works on inline elements.',
    containerStyle: { display:'flex', alignItems:'center', gap:'10px', padding:'0 20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px' },
    boxes: [{ label:'A', style:{ height:'30px' } }, { label:'B', style:{ height:'55px' } }, { label:'C', style:{ height:'40px' } }]
  },
  {
    id: 3, category: 'Flexbox',
    prompt: 'Spread items evenly with space between them',
    codeLines: ['.container {', '  display: flex;', '  {{BLANK}}: space-between;', '}'],
    blankIndex: 2,
    options: ['justify-content', 'align-items', 'text-align', 'gap'],
    correct: 'justify-content',
    explanation: 'justify-content: space-between puts equal space between items, with no space at the edges. gap adds fixed space between items.',
    containerStyle: { display:'flex', justifyContent:'space-between', padding:'20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', alignItems:'center' },
    boxes: [{ label:'A' }, { label:'B' }, { label:'C' }]
  },
  {
    id: 4, category: 'Flexbox',
    prompt: 'Stack items vertically instead of horizontally',
    codeLines: ['.container {', '  display: flex;', '  {{BLANK}}: column;', '}'],
    blankIndex: 2,
    options: ['flex-direction', 'flex-wrap', 'flex-flow', 'flex-axis'],
    correct: 'flex-direction',
    explanation: 'flex-direction: column changes the main axis to vertical, stacking children top-to-bottom.',
    containerStyle: { display:'flex', flexDirection:'column', gap:'8px', padding:'16px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', alignItems:'flex-start' },
    boxes: [{ label:'First' }, { label:'Second' }, { label:'Third' }]
  },
  {
    id: 5, category: 'Flexbox',
    prompt: 'Add equal spacing between flex children',
    codeLines: ['.container {', '  display: flex;', '  {{BLANK}}: 16px;', '}'],
    blankIndex: 2,
    options: ['gap', 'margin', 'padding', 'spacing'],
    correct: 'gap',
    explanation: 'gap (or column-gap/row-gap) adds space between flex/grid children without adding space at the outer edges.',
    containerStyle: { display:'flex', gap:'20px', padding:'20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', alignItems:'center' },
    boxes: [{ label:'A' }, { label:'B' }, { label:'C' }, { label:'D' }]
  },
  {
    id: 6, category: 'CSS Grid',
    prompt: 'Create 3 equal-width columns in a grid',
    codeLines: ['.container {', '  display: grid;', '  {{BLANK}}: 1fr 1fr 1fr;', '}'],
    blankIndex: 2,
    options: ['grid-template-columns', 'grid-columns', 'column-template', 'grid-template-rows'],
    correct: 'grid-template-columns',
    explanation: 'grid-template-columns defines column track sizes. 1fr means 1 fraction of available space. repeat(3, 1fr) is shorthand.',
    containerStyle: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', padding:'16px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px' },
    boxes: [{ label:'Col 1' }, { label:'Col 2' }, { label:'Col 3' }]
  },
  {
    id: 7, category: 'CSS Grid',
    prompt: 'Make one grid item span 2 columns',
    codeLines: ['.item-wide {', '  {{BLANK}}: span 2;', '}'],
    blankIndex: 1,
    options: ['grid-column', 'column-span', 'grid-span', 'colspan'],
    correct: 'grid-column',
    explanation: 'grid-column: span 2 makes an item stretch across 2 column tracks. colspan is an HTML table attribute, not CSS.',
    containerStyle: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', padding:'16px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px' },
    boxes: [{ label:'Wide (span 2)', style:{ gridColumn:'span 2' } }, { label:'Normal' }, { label:'Normal' }, { label:'Normal' }]
  },
  {
    id: 8, category: 'Box Model',
    prompt: 'Include padding and border in an element\'s total width',
    codeLines: ['.box {', '  width: 200px;', '  padding: 20px;', '  {{BLANK}}: border-box;', '}'],
    blankIndex: 3,
    options: ['box-sizing', 'box-model', 'sizing', 'width-model'],
    correct: 'box-sizing',
    explanation: 'box-sizing: border-box includes padding & border in the width. Default is content-box where padding is added on top of width.',
    containerStyle: { display:'flex', gap:'16px', padding:'16px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', alignItems:'center', justifyContent:'center' },
    boxes: [{ label:'border-box ✓', style:{ boxSizing:'border-box', width:'140px', padding:'12px', border:'3px solid #4CAF50', textAlign:'center', fontSize:'12px' } }]
  },
  {
    id: 9, category: 'Typography',
    prompt: 'Center text horizontally inside a block element',
    codeLines: ['.heading {', '  font-size: 24px;', '  {{BLANK}}: center;', '}'],
    blankIndex: 2,
    options: ['text-align', 'align-text', 'justify-content', 'text-position'],
    correct: 'text-align',
    explanation: 'text-align centers inline content (text, inline elements) within a block. justify-content only works inside flex/grid containers.',
    containerStyle: { padding:'20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', display:'flex', alignItems:'center', justifyContent:'center' },
    boxes: [{ label:'Centered Heading Text', style:{ textAlign:'center', fontSize:'20px', fontWeight:'700', width:'100%', color:'#fff' } }]
  },
  {
    id: 10, category: 'Typography',
    prompt: 'Prevent text from wrapping to a new line',
    codeLines: ['.label {', '  {{BLANK}}: nowrap;', '  overflow: hidden;', '  text-overflow: ellipsis;', '}'],
    blankIndex: 1,
    options: ['white-space', 'word-wrap', 'overflow-wrap', 'text-wrap'],
    correct: 'white-space',
    explanation: 'white-space: nowrap prevents line breaks. Combined with overflow: hidden and text-overflow: ellipsis, it creates the classic truncation pattern.',
    containerStyle: { padding:'20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', display:'flex', alignItems:'center' },
    boxes: [{ label:'This is a very long label that will not wrap to the next line...', style:{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', width:'260px', color:'#aaa', fontSize:'13px', background:'#1a2a3a', padding:'8px 12px', borderRadius:'4px' } }]
  },
  {
    id: 11, category: 'Positioning',
    prompt: 'Position an element relative to its nearest positioned parent',
    codeLines: ['.tooltip {', '  {{BLANK}}: absolute;', '  top: 0;', '  right: 0;', '}'],
    blankIndex: 1,
    options: ['position', 'display', 'float', 'z-index'],
    correct: 'position',
    explanation: 'position: absolute removes the element from normal flow and positions it relative to the nearest ancestor with position other than static.',
    containerStyle: { position:'relative', padding:'20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', display:'flex', alignItems:'center' },
    boxes: [
      { label:'Parent element', style:{ background:'#1a2a3a', padding:'12px 20px', borderRadius:'6px', width:'100%', color:'#aaa', position:'relative' } },
      { label:'↗ absolute', style:{ position:'absolute', top:'4px', right:'4px', background:'#f44336', color:'#fff', fontSize:'10px', padding:'3px 8px', borderRadius:'4px' } }
    ]
  },
  {
    id: 12, category: 'Visual',
    prompt: 'Add a subtle shadow below a card element',
    codeLines: ['.card {', '  background: white;', '  border-radius: 8px;', '  {{BLANK}}: 0 4px 12px rgba(0,0,0,0.15);', '}'],
    blankIndex: 3,
    options: ['box-shadow', 'text-shadow', 'drop-shadow', 'element-shadow'],
    correct: 'box-shadow',
    explanation: 'box-shadow adds shadow to the element box. drop-shadow() is a CSS filter function. text-shadow only applies to text.',
    containerStyle: { padding:'24px', background:'#1a2a3a', borderRadius:'8px', minHeight:'90px', display:'flex', alignItems:'center', justifyContent:'center' },
    boxes: [{ label:'Card with shadow', style:{ background:'#fff', color:'#333', padding:'16px 24px', borderRadius:'8px', boxShadow:'0 4px 16px rgba(0,0,0,0.25)', fontWeight:'600' } }]
  },
  {
    id: 13, category: 'Flexbox',
    prompt: 'Make a flex item grow to fill remaining space',
    codeLines: ['.main-content {', '  {{BLANK}}: 1;', '  /* sidebar is fixed width */', '}'],
    blankIndex: 1,
    options: ['flex-grow', 'flex-shrink', 'flex-basis', 'width'],
    correct: 'flex-grow',
    explanation: 'flex-grow: 1 tells the item to grow and fill available space. flex-shrink controls how items shrink when there\'s not enough space.',
    containerStyle: { display:'flex', gap:'12px', padding:'16px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', alignItems:'stretch' },
    boxes: [
      { label:'Sidebar', style:{ width:'80px', flexShrink:'0', background:'#1e3a5f', padding:'8px', borderRadius:'4px', textAlign:'center', fontSize:'12px' } },
      { label:'Main content (flex-grow: 1)', style:{ flexGrow:'1', background:'#1a3a2a', padding:'8px', borderRadius:'4px', fontSize:'12px' } }
    ]
  },
  {
    id: 14, category: 'Responsive',
    prompt: 'Apply styles only on screens wider than 768px',
    codeLines: ['{{BLANK}} (min-width: 768px) {', '  .container {', '    max-width: 1200px;', '  }', '}'],
    blankIndex: 0,
    options: ['@media', '@screen', '@breakpoint', '@responsive'],
    correct: '@media',
    explanation: '@media is the CSS at-rule for media queries. min-width: 768px targets screens 768px or wider — the common tablet breakpoint.',
    containerStyle: { padding:'20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' },
    boxes: [
      { label:'📱 Mobile', style:{ background:'#1a2a3a', padding:'6px 12px', borderRadius:'4px', fontSize:'12px', opacity:'0.5' } },
      { label:'💻 768px+ ✓', style:{ background:'#1a3a1a', padding:'6px 12px', borderRadius:'4px', fontSize:'12px', border:'1px solid #4CAF50' } },
      { label:'🖥️ 1200px+ ✓', style:{ background:'#1a3a1a', padding:'6px 12px', borderRadius:'4px', fontSize:'12px', border:'1px solid #4CAF50' } }
    ]
  },
  {
    id: 15, category: 'CSS Variables',
    prompt: 'Define a CSS custom property (variable)',
    codeLines: [':root {', '  {{BLANK}}primary-color: #6366f1;', '}', '.btn { color: var(--primary-color); }'],
    blankIndex: 1,
    options: ['--', '$', '@', '@@'],
    correct: '--',
    explanation: 'CSS custom properties start with -- (double dash). SCSS variables use $. @property is a different CSS at-rule for typed custom properties.',
    containerStyle: { padding:'20px', background:'#0d1f2d', borderRadius:'8px', minHeight:'90px', display:'flex', alignItems:'center', justifyContent:'center' },
    boxes: [{ label:'--primary-color: #6366f1', style:{ background:'#1a1a3a', padding:'8px 16px', borderRadius:'4px', fontFamily:'monospace', fontSize:'13px', color:'#818cf8', border:'1px solid #3730a3' } }]
  }
];

const GAME_ID = 'css-duel';

@Component({
  selector: 'app-css-duel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './css-duel.component.html',
  styleUrl:    './css-duel.component.scss'
})
export class CssDuelComponent implements OnInit, OnDestroy {
  state: 'idle' | 'playing' | 'answered' | 'done' = 'idle';
  challenges = [...CHALLENGES].sort(() => Math.random() - 0.5).slice(0, 10);
  current    = 0;
  score      = 0;
  bestScore  = 0;
  timeLeft   = 12;
  selected: string | null = null;
  streak     = 0;
  results: { correct: boolean; points: number }[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;

  get q(): CssChallenge { return this.challenges[this.current]; }
  get totalQ(): number  { return this.challenges.length; }
  get progress(): number { return ((this.current) / this.totalQ) * 100; }
  get timerPct(): number { return (this.timeLeft / 12) * 100; }
  get timerColor(): string { return this.timeLeft > 7 ? '#4CAF50' : this.timeLeft > 4 ? '#FF9800' : '#f44336'; }

  constructor(private router: Router, private scoreService: HubScoreService) {}

  ngOnInit(): void { this.bestScore = this.scoreService.getBest(GAME_ID); }
  ngOnDestroy(): void { this.clearTimer(); }

  startGame(): void {
    this.state = 'playing';
    this.score = 0; this.current = 0; this.streak = 0;
    this.challenges = [...CHALLENGES].sort(() => Math.random() - 0.5).slice(0, 10);
    this.results = [];
    this.startTimer();
  }

  private startTimer(): void {
    this.clearTimer();
    this.timeLeft = 12;
    this.selected = null;
    this.timer = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) this.answer(null); // timeout
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  answer(option: string | null): void {
    if (this.state !== 'playing') return;
    this.clearTimer();
    this.selected = option;
    const correct = option === this.q.correct;
    let pts = 0;
    if (correct) {
      this.streak++;
      pts = 100 + Math.floor(this.timeLeft * 8) + (this.streak >= 3 ? 50 : 0);
      this.score += pts;
    } else {
      this.streak = 0;
    }
    this.results.push({ correct, points: pts });
    this.state = 'answered';
  }

  next(): void {
    this.current++;
    if (this.current >= this.totalQ) {
      this.state = 'done';
      this.scoreService.save(GAME_ID, this.score);
      this.bestScore = this.scoreService.getBest(GAME_ID);
    } else {
      this.state = 'playing';
      this.startTimer();
    }
  }

  isCorrect(opt: string): boolean { return opt === this.q.correct; }
  isWrong(opt: string): boolean   { return this.selected === opt && opt !== this.q.correct; }

  codeDisplay(lines: string[]): string[] {
    return lines.map((l, i) => i === this.q.blankIndex && this.state === 'playing'
      ? l.replace('{{BLANK}}', '_____')
      : l.replace('{{BLANK}}', this.q.correct));
  }

  correctCount(): number { return this.results.filter(r => r.correct).length; }
  grade(): string {
    const pct = this.correctCount() / this.totalQ;
    if (pct >= 0.9) return 'Senior Dev 🏆';
    if (pct >= 0.7) return 'Mid-level Dev ⭐';
    if (pct >= 0.5) return 'Junior Dev 📚';
    return 'Keep Practicing 💪';
  }

  goHome(): void { this.router.navigate(['/']); }
}

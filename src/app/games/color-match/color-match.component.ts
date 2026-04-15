import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

interface ColorOption { hex: string; name: string; }

const COLOR_POOL: ColorOption[] = [
  {hex:'#FF6B6B',name:'Coral Red'},{hex:'#4ECDC4',name:'Turquoise'},{hex:'#45B7D1',name:'Sky Blue'},
  {hex:'#96CEB4',name:'Sage Green'},{hex:'#FFEAA7',name:'Pale Yellow'},{hex:'#DDA0DD',name:'Plum'},
  {hex:'#98D8C8',name:'Mint'},{hex:'#F7DC6F',name:'Sunflower'},{hex:'#BB8FCE',name:'Lavender'},
  {hex:'#85C1E9',name:'Baby Blue'},{hex:'#F1948A',name:'Salmon'},{hex:'#82E0AA',name:'Light Green'},
  {hex:'#F8C471',name:'Peach'},{hex:'#AED6F1',name:'Powder Blue'},{hex:'#A9DFBF',name:'Honeydew'},
  {hex:'#F9E79F',name:'Lemon'},{hex:'#D2B4DE',name:'Wisteria'},{hex:'#A3E4D7',name:'Aquamarine'},
  {hex:'#FF9FF3',name:'Pink Flamingo'},{hex:'#54A0FF',name:'Cornflower'},{hex:'#5F27CD',name:'Dark Violet'},
  {hex:'#00D2D3',name:'Robin Egg'},{hex:'#FF9F43',name:'Mandarin'},{hex:'#EE5A24',name:'Burnt Orange'},
];

@Component({ selector: 'app-color-match', standalone: true, templateUrl: './color-match.component.html', styleUrl: './color-match.component.scss' })
export class ColorMatchComponent implements OnInit, OnDestroy {
  readonly GAME_ID = 'color-match';
  state: 'ready' | 'playing' | 'dead' = 'ready';
  score = 0; bestScore = 0; timeLeft = 30; streak = 0;
  targetColor: ColorOption = COLOR_POOL[0];
  options: ColorOption[] = [];
  feedback: 'good' | 'bad' | null = null;
  mode: 'hex-to-color' | 'color-to-name' = 'hex-to-color';
  private timer: any; private feedTimer: any;

  constructor(private router: Router, private scoreService: HubScoreService) {}
  ngOnInit(): void { this.bestScore = this.scoreService.getBest(this.GAME_ID); }
  ngOnDestroy(): void { clearInterval(this.timer); clearTimeout(this.feedTimer); }

  startGame(): void {
    this.state = 'playing'; this.score = 0; this.timeLeft = 30; this.streak = 0;
    this.nextRound();
    this.timer = setInterval(() => { this.timeLeft--; if (this.timeLeft <= 0) this.endGame(); }, 1000);
  }

  nextRound(): void {
    this.mode = Math.random() > 0.5 ? 'hex-to-color' : 'color-to-name';
    const shuffled = [...COLOR_POOL].sort(() => Math.random() - 0.5);
    this.targetColor = shuffled[0];
    this.options = shuffled.slice(0, 4).sort(() => Math.random() - 0.5);
  }

  pick(option: ColorOption): void {
    if (this.state !== 'playing') return;
    const correct = option.hex === this.targetColor.hex;
    if (correct) {
      this.streak++;
      const bonus = Math.min(this.streak, 5);
      this.score += 10 + bonus * 2;
      this.timeLeft = Math.min(30, this.timeLeft + 2);
      this.feedback = 'good';
    } else {
      this.streak = 0;
      this.timeLeft = Math.max(0, this.timeLeft - 4);
      this.feedback = 'bad';
    }
    clearTimeout(this.feedTimer);
    this.feedTimer = setTimeout(() => { this.feedback = null; this.nextRound(); }, 400);
  }

  private endGame(): void {
    this.state = 'dead'; clearInterval(this.timer);
    this.scoreService.save(this.GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(this.GAME_ID);
  }

  goHome(): void { this.router.navigate(['/']); }
  playAgain(): void { clearInterval(this.timer); this.startGame(); }
  timerPct(): number { return (this.timeLeft / 30) * 100; }
  timerColor(): string { return this.timeLeft > 15 ? '#E91E63' : this.timeLeft > 8 ? '#FF9800' : '#f44336'; }
}

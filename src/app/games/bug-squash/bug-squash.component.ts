import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

type BugKind = 'basic' | 'fast' | 'armored' | 'boss';
type GameState = 'idle' | 'playing' | 'dead';

interface HoleState {
  col: number; row: number;
  cx: number; cy: number; r: number;
  bugKind: BugKind | null;
  bugHp: number;
  scale: number;       // 0 = hidden, 1 = full
  animDir: 1 | -1 | 0; // 1=popping up, -1=retreating, 0=idle
  timeLeft: number;    // ms before escape
  hitFlash: number;    // ms to show hit flash
  squashFlash: number; // ms to show squash anim
}

interface Particle {
  id: number; x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}

const COLS = 5, ROWS = 3;
const HOLE_PAD = 0.14; // fraction of cell
const GAME_DURATION = 60000; // 60 sec

const BUG_DEFS: Record<BugKind, { emoji:string; hp:number; pts:number; lifetime:number; color:string }> = {
  basic:   { emoji:'🐛', hp:1, pts:100,  lifetime:2800, color:'#81C784' },
  fast:    { emoji:'🦗', hp:1, pts:150,  lifetime:1600, color:'#FFD54F' },
  armored: { emoji:'🐞', hp:2, pts:250,  lifetime:3200, color:'#EF9A9A' },
  boss:    { emoji:'👾', hp:3, pts:600,  lifetime:2000, color:'#CE93D8' },
};

const GAME_ID = 'bug-squash';

@Component({
  selector: 'app-bug-squash',
  standalone: true,
  templateUrl: './bug-squash.component.html',
  styleUrl:    './bug-squash.component.scss'
})
export class BugSquashComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  state: GameState = 'idle';
  score     = 0;
  bestScore = 0;
  timeLeft  = 60;
  combo     = 0;
  lives     = 5;

  private ctx!: CanvasRenderingContext2D;
  private W = 0; private H = 0;
  private cellW = 0; private cellH = 0;
  private holes: HoleState[] = [];
  private particles: Particle[] = [];
  private partId = 0;
  private animId = 0; private lastTs = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private spawnInterval = 1200;
  private frameCount = 0;
  private floatingTexts: {x:number;y:number;text:string;life:number;color:string}[] = [];

  constructor(private router: Router, private scoreService: HubScoreService) {}

  ngOnInit(): void {
    this.bestScore = this.scoreService.getBest(GAME_ID);
    this.setupCanvas();
    this.startLoop();
  }

  ngOnDestroy(): void { cancelAnimationFrame(this.animId); }

  private setupCanvas(): void {
    const c = this.canvasRef.nativeElement;
    c.width  = c.parentElement!.clientWidth;
    c.height = c.parentElement!.clientHeight;
    this.ctx = c.getContext('2d')!;
    this.W = c.width; this.H = c.height;
    this.buildHoles();
  }

  private buildHoles(): void {
    this.cellW = this.W / COLS;
    this.cellH = (this.H * 0.78) / ROWS;
    const offsetY = this.H * 0.1;
    this.holes = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = (c + 0.5) * this.cellW;
        const cy = offsetY + (r + 0.5) * this.cellH;
        const r2 = Math.min(this.cellW, this.cellH) * (0.35 - HOLE_PAD);
        this.holes.push({ col:c, row:r, cx, cy, r:r2, bugKind:null, bugHp:0, scale:0, animDir:0, timeLeft:0, hitFlash:0, squashFlash:0 });
      }
    }
  }

  onCanvasClick(e: MouseEvent): void {
    if (this.state !== 'playing') { if (this.state === 'idle') this.startGame(); return; }
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const hole of this.holes) {
      if (hole.bugKind === null || hole.scale < 0.4) continue;
      const dx = mx - hole.cx, dy = my - (hole.cy - hole.r * hole.scale * 0.5);
      const hitR = hole.r * 1.3;
      if (dx*dx + dy*dy < hitR*hitR) {
        this.hitHole(hole, mx, my);
        return;
      }
    }
    // Miss flash
    this.combo = 0;
  }

  private hitHole(hole: HoleState, mx: number, my: number): void {
    const def = BUG_DEFS[hole.bugKind!];
    hole.bugHp--;
    hole.hitFlash = 200;
    if (hole.bugHp <= 0) {
      const multiplier = 1 + Math.floor(this.combo / 3) * 0.5;
      const pts = Math.round(def.pts * multiplier);
      this.score += pts;
      this.combo++;
      this.spawnSquashParticles(hole.cx, hole.cy - hole.r * 0.8, def.color);
      this.floatingTexts.push({ x: mx, y: my - 20, text: `+${pts}${this.combo >= 3 ? ' 🔥' : ''}`, life: 1.2, color: def.color });
      hole.bugKind    = null;
      hole.squashFlash = 300;
      hole.animDir    = -1;
    }
  }

  private startGame(): void {
    this.state = 'playing';
    this.score = 0; this.timeLeft = 60; this.combo = 0; this.lives = 5;
    this.elapsed = 0; this.spawnTimer = 0; this.spawnInterval = 1200;
    this.particles = []; this.floatingTexts = [];
    for (const h of this.holes) { h.bugKind = null; h.scale = 0; h.animDir = 0; }
  }

  private startLoop(): void {
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      const dt = Math.min(ts - this.lastTs, 50); this.lastTs = ts;
      this.update(dt); this.draw();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    this.frameCount++;
    if (this.state !== 'playing') { this.updateParticles(dt); return; }

    this.elapsed += dt;
    this.timeLeft = Math.max(0, 60 - Math.floor(this.elapsed / 1000));
    if (this.elapsed >= GAME_DURATION) { this.endGame(); return; }

    // Speed up over time
    this.spawnInterval = Math.max(500, 1200 - Math.floor(this.elapsed / 8000) * 100);

    // Spawn
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnBug();
      this.spawnTimer = this.spawnInterval + (Math.random() * 400 - 200);
    }

    // Update holes
    for (const hole of this.holes) {
      if (hole.hitFlash > 0) hole.hitFlash -= dt;
      if (hole.squashFlash > 0) hole.squashFlash -= dt;

      if (hole.animDir === 1) {
        hole.scale = Math.min(1, hole.scale + dt / 280);
        if (hole.scale >= 1) hole.animDir = 0;
      } else if (hole.animDir === -1) {
        hole.scale = Math.max(0, hole.scale - dt / 180);
        if (hole.scale <= 0) { hole.animDir = 0; hole.bugKind = null; }
      }

      // Countdown & escape
      if (hole.bugKind !== null && hole.animDir === 0 && hole.scale >= 1) {
        hole.timeLeft -= dt;
        if (hole.timeLeft <= 0) {
          this.lives--;
          this.combo = 0;
          hole.bugKind = null;
          hole.animDir = -1;
          if (this.lives <= 0) { this.endGame(); return; }
        }
      }
    }

    this.updateParticles(dt);
    this.floatingTexts.forEach(t => t.life -= dt/1000);
    this.floatingTexts = this.floatingTexts.filter(t => t.life > 0);
  }

  private spawnBug(): void {
    const empty = this.holes.filter(h => h.bugKind === null && h.scale < 0.05);
    if (!empty.length) return;
    const hole = empty[Math.floor(Math.random() * empty.length)];
    const progress = this.elapsed / GAME_DURATION;
    let kind: BugKind;
    const r = Math.random();
    if      (r < 0.02 + progress * 0.03) kind = 'boss';
    else if (r < 0.10 + progress * 0.10) kind = 'armored';
    else if (r < 0.35 + progress * 0.20) kind = 'fast';
    else                                  kind = 'basic';
    const def = BUG_DEFS[kind];
    hole.bugKind  = kind;
    hole.bugHp    = def.hp;
    hole.timeLeft = def.lifetime;
    hole.scale    = 0;
    hole.animDir  = 1;
  }

  private spawnSquashParticles(x: number, y: number, color: string): void {
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI*2*i)/10, sp = 60+Math.random()*80;
      this.particles.push({ id:this.partId++, x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-30, life:.7, maxLife:.7, color, size:5+Math.random()*4 });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) { p.x+=p.vx*dt/1000; p.y+=p.vy*dt/1000; p.vy+=150*dt/1000; p.life-=dt/1000; }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  private endGame(): void {
    this.state = 'dead';
    this.scoreService.save(GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(GAME_ID);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, this.H);
    bg.addColorStop(0, '#0a1a0a'); bg.addColorStop(1, '#050a05');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, this.W, this.H);

    // Grid pattern
    ctx.strokeStyle = 'rgba(76,175,80,0.06)'; ctx.lineWidth = 1;
    for (let x = 0; x < this.W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,this.H); ctx.stroke(); }
    for (let y = 0; y < this.H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(this.W,y); ctx.stroke(); }

    // Holes
    for (const hole of this.holes) this.drawHole(ctx, hole);

    // Particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life/p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(p.life/p.maxLife), 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating score texts
    for (const t of this.floatingTexts) {
      ctx.globalAlpha = Math.min(1, t.life);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y - (1.2 - t.life) * 30);
    }
    ctx.globalAlpha = 1;

    // HUD
    this.drawHUD(ctx);

    // Overlays
    if (this.state === 'idle') this.drawOverlay(ctx, '🐛 Bug Squash', 'Click bugs before they escape to production!', '← Click anywhere to Start →', '#4CAF50');
    if (this.state === 'dead') this.drawGameOver(ctx);
  }

  private drawHole(ctx: CanvasRenderingContext2D, hole: HoleState): void {
    const { cx, cy, r } = hole;

    // Hole shadow
    const shadow = ctx.createRadialGradient(cx, cy+4, r*0.3, cx, cy+6, r*1.1);
    shadow.addColorStop(0, 'rgba(0,0,0,0.8)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.ellipse(cx, cy+6, r*1.1, r*0.5, 0, 0, Math.PI*2); ctx.fill();

    // Hole
    ctx.fillStyle = '#0d2a0d';
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r*0.55, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1e4a1e'; ctx.lineWidth = 2;
    ctx.stroke();

    if (hole.bugKind === null && hole.scale <= 0) return;

    const def = BUG_DEFS[hole.bugKind ?? 'basic'];
    const bugY = cy - r * hole.scale * 1.1;
    const bugSize = r * 2 * hole.scale;

    // Clip to hole area (bug emerges from hole)
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r*0.55, 0, 0, Math.PI*2);
    ctx.beginPath(); ctx.rect(cx - r*2, bugY - bugSize, r*4, bugSize + r*0.6);
    ctx.restore();

    // Hit flash
    if (hole.hitFlash > 0) {
      ctx.globalAlpha = (hole.hitFlash / 200) * 0.7;
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(cx, bugY, bugSize/2 + 8, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Squash flash
    if (hole.squashFlash > 0) {
      ctx.globalAlpha = hole.squashFlash / 300;
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(cx, bugY, bugSize/2 + 16, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Bug emoji
    if (hole.bugKind !== null) {
      ctx.font = `${bugSize}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.emoji, cx, bugY);

      // HP dots
      if (def.hp > 1) {
        for (let i = 0; i < hole.bugHp; i++) {
          ctx.fillStyle = '#FFD700';
          ctx.beginPath(); ctx.arc(cx - 6 + i*10, bugY - bugSize/2 - 6, 4, 0, Math.PI*2); ctx.fill();
        }
      }

      // Countdown arc
      if (hole.scale >= 1) {
        const pct = hole.timeLeft / def.lifetime;
        ctx.strokeStyle = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#FF9800' : '#f44336';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, bugY, bugSize/2 + 12, -Math.PI/2, -Math.PI/2 + Math.PI*2*pct); ctx.stroke();
      }
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D): void {
    // Background bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, this.H * 0.88, this.W, this.H * 0.12);
    ctx.strokeStyle = 'rgba(76,175,80,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, this.H*0.88); ctx.lineTo(this.W, this.H*0.88); ctx.stroke();

    const y = this.H * 0.94;
    ctx.textBaseline = 'middle'; ctx.font = '14px "Press Start 2P",monospace';

    ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(`${this.score}`, 20, y);

    ctx.textAlign = 'center';
    // Timer
    const timerColor = this.timeLeft > 20 ? '#4CAF50' : this.timeLeft > 10 ? '#FF9800' : '#f44336';
    ctx.fillStyle = timerColor;
    if (this.timeLeft <= 10 && Math.floor(performance.now()/300)%2) ctx.globalAlpha = 0.5;
    ctx.fillText(`⏱ ${this.timeLeft}s`, this.W/2, y);
    ctx.globalAlpha = 1;

    // Lives
    ctx.textAlign = 'right';
    let livesStr = '';
    for (let i = 0; i < this.lives; i++) livesStr += '❤️';
    ctx.font = '16px sans-serif'; ctx.fillText(livesStr, this.W - 20, y);

    // Combo
    if (this.combo >= 3) {
      ctx.font = 'bold 13px "Press Start 2P",monospace';
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.fillText(`🔥 COMBO x${1 + Math.floor(this.combo/3) * 0.5}`, this.W/2, this.H * 0.88 - 16);
    }

    // Best
    ctx.font = '9px "Press Start 2P",monospace';
    ctx.fillStyle = '#FFD700'; ctx.textAlign = 'left';
    ctx.fillText(`BEST:${this.bestScore}`, 20, this.H * 0.88 - 16);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, title: string, sub: string, cta: string, color: string): void {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '26px "Press Start 2P",monospace'; ctx.fillStyle = color;
    ctx.fillText(title, this.W/2, this.H/2 - 55);
    ctx.font = '11px "Press Start 2P",monospace'; ctx.fillStyle = '#ccc';
    ctx.fillText(sub, this.W/2, this.H/2 - 5);
    ctx.fillStyle = '#888'; ctx.fillText('Armored 🐞 needs 2 hits  |  Boss 👾 needs 3 hits', this.W/2, this.H/2 + 22);
    if (Math.floor(performance.now()/500)%2) {
      ctx.font = '11px "Press Start 2P",monospace'; ctx.fillStyle = '#FFD700';
      ctx.fillText(cta, this.W/2, this.H/2 + 62);
    }
  }

  private drawGameOver(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const isTimeUp = this.timeLeft <= 0;
    ctx.font = '22px "Press Start 2P",monospace';
    ctx.fillStyle = isTimeUp ? '#FFD700' : '#f44336';
    ctx.fillText(isTimeUp ? 'TIME\'S UP!' : 'BUGS ESCAPED!', this.W/2, this.H/2 - 55);
    ctx.font = '13px "Press Start 2P",monospace'; ctx.fillStyle = '#fff';
    ctx.fillText(`Score: ${this.score}`, this.W/2, this.H/2 - 5);
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Best: ${this.bestScore}`, this.W/2, this.H/2 + 28);
    if (Math.floor(performance.now()/500)%2) {
      ctx.font = '10px "Press Start 2P",monospace'; ctx.fillStyle = '#4CAF50';
      ctx.fillText('Click to Play Again', this.W/2, this.H/2 + 68);
    }
  }

  goHome(): void { this.router.navigate(['/']); }
  livesArr(): number[] { return Array(this.lives).fill(0); }
  playAgain(): void { this.startGame(); }
}

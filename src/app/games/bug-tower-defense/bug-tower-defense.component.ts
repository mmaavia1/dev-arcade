import { Component, OnInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

// ─── Types ────────────────────────────────────────────────────────────────────
type TowerType  = 'basic' | 'cannon' | 'freeze' | 'zap';
type BugType    = 'basic' | 'fast' | 'armored' | 'boss';
type GamePhase  = 'prep' | 'wave' | 'gameover' | 'victory';

interface Vec2 { col: number; row: number; }
interface Bug {
  id: number; type: BugType; emoji: string;
  x: number; y: number;
  pathIdx: number; sub: number;          // path progress
  hp: number; maxHp: number;
  speed: number; reward: number;
  slowed: number;                        // slow timer ms
}
interface Tower {
  col: number; row: number;
  type: TowerType; emoji: string; level: number;
  damage: number; range: number; fireRate: number;
  lastFired: number; aoe: boolean;
}
interface Projectile {
  id: number; x: number; y: number;
  tx: number; ty: number; bugId: number;
  speed: number; damage: number;
  type: TowerType; emoji: string; aoe: boolean;
}
interface Particle {
  id: number; x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const COLS = 22, ROWS = 13;

const PATH_WP: Vec2[] = [
  {col:0,row:6},{col:5,row:6},{col:5,row:2},
  {col:12,row:2},{col:12,row:10},{col:17,row:10},
  {col:17,row:5},{col:21,row:5}
];

const TOWER_DEFS: Record<TowerType, Omit<Tower,'col'|'row'|'lastFired'|'level'> & {cost:number; desc:string}> = {
  basic:  { type:'basic',  emoji:'🔫', damage:22,  range:2.8, fireRate:1.4, aoe:false, cost:75,  desc:'Fast attack, single target' },
  cannon: { type:'cannon', emoji:'💣', damage:65,  range:2.2, fireRate:0.7, aoe:true,  cost:150, desc:'AOE blast, hits nearby bugs' },
  freeze: { type:'freeze', emoji:'❄️', damage:10,  range:3.2, fireRate:1.2, aoe:false, cost:100, desc:'Slows bugs by 60%' },
  zap:    { type:'zap',    emoji:'⚡', damage:110, range:2.6, fireRate:0.55,aoe:false, cost:200, desc:'Massive single damage' },
};

const BUG_DEFS: Record<BugType, {hp:number; speed:number; reward:number; emoji:string; color:string}> = {
  basic:   { hp:80,   speed:1.2, reward:10,  emoji:'🐛', color:'#81C784' },
  fast:    { hp:40,   speed:2.8, reward:15,  emoji:'🦗', color:'#FFD54F' },
  armored: { hp:220,  speed:0.7, reward:25,  emoji:'🐞', color:'#EF9A9A' },
  boss:    { hp:1200, speed:0.5, reward:100, emoji:'👾', color:'#CE93D8' },
};

const WAVES: Array<{type:BugType; count:number; interval:number}[]> = [
  [{type:'basic',count:8,interval:1400}],
  [{type:'basic',count:10,interval:1200},{type:'fast',count:4,interval:900}],
  [{type:'fast',count:12,interval:800}],
  [{type:'basic',count:8,interval:1000},{type:'armored',count:4,interval:2000}],
  [{type:'armored',count:6,interval:1500},{type:'boss',count:1,interval:0}],
  [{type:'fast',count:15,interval:600},{type:'armored',count:5,interval:1200}],
  [{type:'armored',count:8,interval:1000},{type:'fast',count:10,interval:700}],
  [{type:'boss',count:2,interval:5000},{type:'fast',count:8,interval:800}],
  [{type:'basic',count:20,interval:600},{type:'armored',count:8,interval:1000},{type:'boss',count:1,interval:0}],
  [{type:'boss',count:3,interval:4000},{type:'armored',count:10,interval:900}],
];

@Component({
  selector: 'app-bug-tower-defense',
  standalone: true,
  templateUrl: './bug-tower-defense.component.html',
  styleUrl:    './bug-tower-defense.component.scss'
})
export class BugTowerDefenseComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  // ── State ────────────────────────────────────────────────────────────────
  phase: GamePhase = 'prep';
  wave       = 0;
  credits    = 200;
  lives      = 20;
  score      = 0;
  bestScore  = 0;
  selectedTower: TowerType | null = null;
  inspected:  Tower | null = null;
  hoverCell:  Vec2 | null = null;
  showTutorial = true;

  readonly towerTypes: TowerType[] = ['basic','cannon','freeze','zap'];
  readonly towerDefs = TOWER_DEFS;
  readonly waveCount = WAVES.length;

  // ── Private ──────────────────────────────────────────────────────────────
  private ctx!: CanvasRenderingContext2D;
  private cellW = 0; private cellH = 0;
  private pathCells: Vec2[] = [];
  private pathSet  = new Set<string>();
  private towers   = new Map<string, Tower>();
  private bugs: Bug[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private bugId = 0; private projId = 0; private partId = 0;
  private animId = 0; private lastTs = 0;
  private spawnQueue: Array<{type:BugType; delay:number}> = [];
  private spawnTimer = 0;
  private bugsRemaining = 0;

  constructor(private router: Router, private scoreService: HubScoreService) {}

  ngOnInit(): void {
    this.bestScore = this.scoreService.getBest('bug-tower-defense');
    this.buildPath();
    this.resizeCanvas();
    this.startLoop();
  }

  ngOnDestroy(): void { cancelAnimationFrame(this.animId); }

  @HostListener('window:resize')
  onResize(): void { this.resizeCanvas(); }

  // ── Setup ────────────────────────────────────────────────────────────────
  private resizeCanvas(): void {
    const c = this.canvasRef.nativeElement;
    const container = c.parentElement!;
    c.width  = container.clientWidth;
    c.height = container.clientHeight;
    this.ctx  = c.getContext('2d')!;
    this.cellW = c.width  / COLS;
    this.cellH = c.height / ROWS;
  }

  private buildPath(): void {
    const seen = new Set<string>();
    this.pathCells = [];
    for (let i = 0; i < PATH_WP.length - 1; i++) {
      const a = PATH_WP[i], b = PATH_WP[i + 1];
      if (a.col === b.col) {
        const d = b.row > a.row ? 1 : -1;
        for (let r = a.row; r !== b.row + d; r += d) this.addCell(a.col, r, seen);
      } else {
        const d = b.col > a.col ? 1 : -1;
        for (let c = a.col; c !== b.col + d; c += d) this.addCell(c, a.row, seen);
      }
    }
  }

  private addCell(col: number, row: number, seen: Set<string>): void {
    const k = `${col},${row}`;
    if (!seen.has(k)) { seen.add(k); this.pathCells.push({col,row}); this.pathSet.add(k); }
  }

  // ── Game Loop ─────────────────────────────────────────────────────────────
  private startLoop(): void {
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      const dt = Math.min(ts - this.lastTs, 50); this.lastTs = ts;
      this.update(dt);
      this.render();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    if (this.phase === 'wave') {
      this.updateSpawn(dt);
      this.updateBugs(dt);
      this.updateTowers(dt);
      this.updateProjectiles(dt);
      if (this.bugsRemaining === 0 && this.bugs.length === 0 && this.spawnQueue.length === 0)
        this.endWave();
    }
    this.updateParticles(dt);
  }

  private updateSpawn(dt: number): void {
    if (!this.spawnQueue.length) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const item = this.spawnQueue.shift()!;
      this.spawnBug(item.type);
      this.spawnTimer = this.spawnQueue.length ? this.spawnQueue[0].delay : 0;
    }
  }

  private spawnBug(type: BugType): void {
    const def = BUG_DEFS[type];
    const start = this.cellCenter(this.pathCells[0]);
    this.bugs.push({
      id: this.bugId++, type, emoji: def.emoji,
      x: start.x, y: start.y,
      pathIdx: 0, sub: 0,
      hp: def.hp, maxHp: def.hp,
      speed: def.speed, reward: def.reward,
      slowed: 0
    });
  }

  private updateBugs(dt: number): void {
    const dead: Bug[] = [];
    for (const bug of this.bugs) {
      if (bug.slowed > 0) bug.slowed -= dt;
      const speedMult = bug.slowed > 0 ? 0.35 : 1;
      const cellsPerSec = bug.speed * speedMult;
      let move = (cellsPerSec * dt) / 1000;

      while (move > 0 && bug.pathIdx < this.pathCells.length - 1) {
        const remaining = 1 - bug.sub;
        if (move >= remaining) {
          move -= remaining; bug.pathIdx++; bug.sub = 0;
        } else { bug.sub += move; move = 0; }
      }

      if (bug.pathIdx >= this.pathCells.length - 1) {
        dead.push(bug);
        this.lives = Math.max(0, this.lives - (bug.type === 'boss' ? 3 : 1));
        if (this.lives <= 0) { this.gameOver(); return; }
        continue;
      }

      const a = this.cellCenter(this.pathCells[bug.pathIdx]);
      const b = this.cellCenter(this.pathCells[bug.pathIdx + 1]);
      bug.x = a.x + (b.x - a.x) * bug.sub;
      bug.y = a.y + (b.y - a.y) * bug.sub;
    }
    this.bugs = this.bugs.filter(b => !dead.includes(b));
  }

  private updateTowers(dt: number): void {
    const now = performance.now();
    for (const [, tower] of this.towers) {
      const cooldown = 1000 / tower.fireRate;
      if (now - tower.lastFired < cooldown) continue;
      const target = this.findTarget(tower);
      if (!target) continue;
      tower.lastFired = now;
      const tc = this.cellCenter(tower);
      const bc = {x: target.x, y: target.y};
      let emoji = '•';
      if (tower.type === 'cannon') emoji = '💥';
      else if (tower.type === 'freeze') emoji = '❄️';
      else if (tower.type === 'zap') emoji = '⚡';
      this.projectiles.push({
        id: this.projId++, x: tc.x, y: tc.y,
        tx: bc.x, ty: bc.y, bugId: target.id,
        speed: 280 + Math.random() * 40,
        damage: tower.damage + (tower.level - 1) * 10,
        type: tower.type, emoji,
        aoe: tower.aoe
      });
    }
  }

  private findTarget(tower: Tower): Bug | null {
    const tx = (tower.col + 0.5) * this.cellW;
    const ty = (tower.row + 0.5) * this.cellH;
    const rangePx = tower.range * this.cellW;
    let best: Bug | null = null; let bestProgress = -1;
    for (const bug of this.bugs) {
      const dx = bug.x - tx, dy = bug.y - ty;
      if (dx*dx + dy*dy > rangePx*rangePx) continue;
      const progress = bug.pathIdx + bug.sub;
      if (progress > bestProgress) { bestProgress = progress; best = bug; }
    }
    return best;
  }

  private updateProjectiles(dt: number): void {
    const dead: Projectile[] = [];
    for (const p of this.projectiles) {
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const step = (p.speed * dt) / 1000;
      if (dist <= step) {
        dead.push(p);
        if (p.aoe) {
          const aoeR = this.cellW * 1.8;
          for (const bug of this.bugs) {
            const bx = bug.x - p.tx, by = bug.y - p.ty;
            if (bx*bx + by*by <= aoeR*aoeR) this.hitBug(bug, p);
          }
        } else {
          const bug = this.bugs.find(b => b.id === p.bugId);
          if (bug) this.hitBug(bug, p);
        }
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        // Track moving bug
        const bug = this.bugs.find(b => b.id === p.bugId);
        if (bug) { p.tx = bug.x; p.ty = bug.y; }
      }
    }
    this.projectiles = this.projectiles.filter(p => !dead.includes(p));
  }

  private hitBug(bug: Bug, p: Projectile): void {
    bug.hp -= p.damage;
    if (p.type === 'freeze') bug.slowed = 1500;
    if (bug.hp <= 0) {
      this.bugs = this.bugs.filter(b => b.id !== bug.id);
      this.credits += bug.reward;
      this.score   += bug.reward * 2;
      this.spawnBugParticles(bug);
    }
  }

  private spawnBugParticles(bug: Bug): void {
    const def = BUG_DEFS[bug.type];
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 60 + Math.random() * 80;
      this.particles.push({
        id: this.partId++, x: bug.x, y: bug.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.8, maxLife: 0.8,
        color: def.color, size: 5 + Math.random() * 4
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      p.vy += 120 * dt / 1000;
      p.life -= dt / 1000;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  private render(): void {
    const ctx = this.ctx, W = this.canvasRef.nativeElement.width, H = this.canvasRef.nativeElement.height;
    ctx.clearRect(0, 0, W, H);
    this.drawGrid(ctx);
    this.drawPath(ctx);
    this.drawHoverCell(ctx);
    this.drawTowers(ctx);
    this.drawProjectiles(ctx);
    this.drawBugs(ctx);
    this.drawParticles(ctx);
    this.drawRangePreview(ctx);
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const isPath = this.pathSet.has(`${c},${r}`);
        ctx.fillStyle = isPath ? '#1a2f1a' : (c + r) % 2 === 0 ? '#0f1a0f' : '#111e11';
        ctx.fillRect(c * this.cellW, r * this.cellH, this.cellW, this.cellH);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*this.cellW,0); ctx.lineTo(c*this.cellW,this.canvasRef.nativeElement.height); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0,r*this.cellH); ctx.lineTo(this.canvasRef.nativeElement.width,r*this.cellH); ctx.stroke(); }
  }

  private drawPath(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#2d4a1e';
    for (const {col,row} of this.pathCells) {
      ctx.fillRect(col*this.cellW+1, row*this.cellH+1, this.cellW-2, this.cellH-2);
    }
    // Direction arrows
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.font = `${this.cellW * 0.5}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 1; i < this.pathCells.length - 1; i += 4) {
      const a = this.pathCells[i-1], b = this.pathCells[i+1];
      const arrow = b.col > a.col ? '→' : b.col < a.col ? '←' : b.row > a.row ? '↓' : '↑';
      const p = this.pathCells[i];
      ctx.fillText(arrow, (p.col+0.5)*this.cellW, (p.row+0.5)*this.cellH);
    }
    // Entry/exit labels
    ctx.font = `bold ${this.cellW*0.45}px sans-serif`;
    ctx.fillStyle = '#4CAF50';
    const s = this.pathCells[0], e = this.pathCells[this.pathCells.length-1];
    ctx.fillText('IN', (s.col+0.5)*this.cellW, (s.row+0.5)*this.cellH);
    ctx.fillStyle = '#f44336';
    ctx.fillText('OUT', (e.col+0.5)*this.cellW, (e.row+0.5)*this.cellH);
  }

  private drawHoverCell(ctx: CanvasRenderingContext2D): void {
    if (!this.hoverCell || !this.selectedTower) return;
    const {col,row} = this.hoverCell;
    const canPlace = this.canPlace(col, row);
    ctx.fillStyle = canPlace ? 'rgba(76,175,80,0.25)' : 'rgba(244,67,54,0.25)';
    ctx.fillRect(col*this.cellW, row*this.cellH, this.cellW, this.cellH);
    ctx.strokeStyle = canPlace ? 'rgba(76,175,80,0.8)' : 'rgba(244,67,54,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(col*this.cellW+1, row*this.cellH+1, this.cellW-2, this.cellH-2);
  }

  private drawTowers(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [,t] of this.towers) {
      const x = (t.col+0.5)*this.cellW, y = (t.row+0.5)*this.cellH;
      // Base
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(x, y, this.cellW*0.42, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = this.towerBorderColor(t.type);
      ctx.lineWidth = 2;
      ctx.stroke();
      // Emoji
      ctx.font = `${this.cellW*0.5}px sans-serif`;
      ctx.fillText(t.emoji, x, y);
      // Level dots
      for (let l = 0; l < t.level; l++) {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x - 4 + l*5, y + this.cellH*0.35, 2.5, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }

  private towerBorderColor(t: TowerType): string {
    return {basic:'#4CAF50',cannon:'#FF9800',freeze:'#2196F3',zap:'#9C27B0'}[t];
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of this.projectiles) {
      if (p.type === 'zap') {
        ctx.strokeStyle = '#E040FB'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.tx,p.ty); ctx.stroke();
      } else {
        ctx.font = `${this.cellW*0.35}px sans-serif`;
        ctx.fillText(p.emoji, p.x, p.y);
      }
    }
  }

  private drawBugs(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const bug of this.bugs) {
      const size = bug.type === 'boss' ? this.cellW*0.75 : this.cellW*0.55;
      ctx.font = `${size}px sans-serif`;
      if (bug.slowed > 0) { ctx.globalAlpha = 0.7; }
      ctx.fillText(bug.emoji, bug.x, bug.y);
      ctx.globalAlpha = 1;
      // HP bar
      const bw = this.cellW*0.8, bh = 4;
      const bx = bug.x - bw/2, by = bug.y - size/2 - 7;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, bw, bh);
      const pct = bug.hp / bug.maxHp;
      ctx.fillStyle = pct > 0.6 ? '#4CAF50' : pct > 0.3 ? '#FF9800' : '#f44336';
      ctx.fillRect(bx, by, bw * pct, bh);
      // Slow indicator
      if (bug.slowed > 0) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#64B5F6';
        ctx.fillText('❄', bug.x + size/2, bug.y - size/2);
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life/p.maxLife), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawRangePreview(ctx: CanvasRenderingContext2D): void {
    if (!this.inspected) return;
    const x = (this.inspected.col+0.5)*this.cellW;
    const y = (this.inspected.row+0.5)*this.cellH;
    const r = this.inspected.range * this.cellW;
    ctx.strokeStyle = this.towerBorderColor(this.inspected.type);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = this.towerBorderColor(this.inspected.type) + '15';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  onCanvasClick(e: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / this.cellW);
    const row = Math.floor((e.clientY - rect.top)  / this.cellH);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    const key = `${col},${row}`;
    const existing = this.towers.get(key);

    if (existing) {
      this.inspected = this.inspected?.col === col && this.inspected?.row === row ? null : existing;
      this.selectedTower = null;
      return;
    }

    if (this.selectedTower && this.canPlace(col, row)) {
      const def = TOWER_DEFS[this.selectedTower];
      if (this.credits < def.cost) return;
      this.credits -= def.cost;
      this.towers.set(key, {
        col, row, type: this.selectedTower, emoji: def.emoji,
        level: 1, damage: def.damage, range: def.range,
        fireRate: def.fireRate, aoe: def.aoe, lastFired: 0
      });
    } else {
      this.inspected = null;
    }
  }

  onCanvasMove(e: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / this.cellW);
    const row = Math.floor((e.clientY - rect.top)  / this.cellH);
    this.hoverCell = (col >= 0 && col < COLS && row >= 0 && row < ROWS) ? {col,row} : null;
  }

  onCanvasLeave(): void { this.hoverCell = null; }

  private canPlace(col: number, row: number): boolean {
    return !this.pathSet.has(`${col},${row}`) && !this.towers.has(`${col},${row}`);
  }

  selectTower(t: TowerType): void {
    this.selectedTower = this.selectedTower === t ? null : t;
    this.inspected = null;
  }

  upgradeTower(): void {
    if (!this.inspected || this.inspected.level >= 3) return;
    const cost = this.inspected.level * 100;
    if (this.credits < cost) return;
    this.credits -= cost;
    this.inspected.level++;
    this.inspected.damage = Math.round(this.inspected.damage * 1.4);
    this.inspected.range  = Math.round(this.inspected.range * 1.15 * 10) / 10;
  }

  sellTower(): void {
    if (!this.inspected) return;
    const key = `${this.inspected.col},${this.inspected.row}`;
    this.credits += Math.floor(TOWER_DEFS[this.inspected.type].cost * 0.6);
    this.towers.delete(key);
    this.inspected = null;
  }

  upgradeCost(): number { return this.inspected ? this.inspected.level * 100 : 0; }
  sellValue():   number { return this.inspected ? Math.floor(TOWER_DEFS[this.inspected.type].cost * 0.6) : 0; }

  // ── Wave control ──────────────────────────────────────────────────────────
  startWave(): void {
    if (this.phase !== 'prep' || this.wave >= WAVES.length) return;
    const waveDef = WAVES[this.wave];
    this.spawnQueue = [];
    this.bugsRemaining = 0;
    let delay = 0;
    for (const group of waveDef) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({type: group.type, delay});
        this.bugsRemaining++;
        delay = i === 0 && group === waveDef[0] ? 0 : group.interval;
      }
    }
    this.spawnTimer = 0;
    this.phase = 'wave';
    this.inspected = null;
    this.selectedTower = null;
  }

  private endWave(): void {
    this.wave++;
    this.bugsRemaining = 0;
    const bonus = 50 + this.wave * 20;
    this.credits += bonus;
    if (this.wave >= WAVES.length) { this.phase = 'victory'; this.saveScore(); }
    else this.phase = 'prep';
  }

  private gameOver(): void {
    this.phase = 'gameover';
    cancelAnimationFrame(this.animId);
    this.saveScore();
  }

  private saveScore(): void {
    this.scoreService.save('bug-tower-defense', this.score);
    this.bestScore = this.scoreService.getBest('bug-tower-defense');
  }

  restart(): void {
    this.phase = 'prep'; this.wave = 0; this.credits = 200;
    this.lives = 20; this.score = 0;
    this.towers.clear(); this.bugs = []; this.projectiles = [];
    this.particles = []; this.spawnQueue = []; this.bugsRemaining = 0;
    this.selectedTower = null; this.inspected = null;
    cancelAnimationFrame(this.animId);
    this.startLoop();
  }

  goHome(): void { this.router.navigate(['/']); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private cellCenter(v: Vec2): {x:number; y:number} {
    return {x:(v.col+0.5)*this.cellW, y:(v.row+0.5)*this.cellH};
  }

  livesArr(): number[] { return Array(Math.max(0, this.lives)).fill(0); }
  canAfford(t: TowerType): boolean { return this.credits >= TOWER_DEFS[t].cost; }
  towerCost(t: TowerType): number  { return TOWER_DEFS[t].cost; }
  towerDesc(t: TowerType): string  { return TOWER_DEFS[t].desc; }
  towerEmoji(t: TowerType): string { return TOWER_DEFS[t].emoji; }
  towerName(t: TowerType): string  { return {basic:'Basic',cannon:'Cannon',freeze:'Freeze',zap:'Zapper'}[t]; }
}

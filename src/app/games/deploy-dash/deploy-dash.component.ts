import { Component, OnInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

type GameState = 'idle' | 'playing' | 'dead';
type ObstacleKind = 'bug' | 'conflict' | 'fire' | 'cloud';

interface Obstacle { id: number; kind: ObstacleKind; x: number; y: number; w: number; h: number; emoji: string; }
interface Particle  { id: number; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }

const GRAVITY    = 0.55;
const JUMP_FORCE = -13.5;
const GROUND_H   = 80;
const PSIZE      = 44;
const GAME_ID    = 'deploy-dash';

@Component({
  selector: 'app-deploy-dash',
  standalone: true,
  templateUrl: './deploy-dash.component.html',
  styleUrl:    './deploy-dash.component.scss'
})
export class DeployDashComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  state: GameState = 'idle';
  score     = 0;
  bestScore = 0;

  private ctx!: CanvasRenderingContext2D;
  private W = 0; private H = 0; private gndY = 0;
  private px = 110; private py = 0; private pvy = 0;
  private jumps = 0;
  private obstacles: Obstacle[] = [];
  private particles: Particle[] = [];
  private obsId = 0; private partId = 0;
  private speed = 5; private distance = 0;
  private nextObsDist = 80;
  private frameCount  = 0;
  private animId      = 0; private lastTs = 0;
  private cloudX: {x:number; y:number; s:number}[] = [];

  constructor(private router: Router, private scoreService: HubScoreService) {}

  ngOnInit(): void {
    this.bestScore = this.scoreService.getBest(GAME_ID);
    const c = this.canvasRef.nativeElement;
    c.width  = c.parentElement!.clientWidth;
    c.height = c.parentElement!.clientHeight;
    this.ctx = c.getContext('2d')!;
    this.W = c.width; this.H = c.height;
    this.gndY = this.H - GROUND_H;
    this.py = this.gndY - PSIZE;
    this.cloudX = Array.from({length: 10}, (_, i) => ({
      x: Math.random() * this.W, y: 30 + Math.random() * (this.gndY * 0.5), s: 20 + Math.random() * 18
    }));
    this.startLoop();
  }

  ngOnDestroy(): void { cancelAnimationFrame(this.animId); }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); this.handleInput(); }
  }

  onTap(): void { this.handleInput(); }

  private handleInput(): void {
    if (this.state === 'idle') { this.startGame(); return; }
    if (this.state === 'dead') { this.startGame(); return; }
    if (this.jumps < 2) { this.pvy = JUMP_FORCE + (this.jumps === 1 ? 1.5 : 0); this.jumps++; }
  }

  private startGame(): void {
    this.state = 'playing';
    this.score = 0; this.speed = 5; this.distance = 0;
    this.obstacles = []; this.particles = [];
    this.nextObsDist = 80; this.frameCount = 0;
    this.py = this.gndY - PSIZE; this.pvy = 0; this.jumps = 0;
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
    const dtS = dt / 1000;
    // clouds
    this.cloudX.forEach(c => { c.x -= this.speed * 0.25 * dtS * 60; if (c.x < -40) c.x = this.W + 40; });

    if (this.state !== 'playing') { this.updateParticles(dt); return; }

    this.distance += this.speed * dtS * 60;
    this.score = Math.floor(this.distance / 10);
    this.speed = 5 + Math.min(Math.floor(this.distance / 700) * 0.7, 5);

    // physics
    this.pvy += GRAVITY;
    this.py  += this.pvy;
    const ground = this.gndY - PSIZE;
    if (this.py >= ground) { this.py = ground; this.pvy = 0; this.jumps = 0; }

    // spawn
    this.nextObsDist -= this.speed;
    if (this.nextObsDist <= 0) {
      this.spawnObstacle();
      this.nextObsDist = 200 + Math.random() * 240 - Math.min(this.distance / 120, 70);
    }
    for (const o of this.obstacles) o.x -= this.speed * dtS * 60;
    this.obstacles = this.obstacles.filter(o => o.x + o.w > -30);

    // collision
    for (const o of this.obstacles) {
      if (this.overlap(this.px+6, this.py+4, PSIZE-12, PSIZE-8, o.x+4, o.y+4, o.w-8, o.h-8)) {
        this.die(); return;
      }
    }
    this.updateParticles(dt);
  }

  private overlap(ax:number,ay:number,aw:number,ah:number,bx:number,by:number,bw:number,bh:number): boolean {
    return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
  }

  private spawnObstacle(): void {
    const r = Math.random();
    let kind: ObstacleKind;
    if      (this.distance < 600)  kind = r < 0.65 ? 'bug' : 'conflict';
    else if (this.distance < 1400) kind = r < 0.4 ? 'bug' : r < 0.75 ? 'conflict' : 'fire';
    else                           kind = r < 0.3 ? 'bug' : r < 0.55 ? 'conflict' : r < 0.8 ? 'fire' : 'cloud';

    const cfgs: Record<ObstacleKind,{emoji:string;w:number;h:number;go:number}> = {
      bug:      { emoji:'🐛', w:40, h:30, go:0 },
      conflict: { emoji:'⚡', w:34, h:52, go:0 },
      fire:     { emoji:'🔥', w:36, h:42, go:0 },
      cloud:    { emoji:'⛈️', w:50, h:40, go:-(PSIZE + 8) },
    };
    const c = cfgs[kind];
    this.obstacles.push({ id:this.obsId++, kind, emoji:c.emoji, w:c.w, h:c.h, x:this.W+20, y:this.gndY-c.h-c.go });
  }

  private die(): void {
    this.state = 'dead';
    const colors = ['#ff5252','#ff9800','#ffd740','#e040fb'];
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI*2*i)/16, sp = 80+Math.random()*120;
      this.particles.push({ id:this.partId++, x:this.px+PSIZE/2, y:this.py+PSIZE/2, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-60, life:1, maxLife:1, color:colors[i%4], size:6+Math.random()*5 });
    }
    this.scoreService.save(GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(GAME_ID);
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) { p.x+=p.vx*dt/1000; p.y+=p.vy*dt/1000; p.vy+=200*dt/1000; p.life-=dt/1000; }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  // ── Draw ─────────────────────────────────────────────────────────────────
  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.W,this.H);

    // Sky
    const sky = ctx.createLinearGradient(0,0,0,this.gndY);
    sky.addColorStop(0,'#070d18'); sky.addColorStop(1,'#0c1d38');
    ctx.fillStyle = sky; ctx.fillRect(0,0,this.W,this.gndY);

    // Stars
    ctx.fillStyle='rgba(255,255,255,0.5)';
    for(let i=0;i<50;i++){ctx.fillRect((i*139+50)%this.W,(i*97+20)%(this.gndY*0.7),(i%4===0)?2:1,(i%4===0)?2:1);}

    // Clouds
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.globalAlpha=0.45;
    for(const c of this.cloudX){ctx.font=`${c.s}px sans-serif`;ctx.fillText('☁️',c.x,c.y);}
    ctx.globalAlpha=1;

    // Ground
    const g=ctx.createLinearGradient(0,this.gndY,0,this.H);
    g.addColorStop(0,'#1a3a1a');g.addColorStop(1,'#0a140a');
    ctx.fillStyle=g;ctx.fillRect(0,this.gndY,this.W,GROUND_H);
    ctx.strokeStyle='#4CAF50';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,this.gndY);ctx.lineTo(this.W,this.gndY);ctx.stroke();
    // moving grid
    const off=(this.distance*3)%60;
    ctx.strokeStyle='rgba(76,175,80,0.12)';ctx.lineWidth=1;
    for(let x=-off;x<this.W;x+=60){ctx.beginPath();ctx.moveTo(x,this.gndY);ctx.lineTo(x,this.H);ctx.stroke();}

    // Obstacles
    ctx.textAlign='center';ctx.textBaseline='middle';
    for(const o of this.obstacles){ctx.font=`${Math.min(o.w,o.h)*0.9}px sans-serif`;ctx.fillText(o.emoji,o.x+o.w/2,o.y+o.h/2);}

    // Player shadow
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.beginPath();ctx.ellipse(this.px+PSIZE/2,this.gndY+4,16,4,0,0,Math.PI*2);ctx.fill();

    // Player
    const bob = this.jumps===0 ? Math.sin(this.frameCount*0.22)*1.8 : 0;
    ctx.font=`${PSIZE}px sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('👨‍💻',this.px+PSIZE/2,this.py+PSIZE/2+bob);
    if(this.jumps===2){ctx.strokeStyle='rgba(100,200,255,0.5)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(this.px+PSIZE/2,this.py+PSIZE/2,PSIZE/2+5,0,Math.PI*2);ctx.stroke();}

    // Particles
    for(const p of this.particles){
      ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size*(p.life/p.maxLife),0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;

    // HUD
    ctx.font='14px "Press Start 2P",monospace';ctx.textAlign='left';ctx.textBaseline='top';
    ctx.fillStyle='#fff';ctx.fillText(`${this.score}m`,16,16);
    ctx.fillStyle='#FFD700';ctx.textAlign='right';ctx.fillText(`BEST:${this.bestScore}m`,this.W-16,16);
    ctx.textAlign='center';ctx.font='9px "Press Start 2P",monospace';ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.fillText(`SPD ${this.speed.toFixed(1)}`,this.W/2,16);

    const blink=Math.floor(performance.now()/500)%2;
    if(this.state==='idle'){
      ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,this.W,this.H);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='26px "Press Start 2P",monospace';ctx.fillStyle='#4CAF50';ctx.fillText('DEPLOY DASH',this.W/2,this.H/2-60);
      ctx.font='10px "Press Start 2P",monospace';ctx.fillStyle='#aaa';
      ctx.fillText('Jump over 🐛bugs ⚡conflicts 🔥fires ⛈️clouds',this.W/2,this.H/2-10);
      ctx.fillText('Double-jump supported!',this.W/2,this.H/2+16);
      if(blink){ctx.font='11px "Press Start 2P",monospace';ctx.fillStyle='#FFD700';ctx.fillText('SPACE / TAP to Start',this.W/2,this.H/2+60);}
    }
    if(this.state==='dead'){
      ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(0,0,this.W,this.H);
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='22px "Press Start 2P",monospace';ctx.fillStyle='#f44336';ctx.fillText('BUILD FAILED',this.W/2,this.H/2-55);
      ctx.font='13px "Press Start 2P",monospace';ctx.fillStyle='#fff';ctx.fillText(`Distance: ${this.score}m`,this.W/2,this.H/2-5);
      ctx.fillStyle='#FFD700';ctx.fillText(`Best: ${this.bestScore}m`,this.W/2,this.H/2+28);
      if(blink){ctx.font='10px "Press Start 2P",monospace';ctx.fillStyle='#4CAF50';ctx.fillText('SPACE / TAP to Retry',this.W/2,this.H/2+68);}
    }
  }

  goHome(): void { this.router.navigate(['/']); }
}

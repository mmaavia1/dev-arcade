import { Component, OnInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

type GameState = 'idle' | 'playing' | 'dead';

interface Meeting {
  id: number; x: number; y: number; vx: number; vy: number;
  label: string; size: number; deadly: boolean;
}
interface Task { id: number; x: number; y: number; pulseT: number; }
interface Particle { id: number; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }

const MTG_LABELS  = ['📅 Sync','📞 Call','🗣️ All-hands','📊 Review','👥 1:1','🔔 Stand-up','💼 Interview','📋 Retro','🖥️ Demo'];
const BOSS_LABELS = ['☠️ CEO Review','🚨 Incident Call','💀 Board Meeting'];
const GAME_ID     = 'meeting-dodge';

@Component({
  selector: 'app-meeting-dodge',
  standalone: true,
  templateUrl: './meeting-dodge.component.html',
  styleUrl:    './meeting-dodge.component.scss'
})
export class MeetingDodgeComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  state: GameState = 'idle';
  score     = 0;
  bestScore = 0;
  survived  = 0;
  lives     = 3;

  private ctx!: CanvasRenderingContext2D;
  private W = 0; private H = 0;
  private px = 0; private py = 0;
  private meetings: Meeting[] = [];
  private tasks: Task[] = [];
  private particles: Particle[] = [];
  private meetingId = 0; private taskId = 0; private partId = 0;
  private keys   = new Set<string>();
  private animId = 0; private lastTs = 0;
  private elapsed    = 0;
  private spawnTimer = 0; private taskTimer = 0;
  private spawnRate  = 90;
  private moveSpeed  = 3.5;
  private taskPoints = 0;
  private invincible = 0; // ms of invincibility after hit
  private frameCount = 0;

  constructor(private router: Router, private scoreService: HubScoreService) {}

  ngOnInit(): void {
    this.bestScore = this.scoreService.getBest(GAME_ID);
    const c = this.canvasRef.nativeElement;
    c.width  = c.parentElement!.clientWidth;
    c.height = c.parentElement!.clientHeight;
    this.ctx = c.getContext('2d')!;
    this.W = c.width; this.H = c.height;
    this.startLoop();
  }

  ngOnDestroy(): void { cancelAnimationFrame(this.animId); }

  @HostListener('window:keydown', ['$event']) onKeyDown(e: KeyboardEvent): void { this.keys.add(e.key); }
  @HostListener('window:keyup',   ['$event']) onKeyUp(e: KeyboardEvent): void   { this.keys.delete(e.key); }

  onMouseMove(e: MouseEvent): void {
    if (this.state !== 'playing') return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.px = Math.max(24, Math.min(this.W - 24, e.clientX - rect.left));
    this.py = Math.max(24, Math.min(this.H - 24, e.clientY - rect.top));
  }

  onCanvasClick(): void {
    if (this.state === 'idle') this.startGame();
    else if (this.state === 'dead') this.startGame();
  }

  private startGame(): void {
    this.state = 'playing';
    this.elapsed = 0; this.taskPoints = 0;
    this.px = this.W / 2; this.py = this.H / 2;
    this.meetings = []; this.tasks = []; this.particles = [];
    this.spawnTimer = 0; this.taskTimer = 0;
    this.spawnRate = 90; this.moveSpeed = 3.5;
    this.lives = 3; this.invincible = 0; this.frameCount = 0;
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

    this.elapsed  += dt;
    this.survived  = Math.floor(this.elapsed / 1000);
    this.score     = this.survived * 5 + this.taskPoints;
    this.moveSpeed = 3.5 + this.survived * 0.08;
    this.spawnRate = Math.max(25, 90 - this.survived * 2);
    if (this.invincible > 0) this.invincible -= dt;

    // Keyboard movement
    const spd = 3.2;
    if (this.keys.has('ArrowLeft')  || this.keys.has('a')) this.px = Math.max(24, this.px - spd);
    if (this.keys.has('ArrowRight') || this.keys.has('d')) this.px = Math.min(this.W-24, this.px + spd);
    if (this.keys.has('ArrowUp')    || this.keys.has('w')) this.py = Math.max(24, this.py - spd);
    if (this.keys.has('ArrowDown')  || this.keys.has('s')) this.py = Math.min(this.H-24, this.py + spd);

    // Spawn meetings
    this.spawnTimer--;
    if (this.spawnTimer <= 0) { this.spawnMeeting(); this.spawnTimer = this.spawnRate + Math.random()*20; }

    // Spawn tasks
    this.taskTimer--;
    if (this.taskTimer <= 0) {
      this.tasks.push({ id:this.taskId++, x:60+Math.random()*(this.W-120), y:60+Math.random()*(this.H-120), pulseT:0 });
      this.taskTimer = 200 + Math.random()*100;
    }

    // Move meetings
    for (const m of this.meetings) { m.x += m.vx; m.y += m.vy; }
    this.meetings = this.meetings.filter(m => m.x > -80 && m.x < this.W+80 && m.y > -80 && m.y < this.H+80);

    // Update tasks
    for (const t of this.tasks) t.pulseT += dt;

    // Collect tasks
    this.tasks = this.tasks.filter(t => {
      const dx = t.x - this.px, dy = t.y - this.py;
      if (dx*dx + dy*dy < 36*36) { this.taskPoints += 25; this.spawnCollectParticles(t.x, t.y); return false; }
      return true;
    });

    // Collision with meetings
    if (this.invincible <= 0) {
      for (const m of this.meetings) {
        const dx = m.x - this.px, dy = m.y - this.py;
        const hitR = (m.deadly ? 36 : 28);
        if (dx*dx + dy*dy < hitR*hitR) {
          this.lives--;
          this.invincible = 2000;
          this.spawnHitParticles(this.px, this.py);
          this.meetings = this.meetings.filter(mm => mm.id !== m.id);
          if (this.lives <= 0) { this.die(); return; }
          break;
        }
      }
    }

    this.updateParticles(dt);
  }

  private spawnMeeting(): void {
    const deadly = Math.random() < 0.05 + this.survived * 0.003;
    const labels = deadly ? BOSS_LABELS : MTG_LABELS;
    const edge = Math.floor(Math.random()*4);
    let x = this.W/2, y = this.H/2;
    if (edge===0){x=Math.random()*this.W;y=-30;}
    else if(edge===1){x=Math.random()*this.W;y=this.H+30;}
    else if(edge===2){x=-30;y=Math.random()*this.H;}
    else{x=this.W+30;y=Math.random()*this.H;}
    const ang = Math.atan2(this.py-y, this.px-x) + (Math.random()-0.5)*0.9;
    const spd = this.moveSpeed * (deadly ? 1.3 : 1) * 0.4;
    this.meetings.push({ id:this.meetingId++, x, y, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
      label: labels[Math.floor(Math.random()*labels.length)], size: deadly ? 50 : 34+Math.random()*10, deadly });
  }

  private spawnCollectParticles(x: number, y: number): void {
    for (let i=0;i<8;i++){const a=(Math.PI*2*i)/8,sp=40+Math.random()*60;this.particles.push({id:this.partId++,x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.6,maxLife:.6,color:'#FFD700',size:5+Math.random()*3});}
  }

  private spawnHitParticles(x: number, y: number): void {
    for (let i=0;i<12;i++){const a=(Math.PI*2*i)/12,sp=60+Math.random()*80;this.particles.push({id:this.partId++,x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.8,maxLife:.8,color:'#ff5252',size:6+Math.random()*4});}
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles){p.x+=p.vx*dt/1000;p.y+=p.vy*dt/1000;p.vy+=120*dt/1000;p.life-=dt/1000;}
    this.particles = this.particles.filter(p=>p.life>0);
  }

  private die(): void {
    this.state = 'dead';
    this.scoreService.save(GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(GAME_ID);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Background
    const bg = ctx.createLinearGradient(0,0,0,this.H);
    bg.addColorStop(0,'#140a00');bg.addColorStop(1,'#0a0500');
    ctx.fillStyle=bg;ctx.fillRect(0,0,this.W,this.H);

    // Scan lines effect
    ctx.strokeStyle='rgba(255,152,0,0.04)';ctx.lineWidth=2;
    for(let y=0;y<this.H;y+=6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this.W,y);ctx.stroke();}

    if (this.state === 'playing') {
      this.drawTasks(ctx);
      this.drawMeetings(ctx);
      this.drawPlayer(ctx);
      this.drawParticles(ctx);
      this.drawHUD(ctx);
    }

    if (this.state === 'idle') this.drawOverlay(ctx);
    if (this.state === 'dead') this.drawDead(ctx);
  }

  private drawTasks(ctx: CanvasRenderingContext2D): void {
    for (const t of this.tasks) {
      const pulse = Math.sin(t.pulseT/300)*0.15+0.85;
      ctx.font = `${28*pulse}px sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.globalAlpha=0.9;
      ctx.fillText('💼',t.x,t.y);
      ctx.globalAlpha=0.3;
      ctx.strokeStyle='#FFD700';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(t.x,t.y,22*pulse,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=1;
    }
  }

  private drawMeetings(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign='center';ctx.textBaseline='middle';
    for (const m of this.meetings) {
      // Glow
      const glowColor = m.deadly ? 'rgba(255,0,0,0.3)' : 'rgba(255,152,0,0.2)';
      const grd = ctx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.size);
      grd.addColorStop(0,glowColor);grd.addColorStop(1,'transparent');
      ctx.fillStyle=grd;ctx.beginPath();ctx.arc(m.x,m.y,m.size,0,Math.PI*2);ctx.fill();
      // Label card
      ctx.fillStyle=m.deadly?'rgba(120,0,0,0.85)':'rgba(80,40,0,0.85)';
      const tw = ctx.measureText(m.label).width;
      ctx.font=`${m.deadly?14:12}px sans-serif`;
      const tw2 = ctx.measureText(m.label).width;
      const pad=8;
      ctx.beginPath();ctx.roundRect(m.x-tw2/2-pad,m.y-m.size*0.4-pad,tw2+pad*2,m.size*0.8+pad*2,8);ctx.fill();
      ctx.strokeStyle=m.deadly?'rgba(255,0,0,0.6)':'rgba(255,152,0,0.5)';ctx.lineWidth=1.5;ctx.stroke();
      ctx.fillStyle=m.deadly?'#ff6b6b':'#FFB74D';
      ctx.fillText(m.label,m.x,m.y);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const blink = this.invincible > 0 && Math.floor(this.invincible/100)%2===0;
    if (blink) return;
    // Glow ring
    const grd = ctx.createRadialGradient(this.px,this.py,8,this.px,this.py,32);
    grd.addColorStop(0,'rgba(255,200,0,0.3)');grd.addColorStop(1,'transparent');
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(this.px,this.py,32,0,Math.PI*2);ctx.fill();
    // Player
    ctx.font='36px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('🧑‍💻',this.px,this.py);
    // Shield indicator
    if (this.invincible > 0) {
      ctx.strokeStyle='rgba(100,200,255,0.6)';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(this.px,this.py,28,0,Math.PI*2);ctx.stroke();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size*(p.life/p.maxLife),0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  private drawHUD(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(0,0,this.W,44);
    ctx.strokeStyle='rgba(255,152,0,0.3)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,44);ctx.lineTo(this.W,44);ctx.stroke();
    ctx.font='12px "Press Start 2P",monospace';ctx.textBaseline='middle';
    ctx.fillStyle='#FFB74D';ctx.textAlign='left';ctx.fillText(`${this.score}pts`,16,22);
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(`⏱ ${this.survived}s`,this.W/2,22);
    // Lives
    ctx.textAlign='right';ctx.font='18px sans-serif';
    let lStr='';for(let i=0;i<this.lives;i++)lStr+='❤️';
    ctx.fillText(lStr,this.W-16,22);
    ctx.font='9px "Press Start 2P",monospace';ctx.fillStyle='#FFD700';ctx.textAlign='right';
    ctx.fillText(`BEST:${this.bestScore}`,this.W-16,38);
    // Movement hint
    ctx.font='8px "Press Start 2P",monospace';ctx.fillStyle='rgba(255,255,255,0.25)';ctx.textAlign='center';
    ctx.fillText('MOUSE or WASD/ARROWS to move',this.W/2,this.H-14);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,0,this.W,this.H);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='24px "Press Start 2P",monospace';ctx.fillStyle='#FF9800';
    ctx.fillText('MEETING DODGE',this.W/2,this.H/2-65);
    ctx.font='10px "Press Start 2P",monospace';ctx.fillStyle='#aaa';
    ctx.fillText('Dodge meeting invites to stay productive!',this.W/2,-10+this.H/2);
    ctx.fillText('Collect 💼 tasks for bonus points.',this.W/2,16+this.H/2);
    ctx.fillText('☠️ Boss meetings = instant life loss!',this.W/2,42+this.H/2);
    if(Math.floor(performance.now()/500)%2){ctx.font='11px "Press Start 2P",monospace';ctx.fillStyle='#FFD700';ctx.fillText('Click or Press Key to Start',this.W/2,80+this.H/2);}
  }

  private drawDead(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle='rgba(0,0,0,0.8)';ctx.fillRect(0,0,this.W,this.H);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='20px "Press Start 2P",monospace';ctx.fillStyle='#f44336';
    ctx.fillText('TRAPPED IN MEETINGS!',this.W/2,this.H/2-60);
    ctx.font='12px "Press Start 2P",monospace';ctx.fillStyle='#fff';
    ctx.fillText(`Survived: ${this.survived}s`,this.W/2,this.H/2-10);
    ctx.fillText(`Score: ${this.score}`,this.W/2,this.H/2+18);
    ctx.fillStyle='#FFD700';ctx.fillText(`Best: ${this.bestScore}`,this.W/2,this.H/2+46);
    if(Math.floor(performance.now()/500)%2){ctx.font='10px "Press Start 2P",monospace';ctx.fillStyle='#FF9800';ctx.fillText('Click to Retry',this.W/2,this.H/2+82);}
  }

  goHome(): void { this.router.navigate(['/']); }
}

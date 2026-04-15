import {
  Component, OnInit, OnDestroy, ElementRef, ViewChild,
  HostListener, inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ScoreService } from '../../services/score.service';
import { SettingsService } from '../../services/settings.service';

type GameState = 'ready' | 'playing' | 'dead';

interface Bird {
  x: number; y: number; vy: number;
  rotation: number; frame: number; tick: number;
}

interface Pipe {
  x: number; topH: number; gap: number; scored: boolean;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface Cloud {
  x: number; y: number; w: number; speed: number;
}

@Component({
  selector: 'app-flappy-bird',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './flappy-bird.component.html',
  styleUrl: './flappy-bird.component.scss'
})
export class FlappyBirdComponent implements OnInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private router = inject(Router);
  private scoreService = inject(ScoreService);
  private settingsService = inject(SettingsService);

  state: GameState = 'ready';
  score = 0;
  bestScore = 0;
  isNewHighScore = false;
  showGameOver = false;
  playerName = '';
  nameSaved = false;

  private ctx!: CanvasRenderingContext2D;
  private W = 480;
  private H = 640;
  private animFrame = 0;

  private bird!: Bird;
  private pipes: Pipe[] = [];
  private particles: Particle[] = [];
  private clouds: Cloud[] = [];
  private groundOffset = 0;
  private bgOffset = 0;
  private spawnTimer = 0;
  private audioCtx: AudioContext | null = null;

  // Difficulty params
  private pipeSpeed = 3.2;
  private pipeGap = 155;
  private spawnRate = 100;

  // Game constants
  private readonly GROUND_H = 80;
  private readonly BIRD_X = 110;
  private readonly GRAVITY = 0.32;
  private readonly FLAP_FORCE = -7.5;
  private readonly PIPE_W = 58;
  private readonly BIRD_R = 16;

  ngOnInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();
    this.bestScore = this.scoreService.getBestScore();
    this.initClouds();
    this.resetBird();
    const diff = this.settingsService.getDifficultyParams();
    this.pipeSpeed = diff.pipeSpeed;
    this.pipeGap = diff.pipeGap;
    this.spawnRate = diff.spawnRate;
    this.loop();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animFrame);
    this.audioCtx?.close();
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const maxW = Math.min(window.innerWidth, 480);
    const maxH = Math.min(window.innerHeight, 640);
    const ratio = Math.min(maxW / 480, maxH / 640);
    canvas.width = 480;
    canvas.height = 640;
    canvas.style.width = `${480 * ratio}px`;
    canvas.style.height = `${640 * ratio}px`;
  }

  private resetBird(): void {
    this.bird = { x: this.BIRD_X, y: this.H / 2 - 40, vy: 0, rotation: 0, frame: 0, tick: 0 };
  }

  private initClouds(): void {
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({
        x: Math.random() * this.W,
        y: 30 + Math.random() * (this.H * 0.4),
        w: 70 + Math.random() * 100,
        speed: 0.4 + Math.random() * 0.4
      });
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      this.handleInput();
    }
    if (e.key === 'Escape') this.goToMenu();
  }

  onTap(): void { this.handleInput(); }

  private handleInput(): void {
    if (this.state === 'dead') return;
    if (this.state === 'ready') { this.state = 'playing'; }
    this.flap();
  }

  private flap(): void {
    this.bird.vy = this.FLAP_FORCE;
    this.playSound('flap');
  }

  private loop(): void {
    this.update();
    this.draw();
    this.animFrame = requestAnimationFrame(() => this.loop());
  }

  private update(): void {
    if (this.state === 'dead') {
      this.updateParticles();
      return;
    }

    // Animate bird always (bobbing when ready)
    this.bird.tick++;
    this.bird.frame = Math.floor(this.bird.tick / 8) % 3;

    if (this.state === 'ready') {
      // Gentle bob
      this.bird.y = this.H / 2 - 40 + Math.sin(this.bird.tick * 0.08) * 8;
      this.bird.rotation = Math.sin(this.bird.tick * 0.08) * 0.15;
      this.moveClouds();
      this.groundOffset = (this.groundOffset + 1.5) % 24;
      return;
    }

    // Playing
    this.bird.vy += this.GRAVITY;
    this.bird.vy = Math.min(this.bird.vy, 12);
    this.bird.y += this.bird.vy;
    this.bird.rotation = Math.max(-0.5, Math.min(Math.PI / 2, this.bird.vy * 0.08));

    this.moveClouds();
    this.groundOffset = (this.groundOffset + this.pipeSpeed) % 24;
    this.bgOffset = (this.bgOffset + 0.5) % this.W;

    // Spawn pipes
    this.spawnTimer++;
    if (this.spawnTimer >= this.spawnRate) {
      this.spawnTimer = 0;
      this.spawnPipe();
    }

    // Move & score pipes
    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const p = this.pipes[i];
      p.x -= this.pipeSpeed;

      if (!p.scored && p.x + this.PIPE_W < this.bird.x) {
        p.scored = true;
        this.score++;
        this.playSound('score');
        this.spawnScoreParticles();
      }

      if (p.x + this.PIPE_W < 0) this.pipes.splice(i, 1);
    }

    this.updateParticles();
    this.checkCollision();
  }

  private spawnPipe(): void {
    const minTop = 60;
    const maxTop = this.H - this.GROUND_H - this.pipeGap - 60;
    const topH = minTop + Math.random() * (maxTop - minTop);
    this.pipes.push({ x: this.W + 10, topH, gap: this.pipeGap, scored: false });
  }

  private checkCollision(): void {
    const bx = this.bird.x;
    const by = this.bird.y;
    const r = this.BIRD_R - 3;

    // Ground / ceiling
    if (by + r > this.H - this.GROUND_H || by - r < 0) {
      this.die();
      return;
    }

    // Pipes
    for (const p of this.pipes) {
      const px = p.x, pw = this.PIPE_W;
      const topBot = p.topH, botTop = p.topH + p.gap;

      if (bx + r > px && bx - r < px + pw) {
        if (by - r < topBot || by + r > botTop) {
          this.die();
          return;
        }
      }
    }
  }

  private die(): void {
    this.state = 'dead';
    this.playSound('die');
    this.spawnDeathParticles();
    this.isNewHighScore = this.scoreService.isHighScore(this.score);
    if (this.score > this.bestScore) this.bestScore = this.score;
    setTimeout(() => { this.showGameOver = true; }, 900);
  }

  saveName(): void {
    if (this.nameSaved) return;
    this.scoreService.saveScore(this.score, this.playerName || 'Anonymous');
    this.nameSaved = true;
  }

  private spawnDeathParticles(): void {
    const colors = ['#FFD700', '#FF6B35', '#ff4444', '#fff', '#FFA500'];
    for (let i = 0; i < 28; i++) {
      const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.3;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x: this.bird.x, y: this.bird.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
        life: 1, maxLife: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 6
      });
    }
  }

  private spawnScoreParticles(): void {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: this.bird.x + 20, y: this.bird.y,
        vx: (Math.random() - 0.5) * 4,
        vy: -2 - Math.random() * 3,
        life: 0.8, maxLife: 0.8,
        color: '#FFD700',
        size: 4 + Math.random() * 4
      });
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.025;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private moveClouds(): void {
    for (const c of this.clouds) {
      c.x -= c.speed;
      if (c.x + c.w < 0) {
        c.x = this.W + c.w;
        c.y = 30 + Math.random() * (this.H * 0.38);
      }
    }
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    this.drawSky(ctx);
    this.drawClouds(ctx);
    this.drawPipes(ctx);
    this.drawGround(ctx);
    if (this.state !== 'dead' || this.particles.length > 0) {
      this.drawBird(ctx);
    }
    this.drawParticles(ctx);
    this.drawHUD(ctx);
  }

  private drawSky(ctx: CanvasRenderingContext2D): void {
    const grad = ctx.createLinearGradient(0, 0, 0, this.H - this.GROUND_H);
    grad.addColorStop(0, '#1a6bc4');
    grad.addColorStop(0.55, '#4db8f0');
    grad.addColorStop(1, '#a8e6ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H - this.GROUND_H);
  }

  private drawClouds(ctx: CanvasRenderingContext2D): void {
    for (const c of this.clouds) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffffff';
      const h = c.w * 0.4;
      ctx.beginPath();
      ctx.ellipse(c.x + c.w * 0.5, c.y + h * 0.6, c.w * 0.5, h * 0.4, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.3, c.y + h * 0.5, c.w * 0.3, h * 0.45, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.72, c.y + h * 0.5, c.w * 0.28, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPipes(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pipes) {
      this.drawPipePair(ctx, p.x, p.topH, p.gap);
    }
  }

  private drawPipePair(ctx: CanvasRenderingContext2D, x: number, topH: number, gap: number): void {
    const w = this.PIPE_W;
    const capH = 22, capW = w + 10, capX = x - 5;

    // Top pipe body
    this.drawPipeBody(ctx, x, 0, w, topH);
    // Top pipe cap (bottom of top pipe)
    this.drawPipeCap(ctx, capX, topH - capH, capW, capH, false);

    const botY = topH + gap;
    const botH = this.H - this.GROUND_H - botY;
    // Bottom pipe cap (top of bottom pipe)
    this.drawPipeCap(ctx, capX, botY, capW, capH, true);
    // Bottom pipe body
    this.drawPipeBody(ctx, x, botY + capH, w, botH - capH);
  }

  private drawPipeBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    if (h <= 0) return;
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#2E7D32');
    grad.addColorStop(0.3, '#4CAF50');
    grad.addColorStop(0.7, '#388E3C');
    grad.addColorStop(1, '#1B5E20');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 4, y, 8, h);
  }

  private drawPipeCap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isTop: boolean): void {
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#1B5E20');
    grad.addColorStop(0.25, '#4CAF50');
    grad.addColorStop(0.75, '#388E3C');
    grad.addColorStop(1, '#1B5E20');
    ctx.fillStyle = grad;
    const r = 4;
    ctx.beginPath();
    if (isTop) {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.arcTo(x, y, x + r, y, r);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 5, y, 10, h);
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    const y = this.H - this.GROUND_H;
    // Grass strip
    const grassGrad = ctx.createLinearGradient(0, y, 0, y + 20);
    grassGrad.addColorStop(0, '#6ABF69');
    grassGrad.addColorStop(1, '#4CAF50');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, y, this.W, 20);
    // Dirt
    const dirtGrad = ctx.createLinearGradient(0, y + 20, 0, this.H);
    dirtGrad.addColorStop(0, '#C8A45A');
    dirtGrad.addColorStop(1, '#8D6E35');
    ctx.fillStyle = dirtGrad;
    ctx.fillRect(0, y + 20, this.W, this.GROUND_H - 20);
    // Moving grass blades
    ctx.fillStyle = '#4CAF50';
    for (let i = -24; i < this.W + 24; i += 24) {
      const ox = (i + this.groundOffset) % (this.W + 24) - 12;
      ctx.beginPath();
      ctx.moveTo(ox, y); ctx.lineTo(ox + 6, y - 9); ctx.lineTo(ox + 12, y);
      ctx.fill();
    }
  }

  private drawBird(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.bird.x, this.bird.y);
    ctx.rotate(this.bird.rotation);

    const r = this.BIRD_R;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(3, r + 2, r * 0.9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bodyGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, r * 1.4);
    bodyGrad.addColorStop(0, '#FFE566');
    bodyGrad.addColorStop(0.6, '#FFD700');
    bodyGrad.addColorStop(1, '#E6A800');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#C88A00';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Wing (animated)
    const wingOffsets = [4, -5, 4];
    const wingY = wingOffsets[this.bird.frame];
    ctx.fillStyle = '#FFA500';
    ctx.beginPath();
    ctx.ellipse(-5, wingY, 10, 6, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E08000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // White eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(7, -4, 6, 5.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Pupil
    ctx.fillStyle = '#2c2c2c';
    ctx.beginPath();
    ctx.arc(8.5, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    // Shine
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(10, -5.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#FF6B35';
    ctx.beginPath();
    ctx.moveTo(13, -1.5);
    ctx.lineTo(21, 0.5);
    ctx.lineTo(13, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#D94F1A';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'ready') {
      this.drawReadyHint(ctx);
    }
    if (this.state === 'playing' || this.state === 'dead') {
      this.drawScore(ctx);
    }
  }

  private drawReadyHint(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText('TAP TO START', this.W / 2 + 1, this.H / 2 + 81);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('TAP TO START', this.W / 2, this.H / 2 + 80);
    ctx.restore();
  }

  private drawScore(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = 'bold 42px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText(String(this.score), this.W / 2 + 2, 72);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(this.score), this.W / 2, 70);
    ctx.restore();
  }

  // ─── Audio ────────────────────────────────────────────────────────────────

  private playSound(type: 'flap' | 'score' | 'die'): void {
    if (!this.settingsService.settings().soundEnabled) return;
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'flap') {
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'score') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch { /* ignore audio errors */ }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  playAgain(): void {
    this.score = 0;
    this.pipes = [];
    this.particles = [];
    this.spawnTimer = 0;
    this.showGameOver = false;
    this.isNewHighScore = false;
    this.playerName = '';
    this.nameSaved = false;
    this.resetBird();
    this.state = 'ready';
  }

  goToMenu(): void { this.router.navigate(['/']); }
  goToScoreboard(): void { this.router.navigate(['/']); }
}

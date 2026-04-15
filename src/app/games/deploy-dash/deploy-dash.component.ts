import { Component, OnInit, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../../services/hub-score.service';

interface Obstacle { id: number; x: number; type: 'conflict' | 'bug' | 'review'; label: string; h: number; }

@Component({ selector: 'app-deploy-dash', standalone: true, templateUrl: './deploy-dash.component.html', styleUrl: './deploy-dash.component.scss' })
export class DeployDashComponent implements OnInit, OnDestroy {
  readonly GAME_ID = 'deploy-dash';
  state: 'ready' | 'playing' | 'dead' = 'ready';
  score = 0; bestScore = 0;
  playerY = 60; playerVY = 0; isJumping = false;
  obstacles: Obstacle[] = [];
  groundOffset = 0;
  private frame = 0; private animId = 0;
  private obstacleId = 0; private nextSpawn = 140;
  private speed = 4; private gravity = 0.6; private jumpForce = -11;
  private readonly GROUND_Y = 60; private readonly PLAYER_X = 18;

  constructor(private router: Router, private scoreService: HubScoreService) {}
  ngOnInit(): void { this.bestScore = this.scoreService.getBest(this.GAME_ID); }
  ngOnDestroy(): void { cancelAnimationFrame(this.animId); }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); this.jump(); }
  }

  onTap(): void { this.jump(); }

  jump(): void {
    if (this.state === 'dead') return;
    if (this.state === 'ready') { this.startGame(); return; }
    if (!this.isJumping) { this.playerVY = this.jumpForce; this.isJumping = true; }
  }

  startGame(): void {
    this.state = 'playing'; this.score = 0; this.obstacles = [];
    this.playerY = this.GROUND_Y; this.playerVY = 0; this.isJumping = false;
    this.frame = 0; this.nextSpawn = 140; this.speed = 4;
    this.animId = requestAnimationFrame(() => this.loop());
  }

  private loop(): void {
    this.frame++;
    this.score = Math.floor(this.frame / 6);
    this.speed = 4 + this.frame * 0.003;
    this.groundOffset = (this.groundOffset + this.speed) % 40;

    // Physics
    this.playerVY += this.gravity;
    this.playerY  -= this.playerVY;
    if (this.playerY >= this.GROUND_Y) { this.playerY = this.GROUND_Y; this.playerVY = 0; this.isJumping = false; }

    // Obstacles
    this.nextSpawn--;
    if (this.nextSpawn <= 0) { this.spawnObstacle(); this.nextSpawn = 90 + Math.random() * 80; }
    for (const o of this.obstacles) o.x -= this.speed;
    this.obstacles = this.obstacles.filter(o => o.x > -10);

    // Collision
    for (const o of this.obstacles) {
      if (o.x > 12 && o.x < 26 && this.playerY > (100 - o.h - 12)) { this.endGame(); return; }
    }

    this.animId = requestAnimationFrame(() => this.loop());
  }

  private spawnObstacle(): void {
    const types: Array<{type: Obstacle['type']; label: string; h: number}> = [
      { type:'conflict', label:'⚡ Merge Conflict', h: 22 },
      { type:'bug',      label:'🐛 Critical Bug',   h: 18 },
      { type:'review',   label:'👀 Code Review',    h: 28 },
    ];
    const t = types[Math.floor(Math.random() * types.length)];
    this.obstacles.push({ id: this.obstacleId++, x: 105, ...t });
  }

  private endGame(): void {
    this.state = 'dead'; cancelAnimationFrame(this.animId);
    this.scoreService.save(this.GAME_ID, this.score);
    this.bestScore = this.scoreService.getBest(this.GAME_ID);
  }

  goHome(): void { this.router.navigate(['/']); }
  playAgain(): void { cancelAnimationFrame(this.animId); this.startGame(); }
  playerBottom(): number { return this.playerY; }
}

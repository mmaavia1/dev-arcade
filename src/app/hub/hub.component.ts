import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HubScoreService } from '../services/hub-score.service';

export interface GameCard {
  id: string; route: string; title: string; emoji: string;
  desc: string; tag: string; tagColor: string; bg: string; difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface GameCategory {
  id: string; label: string; emoji: string; color: string; games: GameCard[];
}

@Component({ selector: 'app-hub', standalone: true, templateUrl: './hub.component.html', styleUrl: './hub.component.scss' })
export class HubComponent implements OnInit {

  categories: GameCategory[] = [
    {
      id: 'general', label: 'General', emoji: '🎮', color: '#a78bfa',
      games: [
        { id:'flappy-bird',    route:'/flappy-bird',    title:'Flappy Bird',     emoji:'🐦', desc:'Tap to fly, survive the pipes! The classic.',      tag:'Classic',  tagColor:'#a78bfa', bg:'linear-gradient(135deg,#1a1a3a,#0d2a1a)', difficulty:'Easy' },
      ]
    },
    {
      id: 'dev', label: 'Developers', emoji: '👨‍💻', color: '#4CAF50',
      games: [
        { id:'bug-tower-defense', route:'/bug-tower-defense', title:'Bug Tower Defense', emoji:'🏰', desc:'Build towers to stop bugs reaching production! 10 waves of chaos.', tag:'Dev', tagColor:'#4CAF50', bg:'linear-gradient(135deg,#0f2a0f,#1a3a0a)', difficulty:'Hard' },
        { id:'bug-squash',  route:'/bug-squash',  title:'Bug Squash',   emoji:'🐛', desc:'Squash bugs before they escape to production!',  tag:'Dev',  tagColor:'#4CAF50', bg:'linear-gradient(135deg,#1a3a1a,#0d1f0d)', difficulty:'Medium' },
        { id:'deploy-dash', route:'/deploy-dash', title:'Deploy Dash',  emoji:'🚀', desc:'Jump over merge conflicts to reach deploy!',       tag:'Dev',  tagColor:'#4CAF50', bg:'linear-gradient(135deg,#1a1a3a,#0d0d25)', difficulty:'Hard'   },
      ]
    },
    {
      id: 'qa', label: 'QA Testers', emoji: '🧪', color: '#2196F3',
      games: [
        { id:'test-runner', route:'/test-runner', title:'Test Runner', emoji:'✅', desc:'Catch passing tests, dodge the failing ones!', tag:'QA', tagColor:'#2196F3', bg:'linear-gradient(135deg,#0d1f3a,#0a1525)', difficulty:'Medium' },
      ]
    },
    {
      id: 'design', label: 'Designers', emoji: '🎨', color: '#E91E63',
      games: [
        { id:'color-match', route:'/color-match', title:'Color Match', emoji:'🎨', desc:'Match hex codes to swatches — every designer\'s workout!', tag:'Design', tagColor:'#E91E63', bg:'linear-gradient(135deg,#3a0d2a,#250518)', difficulty:'Easy' },
      ]
    },
    {
      id: 'manager', label: 'Managers', emoji: '📊', color: '#FF9800',
      games: [
        { id:'sprint-planner', route:'/sprint-planner', title:'Sprint Planner', emoji:'📋', desc:'Assign tasks to the right team before deadline!',   tag:'Manager', tagColor:'#FF9800', bg:'linear-gradient(135deg,#3a2a0d,#251a05)', difficulty:'Medium' },
        { id:'meeting-dodge',  route:'/meeting-dodge',  title:'Meeting Dodge',  emoji:'📅', desc:'Dodge pointless meetings to stay productive!',       tag:'Manager', tagColor:'#FF9800', bg:'linear-gradient(135deg,#3a1a0d,#251005)', difficulty:'Hard'   },
      ]
    },
  ];

  scores: Record<string, number> = {};

  constructor(private router: Router, private scoreService: HubScoreService) {}

  ngOnInit(): void {
    const all = this.scoreService.getAll();
    for (const cat of this.categories)
      for (const g of cat.games)
        this.scores[g.id] = all[g.id]?.best ?? 0;
  }

  play(route: string): void { this.router.navigate([route]); }

  totalGames(): number { return this.categories.reduce((s, c) => s + c.games.length, 0); }

  difficultyColor(d: string): string {
    return d === 'Easy' ? '#4CAF50' : d === 'Medium' ? '#FF9800' : '#f44336';
  }
}

import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./hub/hub.component').then(m => m.HubComponent) },
  { path: 'flappy-bird',         loadComponent: () => import('./games/flappy-bird/flappy-bird.component').then(m => m.FlappyBirdComponent) },
  { path: 'bug-tower-defense',  loadComponent: () => import('./games/bug-tower-defense/bug-tower-defense.component').then(m => m.BugTowerDefenseComponent) },
  { path: 'bug-squash',         loadComponent: () => import('./games/bug-squash/bug-squash.component').then(m => m.BugSquashComponent) },
  { path: 'test-runner',    loadComponent: () => import('./games/test-runner/test-runner.component').then(m => m.TestRunnerComponent) },
  { path: 'deploy-dash',    loadComponent: () => import('./games/deploy-dash/deploy-dash.component').then(m => m.DeployDashComponent) },
  { path: 'sprint-planner', loadComponent: () => import('./games/sprint-planner/sprint-planner.component').then(m => m.SprintPlannerComponent) },
  { path: 'color-match',    loadComponent: () => import('./games/color-match/color-match.component').then(m => m.ColorMatchComponent) },
  { path: 'meeting-dodge',  loadComponent: () => import('./games/meeting-dodge/meeting-dodge.component').then(m => m.MeetingDodgeComponent) },
  { path: 'css-duel',         loadComponent: () => import('./games/css-duel/css-duel.component').then(m => m.CssDuelComponent) },
  { path: 'bug-bash',         loadComponent: () => import('./games/bug-bash/bug-bash.component').then(m => m.BugBashComponent) },
  { path: 'cant-unsee',       loadComponent: () => import('./games/cant-unsee/cant-unsee.component').then(m => m.CantUnseeComponent) },
  { path: 'sprint-optimizer', loadComponent: () => import('./games/sprint-optimizer/sprint-optimizer.component').then(m => m.SprintOptimizerComponent) },
  { path: '**', redirectTo: '' }
];

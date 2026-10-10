import { Routes } from '@angular/router';
import { authGuard, eventRoleGuard, guestOnlyGuard, ownerGuard } from './core/auth/guards';
import { teamChosenGuard } from './core/player/player.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [teamChosenGuard],
    loadComponent: () => import('./features/public/home-page').then((m) => m.HomePage),
  },
  {
    path: 'home',
    canActivate: [teamChosenGuard],
    loadComponent: () => import('./features/public/home-page').then((m) => m.HomePage),
  },
  {
    path: 'choose-team',
    loadComponent: () => import('./features/public/choose-team-page').then((m) => m.ChooseTeamPage),
  },
  {
    path: 'schedule',
    canActivate: [teamChosenGuard],
    loadComponent: () => import('./features/public/schedule-page').then((m) => m.SchedulePage),
  },
  {
    path: 'teams/:code',
    loadComponent: () => import('./features/public/team-detail-page').then((m) => m.TeamDetailPage),
  },
  {
    path: 'games/:code',
    loadComponent: () => import('./features/public/game-detail-page').then((m) => m.GameDetailPage),
  },
  {
    path: 'about',
    loadComponent: () => import('./features/public/about-page').then((m) => m.AboutPage),
  },
  {
    path: 'login',
    canActivate: [guestOnlyGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'owner',
    canActivate: [authGuard, ownerGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'members' },
      ...['members', 'events'].map((path) => ({
        path,
        loadComponent: () => import('./features/owner/owner-page').then((m) => m.OwnerPage),
      })),
    ],
  },
  {
    path: 'manage/:eventId',
    canActivate: [authGuard, eventRoleGuard],
    data: { roles: ['EVENT_ADMIN'] },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'setup' },
      {
        path: 'setup',
        loadComponent: () => import('./features/manage/setup-page').then((m) => m.EventSetupPage),
      },
      {
        path: 'import',
        loadComponent: () => import('./features/manage/import-page').then((m) => m.EventImportPage),
      },
    ],
  },
  { path: '**', redirectTo: 'home' },
];

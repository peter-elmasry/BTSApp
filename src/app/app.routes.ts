import { Routes } from '@angular/router';
import { authGuard, eventRoleGuard, guestOnlyGuard, ownerGuard } from './core/auth/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  ...['home', 'schedule', 'about'].map((path) => ({
    path,
    loadComponent: () => import('./layout/foundation-page').then((m) => m.FoundationPage),
  })),
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
    ],
  },
  { path: '**', redirectTo: 'home' },
];

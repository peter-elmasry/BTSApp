import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  ...['home', 'schedule', 'about'].map((path) => ({
    path,
    loadComponent: () => import('./layout/foundation-page').then((m) => m.FoundationPage),
  })),
  { path: '**', redirectTo: 'home' },
];

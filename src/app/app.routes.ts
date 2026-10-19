import { Routes } from '@angular/router';
import {
  authGuard,
  eventRoleGuard,
  guestOnlyGuard,
  ownerGuard,
  scoringGuard,
} from './core/auth/guards';
import { landingGuard } from './core/auth/landing';
import { memberOnlyGuard, scheduleGuard, teamPageGuard } from './core/player/viewer-scope';
import {
  chooseTeamGuard,
  leaderboardVisibleGuard,
  teamChosenGuard,
} from './core/player/player.guards';

export const routes: Routes = [
  {
    path: 'account/history',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/history-page').then((m) => m.HistoryPage),
  },
  {
    path: 'appointments',
    canActivate: [authGuard],
    data: { appointmentMode: 'list' },
    loadComponent: () =>
      import('./features/appointments/appointments-page').then((m) => m.AppointmentsPage),
  },
  {
    path: 'appointments/my-bookings',
    canActivate: [authGuard],
    data: { appointmentMode: 'mine' },
    loadComponent: () =>
      import('./features/appointments/appointments-page').then((m) => m.AppointmentsPage),
  },
  {
    path: 'appointments/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/appointments/appointment-session-page').then(
        (m) => m.AppointmentSessionPage,
      ),
  },
  {
    path: 'interviews',
    canActivate: [authGuard],
    data: { appointmentMode: 'interviews' },
    loadComponent: () =>
      import('./features/appointments/appointments-page').then((m) => m.AppointmentsPage),
  },
  {
    path: 'owner/appointments',
    canActivate: [authGuard, ownerGuard],
    data: { appointmentMode: 'manage' },
    loadComponent: () =>
      import('./features/appointments/appointments-page').then((m) => m.AppointmentsPage),
  },
  {
    path: 'owner/appointments/:id',
    canActivate: [authGuard, ownerGuard],
    data: { appointmentMode: 'manage' },
    loadComponent: () =>
      import('./features/appointments/appointment-session-page').then(
        (m) => m.AppointmentSessionPage,
      ),
  },
  {
    path: 'join/:eventId',
    loadComponent: () => import('./features/registration/join-page').then((m) => m.JoinPage),
  },
  {
    path: 'players/:eventId',
    canActivate: [authGuard, eventRoleGuard],
    data: { roles: ['GUIDE', 'EVENT_ADMIN'] },
    loadComponent: () => import('./features/registration/players-page').then((m) => m.PlayersPage),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [landingGuard, teamChosenGuard],
    loadComponent: () => import('./features/public/home-page').then((m) => m.HomePage),
  },
  {
    path: 'home',
    data: { allowUnselected: true },
    canActivate: [teamChosenGuard],
    loadComponent: () => import('./features/public/home-page').then((m) => m.HomePage),
  },
  {
    path: 'choose-team',
    canActivate: [chooseTeamGuard],
    loadComponent: () => import('./features/public/choose-team-page').then((m) => m.ChooseTeamPage),
  },
  {
    path: 'schedule',
    canActivate: [scheduleGuard],
    loadComponent: () => import('./features/public/schedule-page').then((m) => m.SchedulePage),
  },
  {
    path: 'teams/:code',
    canActivate: [teamPageGuard],
    loadComponent: () => import('./features/public/team-detail-page').then((m) => m.TeamDetailPage),
  },
  {
    path: 'games/:code',
    canActivate: [memberOnlyGuard],
    loadComponent: () => import('./features/public/game-detail-page').then((m) => m.GameDetailPage),
  },
  {
    path: 'leaderboard',
    canActivate: [leaderboardVisibleGuard],
    loadComponent: () =>
      import('./features/standings/leaderboard-page').then((m) => m.LeaderboardPage),
  },
  {
    path: 'display',
    // The venue shell also hosts public attachments/audio while standings remain hidden.
    loadComponent: () => import('./features/standings/display-page').then((m) => m.DisplayPage),
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
    path: 'account/profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: 'account/password',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/change-password-page').then((m) => m.ChangePasswordPage),
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
    path: 'ref',
    canActivate: [authGuard, scoringGuard],
    loadComponent: () => import('./features/referee/board-page').then((m) => m.RefereeBoardPage),
  },
  {
    path: 'ref/match/:id',
    canActivate: [authGuard, scoringGuard],
    loadComponent: () =>
      import('./features/referee/match-entry-page').then((m) => m.MatchEntryPage),
  },
  {
    path: 'manage/:eventId',
    canActivate: [authGuard, eventRoleGuard],
    data: { roles: ['EVENT_ADMIN'] },
    loadComponent: () => import('./features/manage/manage-layout').then((m) => m.ManageLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'live' },
      {
        path: 'recap',
        loadComponent: () => import('./features/manage/recap-page').then((m) => m.RecapPage),
      },
      {
        path: 'results',
        loadComponent: () => import('./features/manage/results-page').then((m) => m.ResultsPage),
      },
      {
        path: 'adjustments',
        loadComponent: () =>
          import('./features/manage/adjustments-page').then((m) => m.AdjustmentsPage),
      },
      {
        path: 'audit',
        loadComponent: () => import('./features/manage/audit-page').then((m) => m.AuditPage),
      },
      {
        path: 'live',
        loadComponent: () => import('./features/manage/live-page').then((m) => m.LiveControlPage),
      },
      {
        path: 'standings',
        loadComponent: () =>
          import('./features/standings/manage-standings-page').then((m) => m.ManageStandingsPage),
      },
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

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../core/i18n/i18n.service';
import { DsToast } from '../shared/ui/toast';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoDirective, DsToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div *transloco="let t" class="min-h-dvh pb-24">
    <a href="#main" class="skip-link">{{ t('common.skip') }}</a>
    <header class="bg-navy text-white">
      <div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <a
          routerLink="/home"
          class="flex min-h-11 min-w-11 items-center"
          [attr.aria-label]="t('nav.home')"
          ><img
            src="/brand/dst-mark-white.webp"
            alt="DST"
            width="75"
            height="32"
            class="h-8 w-auto"
        /></a>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-extrabold">{{ t('app.title') }}</p>
          <p class="text-xs text-gold">ONE TEAM. ONE SPIRIT.</p>
        </div>
        <button
          class="min-h-11 min-w-11 rounded-xl border border-white/30 px-3 font-bold"
          (click)="direction.toggle()"
          [attr.aria-label]="t('common.switchLanguage')"
        >
          {{ direction.language() === 'ar' ? 'EN' : 'ع' }}
        </button>
      </div>
    </header>
    <main id="main" tabindex="-1" class="mx-auto max-w-3xl px-4 py-6"><router-outlet /></main>
    <nav
      [attr.aria-label]="t('common.navigation')"
      class="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-mist bg-white"
    >
      <div class="mx-auto grid max-w-3xl grid-cols-3 gap-1 px-2 py-2">
        @for (item of navigation; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="nav-active"
            ariaCurrentWhenActive="page"
            class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold"
            ><span aria-hidden="true" class="text-xl">{{ item.icon }}</span
            >{{ t(item.key) }}</a
          >
        }
      </div>
    </nav>
    <ds-toast />
  </div>`,
})
export class AppShell {
  readonly direction = inject(DirectionService);
  readonly navigation = [
    { path: '/home', key: 'nav.home', icon: '⌂' },
    { path: '/schedule', key: 'nav.schedule', icon: '▦' },
    { path: '/about', key: 'nav.about', icon: '◉' },
  ];
}

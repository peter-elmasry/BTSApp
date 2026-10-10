import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../core/i18n/i18n.service';
import { DsToast } from '../shared/ui/toast';
import { AuthStore } from '../core/auth/auth.store';
import { Router } from '@angular/router';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoDirective, DsToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.html',
})
export class AppShell {
  readonly direction = inject(DirectionService);
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  constructor() {
    void this.auth.initialize();
  }
  async logout() {
    await this.auth.logout();
    await this.router.navigateByUrl('/home');
  }
  readonly navigation = [
    { path: '/home', key: 'nav.home', icon: '⌂' },
    { path: '/schedule', key: 'nav.schedule', icon: '▦' },
    { path: '/about', key: 'nav.about', icon: '◉' },
  ];
}

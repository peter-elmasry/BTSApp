import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthStore } from './auth.store';

// Route guards authorize entry. This boundary also owns the lifetime of an open
// staff screen, including local forms and responses that finish after logout.
@Component({
  selector: 'app-session-outlet',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './session-outlet.html',
})
export class SessionOutlet {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
  );
  private readonly area = computed(() => this.url()?.split(/[/?#]/)[1]);
  private readonly staff = computed(() =>
    ['owner', 'manage', 'ref', 'players', 'account'].includes(this.area() ?? ''),
  );
  readonly allowed = computed(() => {
    if (!this.staff()) return true;
    const profile = this.auth.profile();
    if (!this.auth.session() || !profile) return false;
    if (this.area() === 'account') return true;
    if (profile.system_role === 'OWNER') return true;
    if (this.area() === 'owner') return false;
    if (this.area() === 'manage' || this.area() === 'players') {
      const eventId = this.url()?.split(/[/?#]/)[2];
      return profile.roles.some(
        (role) =>
          role.event_id === eventId &&
          (role.role === 'EVENT_ADMIN' || (this.area() === 'players' && role.role === 'GUIDE')),
      );
    }
    return profile.roles.some((role) => ['EVENT_ADMIN', 'REFEREE'].includes(role.role));
  });
  readonly contextKey = computed(() => {
    if (!this.staff()) return 'public';
    const profile = this.auth.profile();
    return JSON.stringify([
      this.auth.session()?.user.id,
      profile?.id,
      profile?.system_role,
      profile?.roles,
      profile?.assigned_games,
    ]);
  });

  readonly contexts = computed(() => [{ key: this.contextKey() }]);

  constructor() {
    effect(() => {
      if (this.auth.ready() && !this.allowed()) void this.router.navigateByUrl('/home');
    });
  }
}

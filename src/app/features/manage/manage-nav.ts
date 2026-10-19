import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

/** One section bar for every event-administration screen (D040, amended by D045). */
export const MANAGE_SECTIONS = [
  { path: 'recap', key: 'eventReport.recap' },
  { path: 'live', key: 'manage.nav.control' },
  { path: 'results', key: 'manage.nav.results' },
  { path: 'adjustments', key: 'manage.nav.adjustments' },
  { path: 'standings', key: 'manage.nav.standings' },
  { path: 'setup', key: 'manage.nav.setup' },
  { path: 'audit', key: 'manage.nav.audit' },
] as const;

@Component({
  selector: 'app-manage-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './manage-nav.html',
})
export class ManageNav {
  readonly eventId = input.required<string>();
  readonly eventLabel = input('');
  readonly sections = MANAGE_SECTIONS;
}

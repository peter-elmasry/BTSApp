import { ChangeDetectionStrategy, Component } from '@angular/core';
@Component({
  selector: 'ds-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { class: 'block rounded-card bg-white p-5 shadow-card' },
})
export class DsCard {}

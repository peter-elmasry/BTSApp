import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { InstallService } from '../../core/pwa/install.service';

@Component({
  selector: 'app-install-card',
  imports: [TranslocoDirective],
  templateUrl: './install-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallCard {
  readonly pwa = inject(InstallService);
}

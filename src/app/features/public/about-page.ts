import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { InstallCard } from '../../shared/ui/install-card';

interface AboutContent {
  title: string;
  paragraphs: { text: string; highlight?: string; after?: string }[];
  mottos: string[];
}
@Component({
  selector: 'app-about-page',
  imports: [TranslocoDirective, InstallCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about-page.html',
})
export class AboutPage {
  readonly content = toSignal(
    inject(TranslocoService).selectTranslateObject<AboutContent>('player.about'),
  );
}

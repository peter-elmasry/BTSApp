import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

interface AboutContent {
  title: string;
  paragraphs: { text: string; highlight?: string; after?: string }[];
  mottos: string[];
}
@Component({
  selector: 'app-about-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about-page.html',
})
export class AboutPage {
  readonly content = toSignal(
    inject(TranslocoService).selectTranslateObject<AboutContent>('player.about'),
  );
}

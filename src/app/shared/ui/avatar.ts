import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { teamImageUrl } from './team-image';
@Component({
  selector: 'ds-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar.html',
})
export class DsAvatar {
  readonly avatarKey = input('falcon');
  readonly imagePath = input<string | null | undefined>(null);
  private readonly failedImage = signal('');
  readonly photo = computed(() => {
    const url = teamImageUrl(this.imagePath());
    return url && url !== this.failedImage() ? url : '';
  });
  imageFailed(event: Event) {
    const source = (event.target as HTMLImageElement).getAttribute('src') || '';
    if (source === this.photo()) this.failedImage.set(source);
  }
  readonly color = input('#087F8C');
  readonly label = input('');
  readonly size = input(56);
}

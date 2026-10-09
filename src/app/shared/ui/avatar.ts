import { ChangeDetectionStrategy, Component, input } from '@angular/core';
@Component({
  selector: 'ds-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="inline-flex items-center justify-center rounded-full border-4 bg-white"
    [style.border-color]="color()"
    [style.width.px]="size()"
    [style.height.px]="size()"
    ><img
      [src]="'/avatars/' + avatarKey() + '.svg'"
      [alt]="label()"
      class="h-3/4 w-3/4"
      width="48"
      height="48"
  /></span>`,
})
export class DsAvatar {
  readonly avatarKey = input('falcon');
  readonly color = input('#087F8C');
  readonly label = input('');
  readonly size = input(56);
}

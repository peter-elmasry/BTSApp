import { ChangeDetectionStrategy, Component, input } from '@angular/core';
@Component({
  selector: 'ds-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar.html',
})
export class DsAvatar {
  readonly avatarKey = input('falcon');
  readonly color = input('#087F8C');
  readonly label = input('');
  readonly size = input(56);
}

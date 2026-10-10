import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import type { PublicTeam } from '../../core/player/public-types';
import { DsAvatar } from '../../shared/ui/avatar';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { localizedName } from './public-helpers';
import { PublicState } from './public-state';

@Component({
  selector: 'app-choose-team-page',
  imports: [ReactiveFormsModule, TranslocoDirective, DsAvatar, DsBottomSheet, PublicState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './choose-team-page.html',
  styleUrl: './choose-team-page.css',
})
export class ChooseTeamPage {
  readonly store = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly direction = inject(DirectionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly search = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(this.search.valueChanges, { initialValue: '' });
  readonly pendingCode = signal<string | null>(null);
  readonly notice = signal('');
  readonly pending = computed(
    () => this.store.teams().find((team) => team.code === this.pendingCode()) ?? null,
  );
  readonly filteredTeams = computed(() => {
    const search = this.searchText().trim().toLocaleLowerCase();
    return this.store
      .teams()
      .filter(
        (team) =>
          !search ||
          [team.code, team.name_en, team.name_ar, team.guide?.name_en, team.guide?.name_ar].some(
            (value) => value?.toLocaleLowerCase().includes(search),
          ),
      );
  });
  readonly name = localizedName;
  private processedLink = '';

  constructor() {
    void this.store.initialize();
    effect(() => {
      const code = this.query().get('team')?.trim().toUpperCase();
      const event = this.store.event();
      if (!event || this.store.loading() || !code) return;
      const link = `${event.id}:${code}`;
      if (link === this.processedLink) return;
      this.processedLink = link;
      const team = this.store.teams().find((team) => team.code === code);
      if (team) this.pendingCode.set(team.code);
      else this.notice.set('player.invalidTeamLink');
    });
  }

  preview(team: PublicTeam) {
    this.notice.set('');
    this.pendingCode.set(team.code);
  }

  async confirm() {
    const team = this.pending();
    if (!team || !this.selection.choose(team.code)) {
      this.pendingCode.set(null);
      this.notice.set('player.invalidTeamLink');
      return;
    }
    this.pendingCode.set(null);
    await this.router.navigate(['/home']);
  }
}

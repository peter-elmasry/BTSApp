import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { EventStore } from '../../core/player/event.store';

export interface DirectoryContact {
  member_id: string;
  name_en: string;
  name_ar: string | null;
  phone: string | null;
}
interface StaffDirectory {
  team_guides: (DirectoryContact & { team_id: string })[];
  game_referees: (DirectoryContact & { game_id: string })[];
}

/**
 * Quick look (D055): tapping any team or game name opens one sheet with what people
 * need to know about it. Signed-in members also get Guides' and Referees' phones.
 */
@Injectable({ providedIn: 'root' })
export class QuickLook {
  private readonly cache = inject(ReadCacheService);
  private readonly auth = inject(AuthStore);
  private readonly events = inject(EventStore);
  readonly target = signal<{ kind: 'team' | 'game'; id: string } | null>(null);
  private readonly directory = signal<StaffDirectory | null>(null);
  readonly member = computed(() => !!this.auth.session());

  constructor() {
    effect(() => {
      const event = this.events.event()?.id;
      const member = this.member();
      const target = this.target();
      untracked(() => {
        if (!target || !event || !member) {
          if (!member) this.directory.set(null);
          return;
        }
        void this.cache
          .read<StaffDirectory>('get_staff_directory', { p_event: event })
          .then((value) =>
            this.directory.set(value && Array.isArray(value.team_guides) ? value : null),
          )
          .catch(() => this.directory.set(null));
      });
    });
  }

  team(code: string) {
    this.target.set({ kind: 'team', id: code });
  }
  game(id: string) {
    this.target.set({ kind: 'game', id });
  }
  close() {
    this.target.set(null);
  }
  guidesOf(teamId: string): DirectoryContact[] | null {
    const directory = this.directory();
    return directory ? directory.team_guides.filter((guide) => guide.team_id === teamId) : null;
  }
  refereesOf(gameId: string): DirectoryContact[] | null {
    const directory = this.directory();
    return directory ? directory.game_referees.filter((ref) => ref.game_id === gameId) : null;
  }
}

import { inject, Injectable } from '@angular/core';
import { supabase } from '../../core/supabase/client';
import { ImportMode, ImportPayload, ImportReport } from './import-types';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService } from '../../core/offline/read-cache.service';

@Injectable({ providedIn: 'root' })
export class EventImportService {
  private readonly queue = inject(OpQueueService);
  private readonly cache = inject(ReadCacheService);
  async loadSetup(eventId: string): Promise<Record<string, unknown>> {
    return this.cache.read<Record<string, unknown>>('get_event_setup', { p_event: eventId });
  }

  validate(eventId: string, payload: ImportPayload, mode: ImportMode): Promise<ImportReport> {
    return this.run(eventId, payload, mode, crypto.randomUUID(), true);
  }

  async apply(
    eventId: string,
    payload: ImportPayload,
    mode: ImportMode,
    opId: string,
  ): Promise<ImportReport> {
    const receipt = await this.queue.execute<ImportReport>(
      'import_event_setup',
      {
        p_event: eventId,
        p_payload: payload,
        p_mode: mode,
        p_dry_run: false,
      },
      opId,
    );
    if (receipt.status === 'sent') return receipt.data!;
    return {
      valid: true,
      applied: false,
      queued: true,
      errors: [],
      counts: {
        teams: payload.teams.length,
        games: payload.games.length,
        rounds: payload.rounds.length,
        matches: payload.matches.length,
        staff: payload.staff.length,
      },
    };
  }

  private async run(
    eventId: string,
    payload: ImportPayload,
    mode: ImportMode,
    opId: string,
    dryRun: boolean,
  ): Promise<ImportReport> {
    const { data, error } = await supabase.rpc('import_event_setup', {
      p_op_id: opId,
      p_event: eventId,
      p_payload: payload,
      p_mode: mode,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    return data as ImportReport;
  }
}

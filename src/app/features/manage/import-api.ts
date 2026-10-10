import { Injectable } from '@angular/core';
import { supabase } from '../../core/supabase/client';
import { ImportMode, ImportPayload, ImportReport } from './import-types';

@Injectable({ providedIn: 'root' })
export class EventImportService {
  async loadSetup(eventId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('get_event_setup', { p_event: eventId });
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  validate(eventId: string, payload: ImportPayload, mode: ImportMode): Promise<ImportReport> {
    return this.run(eventId, payload, mode, crypto.randomUUID(), true);
  }

  apply(
    eventId: string,
    payload: ImportPayload,
    mode: ImportMode,
    opId: string,
  ): Promise<ImportReport> {
    return this.run(eventId, payload, mode, opId, false);
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

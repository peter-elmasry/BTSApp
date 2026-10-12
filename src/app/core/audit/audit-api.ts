import { inject, Injectable } from '@angular/core';
import { RpcTransport } from '../offline/rpc-transport';

export type AuditJson =
  null | boolean | number | string | AuditJson[] | { [key: string]: AuditJson };
export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  actor: { name_en: string; name_ar: string | null } | null;
  before: AuditJson;
  after: AuditJson;
}
export interface AuditPage {
  items: AuditEntry[];
  next_before: string | null;
  actions: string[];
  entities: string[];
}

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly transport = inject(RpcTransport);
  read(event: string, before: string | null, action: string, entity: string): Promise<AuditPage> {
    return this.transport.rpc('get_audit_log', {
      p_event: event,
      p_limit: 50,
      p_before: before,
      p_action: action || null,
      p_entity: entity || null,
    });
  }
}

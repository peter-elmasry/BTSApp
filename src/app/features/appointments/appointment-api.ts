import { effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { RpcTransport } from '../../core/offline/rpc-transport';
import { actorIdentity, isNetworkFailure } from '../../core/offline/rpc-errors';
import { environment } from '../../../environments/environment';
import type {
  AppointmentAction,
  AppointmentDetail,
  AppointmentEntry,
  AppointmentOptions,
  AppointmentResult,
  AppointmentSession,
} from './appointment-types';

interface PendingAppointment {
  actor: string;
  opId: string;
  action: AppointmentAction;
  payload: Record<string, unknown>;
}

/** Private online calls. Never use IndexedDB, public broadcasts or the scoring queue. */
@Injectable({ providedIn: 'root' })
export class AppointmentApi {
  private readonly auth = inject(AuthStore);
  private readonly transport = inject(RpcTransport);
  readonly pending = signal<PendingAppointment | null>(null);
  readonly checking = signal(false);
  private actor() {
    return actorIdentity(
      this.auth.session()?.user.id,
      this.auth.profile()?.id,
      environment.supabaseUrl,
    );
  }
  constructor() {
    effect(() => {
      if (this.pending() && this.pending()?.actor !== this.actor()) this.pending.set(null);
    });
  }
  list() {
    return this.read<AppointmentSession[]>('list_appointment_sessions', {});
  }
  detail(id: string) {
    return this.read<AppointmentDetail>('get_appointment_session', { p_session: id });
  }
  mine(interviewer = false) {
    return this.read<AppointmentEntry[]>('get_my_appointments', { p_interviewer: interviewer });
  }
  options() {
    return this.read<AppointmentOptions>('get_appointment_options', {});
  }
  private async read<T>(rpc: string, args: Record<string, unknown>): Promise<T> {
    const actor = this.actor();
    if (!actor) throw new Error('FORBIDDEN');
    const result = await this.transport.rpc<T>(rpc, args);
    if (actor !== this.actor()) throw new Error('ACTOR_CHANGED');
    return result;
  }
  async write(
    action: AppointmentAction,
    payload: Record<string, unknown>,
  ): Promise<AppointmentResult> {
    if (this.pending()) throw new Error('BOOKING_PENDING');
    const actor = this.actor();
    if (!actor) throw new Error('FORBIDDEN');
    if (!navigator.onLine) throw new Error('OFFLINE');
    this.pending.set({
      actor,
      opId: crypto.randomUUID(),
      action,
      payload: structuredClone(payload),
    });
    return this.retry();
  }
  async retry(): Promise<AppointmentResult> {
    const pending = this.pending();
    if (!pending || this.checking()) throw new Error('BOOKING_PENDING');
    if (pending.actor !== this.actor()) {
      this.pending.set(null);
      throw new Error('ACTOR_CHANGED');
    }
    this.checking.set(true);
    try {
      // A lost response can already have committed. Reconcile before replaying.
      const receipt = await this.read<AppointmentResult | null>('get_appointment_operation', {
        p_op_id: pending.opId,
      });
      const result =
        receipt ??
        (await this.transport.mutate<AppointmentResult>(
          'appointment_write',
          {
            p_op_id: pending.opId,
            p_action: pending.action,
            p_payload: pending.payload,
          },
          pending.actor,
        ));
      if (pending.actor !== this.actor()) throw new Error('ACTOR_CHANGED');
      this.pending.set(null);
      return result;
    } catch (error) {
      if (!isNetworkFailure(error)) this.pending.set(null);
      throw error;
    } finally {
      this.checking.set(false);
    }
  }
}

export function appointmentError(error: unknown): string {
  if (isNetworkFailure(error)) return 'OFFLINE';
  const message = (error as { message?: string })?.message ?? '';
  return new Set([
    'FORBIDDEN',
    'ACTOR_CHANGED',
    'OFFLINE',
    'INVALID_APPOINTMENT',
    'INVALID_LOCAL_TIME',
    'INTERVIEWER_UNAVAILABLE',
    'APPOINTMENT_OVERLAP',
    'APPOINTMENT_CHANGED',
    'APPOINTMENT_UNAVAILABLE',
    'BOOKED_SLOT_LOCKED',
    'SLOTS_REQUIRED',
    'SLOT_TAKEN',
    'ALREADY_BOOKED',
    'CUTOFF_PASSED',
    'INVALID_NAME',
    'INVALID_ATTENDANCE',
    'BOOKING_PENDING',
  ]).has(message)
    ? message
    : 'SAVE_FAILED';
}

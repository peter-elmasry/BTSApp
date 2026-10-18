export interface AppointmentSession {
  id: string;
  title: string;
  description: string;
  location: string;
  meeting_url: string;
  timezone: string;
  event_id: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
  opens_at: string;
  closes_at: string;
  cutoff_minutes: number;
  version: number;
  available?: number;
  interviewer?: boolean;
}
export interface AppointmentBooking {
  id: string;
  member_id: string;
  display_name: string;
  status: 'BOOKED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  version: number;
}
export interface AppointmentSlot {
  id: string;
  session_id: string;
  interviewer_id: string;
  interviewer_name: string;
  starts_at: string;
  ends_at: string;
  blocked: boolean;
  available: boolean;
  version: number;
  booking: AppointmentBooking | null;
}
export interface AppointmentDetail {
  session: AppointmentSession;
  slots: AppointmentSlot[];
  history?: (AppointmentBooking & { starts_at: string; ends_at: string })[];
}
export interface AppointmentEntry extends AppointmentBooking {
  session_id: string;
  slot_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  meeting_url: string;
  interviewer_name: string;
  cutoff_minutes: number;
  session_status: AppointmentSession['status'];
}
export interface AppointmentOptions {
  members: { id: string; name: string }[];
  events: { id: string; name: string }[];
}
export interface AppointmentResult {
  id: string;
  version?: number;
  count?: number;
  status?: string;
  slot_id?: string;
}
export type AppointmentAction =
  'SAVE_SESSION' | 'GENERATE_SLOTS' | 'SAVE_SLOT' | 'BOOK' | 'CANCEL' | 'RESCHEDULE' | 'ATTEND';

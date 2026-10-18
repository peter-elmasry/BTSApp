import { describe, expect, it } from 'vitest';
import { appointmentInstant, appointmentLocal, previewAppointmentSlots } from './appointment-model';

describe('appointment wall times and generation', () => {
  it('uses Cairo daylight saving time independently of the device timezone', () => {
    expect(appointmentInstant('2026-10-20T18:00', 'Africa/Cairo')).toBe('2026-10-20T15:00:00.000Z');
    expect(appointmentInstant('2026-12-20T18:00', 'Africa/Cairo')).toBe('2026-12-20T16:00:00.000Z');
    expect(appointmentLocal('2026-10-20T15:00:00Z', 'Africa/Cairo')).toBe('2026-10-20T18:00');
  });
  it('rejects skipped and repeated Cairo wall times', () => {
    expect(() => appointmentInstant('2026-04-24T00:30', 'Africa/Cairo')).toThrow(
      'INVALID_LOCAL_TIME',
    );
    expect(() => appointmentInstant('2026-10-29T23:30', 'Africa/Cairo')).toThrow(
      'INVALID_LOCAL_TIME',
    );
  });
  it('rejects missing and malformed local input', () => {
    expect(() => appointmentInstant('', 'Africa/Cairo')).toThrow();
    expect(() => appointmentInstant('2026-02-30T10:00', 'Africa/Cairo')).toThrow();
    expect(() => appointmentInstant('2026-10-20T18:00', 'Invalid/Zone')).toThrow();
  });
  it('leaves explicit breaks and excludes a partial last appointment', () => {
    expect(previewAppointmentSlots('2026-10-20T15:00Z', '2026-10-20T16:00Z', 20, 10)).toEqual([
      { starts_at: '2026-10-20T15:00:00.000Z', ends_at: '2026-10-20T15:20:00.000Z' },
      { starts_at: '2026-10-20T15:30:00.000Z', ends_at: '2026-10-20T15:50:00.000Z' },
    ]);
  });
  it('bounds large generation and rejects fractional or empty ranges', () => {
    for (const [start, end, duration, gap] of [
      ['2026-10-20T00:00Z', '2026-10-27T00:00Z', 5, 0],
      ['2026-10-20T00:00Z', '2026-10-20T00:10Z', 20, 0],
      ['2026-10-20T00:00Z', '2026-10-20T01:00Z', 20.5, 0],
      ['2026-10-20T00:00Z', '2026-10-20T01:00Z', 20, -1],
    ] as const)
      expect(() => previewAppointmentSlots(start, end, duration, gap)).toThrow(
        'INVALID_APPOINTMENT',
      );
  });
});

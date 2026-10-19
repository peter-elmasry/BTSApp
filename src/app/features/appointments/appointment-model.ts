/** Interpret a datetime-local value in the session timezone, not the device zone.
 * Reject missing/ambiguous DST wall times instead of silently moving a slot. */
export function appointmentInstant(local: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('INVALID_APPOINTMENT');
  const wall = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wall)) throw new Error('INVALID_APPOINTMENT');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const render = (stamp: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(stamp).map((p) => [p.type, p.value]));
    return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
  };
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = wall + hours * 3600000;
    offsets.add(Date.parse(`${render(probe)}:00Z`) - probe);
  }
  const candidates = [...offsets]
    .map((offset) => wall - offset)
    .filter((stamp) => render(stamp) === local);
  if (candidates.length !== 1) throw new Error('INVALID_LOCAL_TIME');
  return new Date(candidates[0]).toISOString();
}

export function appointmentLocal(instant: string, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
}

export function previewAppointmentSlots(start: string, end: string, duration: number, gap: number) {
  const from = Date.parse(start);
  const until = Date.parse(end);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(until) ||
    until <= from ||
    until - from > 7 * 86400000 ||
    !Number.isInteger(duration) ||
    duration < 5 ||
    duration > 240 ||
    !Number.isInteger(gap) ||
    gap < 0 ||
    gap > 120
  )
    throw new Error('INVALID_APPOINTMENT');
  const slots: { starts_at: string; ends_at: string }[] = [];
  for (let stamp = from; stamp + duration * 60000 <= until; stamp += (duration + gap) * 60000) {
    slots.push({
      starts_at: new Date(stamp).toISOString(),
      ends_at: new Date(stamp + duration * 60000).toISOString(),
    });
    if (slots.length > 200) throw new Error('INVALID_APPOINTMENT');
  }
  if (!slots.length) throw new Error('INVALID_APPOINTMENT');
  return slots;
}

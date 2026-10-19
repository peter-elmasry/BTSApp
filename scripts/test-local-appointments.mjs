import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/** Real concurrent transactions on disposable local Supabase fixtures only. */
export async function verifyLocalAppointments(url, anonKey, admin, owner) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error('Appointment acceptance is restricted to localhost');
  const checked = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const members = [];
  const users = [];
  const clients = [];
  const sessions = [];
  const write = async (client, action, payload, op = randomUUID()) =>
    client.rpc('appointment_write', { p_op_id: op, p_action: action, p_payload: payload });
  const start = new Date(Date.now() + 86400000);
  const end = new Date(+start + 20 * 60000);
  try {
    for (let index = 0; index < 4; index++) {
      const id = randomUUID();
      const password = randomBytes(24).toString('base64url');
      const email = `appointment-${id}@members.dst-bts.app`;
      const user = checked(
        await admin.auth.admin.createUser({ email, password, email_confirm: true }),
      ).user;
      users.push(user.id);
      checked(
        await admin.from('members').insert({
          id,
          auth_user_id: user.id,
          username: `appt_${id.replaceAll('-', '').slice(0, 20)}`,
          full_name_en: `Appointment test ${index}`,
          system_role: 'MEMBER',
          must_change_password: false,
        }),
      );
      members.push(id);
      const client = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      checked(await client.auth.signInWithPassword({ email, password }));
      clients.push(client);
    }
    for (let index = 0; index < 2; index++) {
      const session = checked(
        await write(owner, 'SAVE_SESSION', {
          title: `Local appointment race ${index}`,
          description: '',
          location: 'Local test',
          meeting_url: '',
          timezone: 'Africa/Cairo',
          event_id: null,
          status: 'DRAFT',
          opens_at: new Date(Date.now() - 60000).toISOString(),
          closes_at: new Date(+start - 60000).toISOString(),
          cutoff_minutes: 0,
        }),
      );
      sessions.push(session.id);
      checked(
        await write(owner, 'SAVE_SLOT', {
          session_id: session.id,
          interviewer_id: members[index + 2],
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
        }),
      );
      const detail = checked(await owner.rpc('get_appointment_session', { p_session: session.id }));
      checked(await write(owner, 'SAVE_SESSION', { ...detail.session, status: 'PUBLISHED' }));
    }
    const [first, second] = await Promise.all(
      sessions.map(async (id) =>
        checked(await owner.rpc('get_appointment_session', { p_session: id })),
      ),
    );
    const slotId = first.slots[0].id;
    const operations = [randomUUID(), randomUUID()];
    const races = await Promise.all(
      clients
        .slice(0, 2)
        .map((client, i) =>
          write(
            client,
            'BOOK',
            { slot_id: slotId, display_name: `Race attendee ${i}` },
            operations[i],
          ),
        ),
    );
    assert.equal(
      races.filter((r) => !r.error).length,
      1,
      'exactly one concurrent reservation wins',
    );
    assert.equal(races.find((r) => r.error).error.message, 'SLOT_TAKEN');
    const winnerIndex = races.findIndex((r) => !r.error);
    const winner = clients[winnerIndex];
    const result = checked(races[winnerIndex]);
    const replay = checked(
      await write(
        winner,
        'BOOK',
        { slot_id: slotId, display_name: `Race attendee ${winnerIndex}` },
        operations[winnerIndex],
      ),
    );
    assert.equal(replay.id, result.id, 'same operation returns same booking');
    const otherSlot = second.slots[0].id;
    const overlap = await write(winner, 'BOOK', {
      slot_id: otherSlot,
      display_name: 'Same attendee',
    });
    assert.equal(overlap.error?.message, 'APPOINTMENT_OVERLAP');
    const hidden = checked(
      await clients[1 - winnerIndex].rpc('get_appointment_session', { p_session: sessions[0] }),
    );
    assert.equal(hidden.slots[0].booking, null, 'other member receives no attendee');
    const board = checked(await clients[2].rpc('get_my_appointments', { p_interviewer: true }));
    assert.equal(board.length, 1, 'only assigned interviewer receives attendee');

    // Two different sessions/slots concurrently booked by the same member still
    // serialize around the cross-session overlap invariant.
    checked(await write(winner, 'CANCEL', { booking_id: result.id, version: result.version }));
    const overlapRace = await Promise.all(
      [slotId, otherSlot].map((slot_id) =>
        write(clients[0], 'BOOK', { slot_id, display_name: 'Cross-session race' }),
      ),
    );
    assert.equal(overlapRace.filter((r) => !r.error).length, 1);
    assert.equal(overlapRace.find((r) => r.error).error.message, 'APPOINTMENT_OVERLAP');
    console.log(
      'Local appointments: real concurrent slot/member races, operation replay, cross-session overlap and private interviewer reads passed.',
    );
  } finally {
    for (const client of clients) await client.auth.signOut();
    if (sessions.length) {
      checked(await admin.from('appointment_bookings').delete().in('session_id', sessions));
      checked(await admin.from('appointment_slots').delete().in('session_id', sessions));
      checked(await admin.from('appointment_sessions').delete().in('id', sessions));
    }
    if (members.length) {
      checked(await admin.from('client_ops').delete().in('actor_id', members));
      checked(await admin.from('audit_log').delete().in('actor_id', members));
      checked(await admin.from('members').delete().in('id', members));
    }
    for (const id of users) checked(await admin.auth.admin.deleteUser(id));
  }
}

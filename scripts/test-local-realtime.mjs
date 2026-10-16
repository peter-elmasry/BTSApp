import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/** Real database -> Realtime -> independent anonymous client -> RPC read.
 * Only called by the localhost-only auth acceptance runner, never hosted data. */
export async function verifyLocalRealtime(url, anonKey, admin, owner) {
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Realtime acceptance is restricted to localhost');
  const checked = (response) => {
    if (response.error) throw new Error(response.error.message);
    return response.data;
  };
  const eventId = randomUUID();
  const teamIds = [randomUUID(), randomUUID()];
  const gameId = randomUUID();
  const roundId = randomUUID();
  const matchId = randomUUID();
  const guest = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let channel;
  let replicationReady = false;
  const messages = [];
  const waitFor = async (predicate, description = 'Real database broadcast', timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`${description} did not arrive`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  try {
    checked(
      await admin.from('events').insert({
        id: eventId,
        code: `RT-${eventId.slice(0, 8)}`,
        name_en: 'Realtime acceptance',
        leaderboard_public: true,
      }),
    );
    checked(
      await admin.from('teams').insert(
        teamIds.map((id, index) => ({
          id,
          event_id: eventId,
          code: `T0${index + 1}`,
          name_en: `Team ${index + 1}`,
          avatar_key: 'falcon',
          color_hex: '#123456',
        })),
      ),
    );
    checked(
      await admin
        .from('games')
        .insert({ id: gameId, event_id: eventId, code: 'G01', name_en: 'Realtime game' }),
    );
    checked(
      await admin
        .from('rounds')
        .insert({ id: roundId, event_id: eventId, number: 1, type: 'REGULAR', duration_min: 5 }),
    );
    checked(
      await admin
        .from('matches')
        .insert({ id: matchId, event_id: eventId, round_id: roundId, game_id: gameId }),
    );
    checked(
      await admin.from('match_participants').insert(
        teamIds.map((team_id, index) => ({
          match_id: matchId,
          round_id: roundId,
          team_id,
          side: index ? 'B' : 'A',
        })),
      ),
    );
    channel = guest
      .channel(`event:${eventId}`, {
        config: { private: false, broadcast: { replication_ready: true } },
      })
      .on('broadcast', { event: '*' }, (message) => messages.push(message))
      .on('system', {}, (message) => {
        if (message.extension === 'system') replicationReady = message.status === 'ok';
      });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Anonymous channel subscription timed out')),
        10000,
      );
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
          clearTimeout(timer);
          reject(new Error('Anonymous channel failed'));
        }
      });
    });
    await waitFor(() => replicationReady, 'Database replication readiness', 20000);
    checked(await owner.rpc('start_round', { p_op_id: randomUUID(), p_round: roundId }));
    await waitFor(() => messages.some((message) => message.event === 'round_audio'));
    const beforeToken = checked(await guest.rpc('get_event_update_token', { p_event: eventId }));
    const submittedAt = performance.now();
    checked(
      await owner.rpc('submit_match_result', {
        p_op_id: randomUUID(),
        p_match: matchId,
        p_outcomes: teamIds.map((team_id, index) => ({ team_id, outcome: index ? 'LOSS' : 'WIN' })),
      }),
    );
    await waitFor(() => messages.some((message) => message.event === 'match_changed'));
    assert.ok(
      performance.now() - submittedAt < 2000,
      'Committed result broadcast should arrive within two seconds on localhost',
    );
    assert.notEqual(
      checked(await guest.rpc('get_event_update_token', { p_event: eventId })),
      beforeToken,
    );
    const standings = checked(await guest.rpc('get_standings', { p_event: eventId }));
    assert.equal(standings.find((row) => row.team.id === teamIds[0]).wins, 1);
    const audio = checked(
      await guest.rpc('get_team_audio_results', { p_event: eventId, p_team_code: 'T01' }),
    );
    assert.equal(audio.results.find((result) => result.matchId === matchId).outcome, 'WIN');
    assert.ok(audio.results.find((result) => result.matchId === matchId).occurredAt);
    const profile = checked(await owner.rpc('get_my_profile'));
    checked(
      await owner.rpc('assign_event_admin', {
        p_op_id: randomUUID(),
        p_event: eventId,
        p_member: profile.id,
      }),
    );
    await waitFor(() => messages.some((message) => message.event === 'roster_changed'));
    // This local fixture never becomes current, so the smoke cannot disturb
    // another acceptance fixture. A rolled-back SQL test covers current changes.
    for (const message of messages) {
      assert.ok(
        ['round_changed', 'round_audio', 'match_changed', 'roster_changed'].includes(message.event),
      );
      assert.ok(
        Object.keys(message.payload).every((key) =>
          ['type', 'roundId', 'matchId', 'cueId', 'cue', 'occurredAt', 'id'].includes(key),
        ),
      );
      assert.match(message.payload.id, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    }
    console.log(
      'Real local Realtime: anonymous subscriber receives committed round/audio/result signals; fresh standings and own-team audio agree.',
    );
  } finally {
    if (channel) await guest.removeChannel(channel);
    checked(await admin.from('matches').delete().eq('event_id', eventId));
    checked(await admin.from('events').delete().eq('id', eventId));
  }
}

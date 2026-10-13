import type { LiveMatch } from '../../core/live/live-types';
import { guidesFor, nextActionable, stationGroups } from './station-model';

const snap = (matches: LiveMatch[]) =>
  ({
    matches,
    rounds: [{ id: 'r1', number: 1 }],
    games: matches.map((item) => ({ id: item.game_id, code: item.id })),
  }) as never;
const match = (
  id: string,
  bucket: LiveMatch['bucket'],
  status: LiveMatch['status'] = 'SCHEDULED',
  editable = true,
) =>
  ({
    id,
    round_id: 'r1',
    game_id: `g-${id}`,
    bucket,
    status,
    editable,
    participants: [{ team_id: `${id}-a` }, { team_id: `${id}-b` }],
  }) as unknown as LiveMatch;

describe('station model', () => {
  it('groups current and late matches and puts open ones first', () => {
    const groups = stationGroups(
      snap([
        match('M3', 'current', 'COMPLETED'),
        match('M2', 'current'),
        match('M9', 'late'),
        match('M5', 'upcoming'),
        match('M1', 'late'),
        match('M7', 'done', 'COMPLETED', false),
      ]),
    );
    expect(groups.current.map((item) => item.id)).toEqual(['M2', 'M3']);
    expect(groups.late.map((item) => item.id)).toEqual(['M1', 'M9']);
    expect(groups.done.map((item) => item.id)).toEqual(['M7']);
  });

  it('never offers a finished match of an ended round as the next action (D050)', () => {
    expect(nextActionable(snap([match('M7', 'done', 'COMPLETED', false)]), null)).toBeNull();
  });

  it('finds the next match needing a result, current before late', () => {
    const matches = [
      match('M1', 'late'),
      match('M2', 'current'),
      match('M3', 'current', 'COMPLETED'),
    ];
    expect(nextActionable(snap(matches), null)?.id).toBe('M2');
    expect(nextActionable(snap(matches), 'M2')?.id).toBe('M1');
    expect(nextActionable(snap([match('M1', 'late', 'SCHEDULED', false)]), null)).toBeNull();
  });

  it('lists only the guides of the teams in the match', () => {
    const guides = [
      { member_id: 'g1', name_en: 'G1', name_ar: null, phone: '01000000001', team_id: 'M1-a' },
      { member_id: 'g2', name_en: 'G2', name_ar: null, phone: '01000000002', team_id: 'X' },
    ];
    expect(
      guidesFor({ team_guides: guides }, match('M1', 'current')).map((g) => g.member_id),
    ).toEqual(['g1']);
  });
});

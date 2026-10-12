import { describe, expect, it } from 'vitest';
import { availableTeamCodes, validMatchSelection } from './setup-helpers';

describe('event setup match builder helpers', () => {
  const teams = [{ code: 'T01' }, { code: 'T02' }, { code: 'T03' }];
  const matches = [
    { id: 'm1', round_id: 'r1', team_codes: ['T01', 'T02'] },
    { id: 'm2', round_id: 'r2', team_codes: ['T03'] },
  ];

  it('excludes teams already scheduled in this round only', () => {
    expect(availableTeamCodes(teams, matches, 'r1')).toEqual(['T03']);
    expect(availableTeamCodes(teams, matches, 'r2')).toEqual(['T01', 'T02']);
  });

  it('frees the edited match teams and rejects missing or identical opponents', () => {
    expect(availableTeamCodes(teams, matches, 'r1', 'm1')).toEqual(['T01', 'T02', 'T03']);
    expect(validMatchSelection('T01', 'T02')).toBe(true);
    expect(validMatchSelection('T01', 'T01')).toBe(false);
    expect(validMatchSelection('', 'T02')).toBe(false);
  });
});

import { newTeams, nextCodes, repeatedPair, setupIssues } from './setup-helpers';

describe('setup checklist helpers (U7)', () => {
  it('continues codes after the highest existing one', () => {
    expect(nextCodes(['T01', 'T07'], 'T', 2)).toEqual(['T08', 'T09']);
    expect(nextCodes([], 'G', 1)).toEqual(['G01']);
  });
  it('generates teams with unused avatars and distinct colours', () => {
    const teams = newTeams([{ code: 'T01', avatar_key: 'falcon' }], 3);
    expect(teams.map((team) => team.code)).toEqual(['T02', 'T03', 'T04']);
    expect(teams.map((team) => team.avatar_key)).not.toContain('falcon');
    expect(new Set(teams.map((team) => team.color_hex)).size).toBe(3);
    expect(teams[0].name_ar).toBe('فريق 2');
  });
  it('flags rematches from earlier rounds only', () => {
    const rounds = [
      { id: 'r1', number: 1 },
      { id: 'r2', number: 2 },
    ];
    const matches = [{ round_id: 'r1', team_codes: ['T01', 'T02'] }];
    expect(repeatedPair(matches, rounds, 'r2', ['T02', 'T01'])).toBe(true);
    expect(repeatedPair(matches, rounds, 'r2', ['T01', 'T03'])).toBe(false);
    expect(repeatedPair(matches, rounds, 'r1', ['T01', 'T02'])).toBe(false);
  });
  it('lists readiness problems with the step that fixes them', () => {
    const issues = setupIssues({
      name: 'Event',
      teams: [{}, {}],
      games: [{ id: 'g1' }],
      rounds: [{ id: 'r1', number: 1, type: 'REGULAR' }],
      matches: [{ round_id: 'r1', game_id: 'g1', team_codes: ['T01'] }],
      refereeGameIds: new Set(),
    });
    expect(issues.map((issue) => issue.key)).toEqual([
      'review.incompleteMatch',
      'review.noReferee',
    ]);
    expect(issues[1].tab).toBe('staff');
  });
});

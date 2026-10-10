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

import { describe, expect, it } from 'vitest';
import {
  activeRound,
  nextDraftRound,
  nextTeamMatch,
  roundProgress,
  teamMatchIn,
} from './now-model';

const rounds = [
  { id: 'r1', number: 1, status: 'CLOSED' as const },
  { id: 'r2', number: 2, status: 'ACTIVE' as const },
  { id: 'r4', number: 4, status: 'DRAFT' as const },
  { id: 'r3', number: 3, status: 'DRAFT' as const },
];
const match = (id: string, round: string, codes: string[], status = 'SCHEDULED' as const) => ({
  id,
  round_id: round,
  game_id: 'g',
  status,
  participants: codes.map((code) => ({ team_id: code, team_code: code, side: null })),
});

describe('now sheet model', () => {
  it('finds the active and the next draft round', () => {
    expect(activeRound(rounds)?.id).toBe('r2');
    expect(nextDraftRound(rounds)?.id).toBe('r3');
    expect(
      nextDraftRound(rounds.map((round) => ({ ...round, status: 'DRAFT' as const })))?.id,
    ).toBe('r1');
  });
  it('finds my match now and my next scheduled match', () => {
    const matches = [
      match('a', 'r2', ['T1', 'T2']),
      match('b', 'r4', ['T1', 'T3']),
      match('c', 'r3', ['T2', 'T3']),
    ];
    expect(teamMatchIn(matches, 'r2', 'T1')?.id).toBe('a');
    expect(teamMatchIn(matches, 'r2', 'T3')).toBeNull();
    expect(nextTeamMatch(matches, rounds, 'T1', 2)?.id).toBe('b');
    expect(nextTeamMatch(matches, rounds, 'T3', 2)?.id).toBe('c');
  });
  it('counts results in, pending and void separately', () => {
    const matches = [
      { ...match('a', 'r2', ['T1', 'T2']), status: 'COMPLETED' as const },
      match('b', 'r2', ['T3', 'T4']),
      { ...match('c', 'r2', ['T5', 'T6']), status: 'VOID' as const },
    ];
    expect(roundProgress(matches, 'r2')).toEqual({ total: 2, completed: 1, pending: 1, void: 1 });
  });
});

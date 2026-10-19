import { TestBed } from '@angular/core/testing';
import { EventReportApi, completionReady, type EventRecap } from './event-report-api';
import { RpcTransport } from '../offline/rpc-transport';

describe('private event reports', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({});
    TestBed.configureTestingModule({ providers: [{ provide: RpcTransport, useValue: { rpc } }] });
  });
  it('uses private transport without a persistent read cache', async () => {
    const api = TestBed.inject(EventReportApi);
    await api.history();
    await api.recap('past');
    await api.finish('past', 'same-op');
    expect(rpc.mock.calls).toEqual([
      ['get_my_event_history', {}],
      ['get_event_recap', { p_event: 'past' }],
      ['finish_event', { p_event: 'past', p_op_id: 'same-op' }],
    ]);
  });
  for (const [status, rounds, matches, expected] of [
    ['LIVE', [], [], true],
    ['DRAFT', [], [], true],
    ['FINISHED', [], [], false],
    ['ARCHIVED', [], [], false],
    ['LIVE', ['round'], [], false],
    ['LIVE', [], ['match'], false],
  ] as const) {
    it(`completion ${status} rounds=${rounds.length} matches=${matches.length} => ${expected}`, () => {
      expect(
        completionReady({
          event: { status },
          blockers: { round_ids: [...rounds], match_ids: [...matches] },
        } as EventRecap),
      ).toBe(expected);
    });
  }
});

import type { StandingsExport } from '../../core/standings/standings-types';
import { cairoExportTime, createStandingsWorkbook, standingsFilename } from './export-workbook';

export function exportFixture(): StandingsExport {
  const team = (id: string, code: string, en: string, ar: string) => ({
    id,
    code,
    name_en: en,
    name_ar: ar,
    avatar_key: 'lion',
    color_hex: '#172B4D',
    sort_order: 0,
    guide: null,
  });
  return {
    event: {
      id: 'event',
      code: 'BTS-2026',
      name_en: 'DST Event',
      name_ar: 'يوم DST',
      status: 'LIVE',
      starts_on: null,
      leaderboard_public: false,
      show_guide_phone: false,
      points_win: 2,
      points_draw: 1,
      points_loss: 0,
      currency_en_one: 'Point',
      currency_en_other: 'Points',
      currency_ar_one: 'نقطة',
      currency_ar_two: 'نقطتين',
      currency_ar_plural: 'نقط',
    },
    generated_at: '2026-01-10T23:30:00.000Z',
    standings: [
      {
        rank: 1,
        team: team('b', 'T02', 'Falcons', 'الصقور'),
        played: 2,
        wins: 1,
        draws: 1,
        losses: 0,
        forfeits: 0,
        match_points: 3,
        adjustment_points: -1,
        total: 2,
        is_tied: true,
        final_tiebreak_pos: null,
      },
      {
        rank: 1,
        team: team('a', 'T01', 'Lions', 'الأسود'),
        played: 2,
        wins: 1,
        draws: 0,
        losses: 0,
        forfeits: 1,
        match_points: 2,
        adjustment_points: 0,
        total: 2,
        is_tied: true,
        final_tiebreak_pos: null,
      },
    ],
    matches: [
      {
        id: 'match',
        round_number: 1,
        round_type: 'REGULAR',
        game_code: 'G01',
        game_name_en: 'Football',
        game_name_ar: 'كورة',
        status: 'COMPLETED',
        participants: [
          { team_code: 'T02', name_en: 'Falcons', name_ar: 'الصقور', outcome: 'WIN' },
          { team_code: 'T01', name_en: 'Lions', name_ar: 'الأسود', outcome: 'FORFEIT' },
        ],
        entered_by: { name_en: 'Mina', name_ar: 'مينا' },
        result_entered_at: '2026-01-10T12:00:00Z',
      },
    ],
    adjustments: [
      {
        id: 'adjustment',
        team_code: 'T02',
        team_name_en: 'Falcons',
        team_name_ar: 'الصقور',
        scope: 'MATCH',
        match_id: 'match',
        points: -1,
        reason: 'Late arrival',
        given_by: { name_en: 'Mina', name_ar: 'مينا' },
        created_at: '2026-01-10T12:00:00Z',
        revoked_at: '2026-01-10T13:00:00Z',
        revoke_reason: 'Correction',
      },
    ],
    staff: [
      {
        member_id: 'private-member-id',
        username: 'mina',
        name_en: 'Mina',
        name_ar: 'مينا',
        role: 'REFEREE',
        game_codes: ['G01', 'G02'],
        team_code: null,
      },
    ],
  };
}

describe('standings XLSX export', () => {
  const text = (key: string) => key.split('.').at(-1)!;

  it('uses the snapshot timestamp in Africa/Cairo, including date rollover and summer time', () => {
    expect(standingsFilename('BTS-2026', '2026-01-10T23:30:00Z')).toBe(
      'DST-BTS-2026-standings-20260111-0130.xlsx',
    );
    expect(standingsFilename('BTS-2026', '2026-07-10T21:30:00Z')).toBe(
      'DST-BTS-2026-standings-20260711-0030.xlsx',
    );
    expect(cairoExportTime('2026-07-10T21:30:00Z')).toBe('2026-07-11 00:30');
    expect(standingsFilename('BTS/2026', '2026-01-10T23:30:00Z')).toContain('DST-BTS-2026-');
  });

  it('round-trips the exact displayed order, shared ranks, numeric totals and point breakdown', async () => {
    const snapshot = exportFixture();
    const workbook = await createStandingsWorkbook(snapshot, 'en', text);
    const buffer = await workbook.xlsx.writeBuffer();
    const ExcelJS = (await import('exceljs')).default;
    const parsed = await new ExcelJS.Workbook().xlsx.load(buffer);
    expect(parsed.worksheets.map((sheet) => sheet.name)).toEqual([
      'Standings',
      'Matches',
      'Adjustments',
      'Staff',
    ]);
    const standings = parsed.getWorksheet('Standings')!;
    expect(standings.rowCount).toBe(snapshot.standings.length + 3);
    for (const [index, expected] of snapshot.standings.entries()) {
      const row = standings.getRow(index + 4);
      expect(row.getCell(1).value).toBe(expected.rank);
      expect(row.getCell(2).value).toBe(expected.team.code);
      expect(row.getCell(3).value).toBe(expected.team.name_en);
      expect(row.getCell(4).value).toBe(expected.team.name_ar);
      expect(row.getCell(10).value).toBe(expected.match_points);
      expect(row.getCell(11).value).toBe(expected.adjustment_points);
      expect(row.getCell(12).value).toBe(expected.total);
      expect(typeof row.getCell(12).value).toBe('number');
      expect(row.getCell(12).font.bold).toBe(true);
      expect(row.getCell(13).value).toBe(true);
    }
    expect(standings.getCell('A1').value).toContain('2026-01-11 01:30 (Africa/Cairo)');
    expect(standings.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
    expect(standings.getCell('A3').font.color?.argb).toBe('FFFFFFFF');
  });

  it('includes match attribution and revoked adjustment history without staff credentials or identifiers', async () => {
    const snapshot = exportFixture();
    Object.assign(snapshot.staff[0], {
      phone: '+201000000000',
      auth_user_id: 'secret-auth-id',
      password: 'secret-password',
    });
    const workbook = await createStandingsWorkbook(snapshot, 'en', text);
    const match = workbook.getWorksheet('Matches')!.getRow(4);
    expect(match.getCell(1).value).toBe(1);
    expect(match.getCell(7).value).toBe('T02 / T01');
    expect(match.getCell(10).value).toBe('T02: WIN / T01: FORFEIT');
    expect(match.getCell(11).value).toBe('Mina');
    expect(match.getCell(13).value).toBe('2026-01-10 14:00');
    const adjustment = workbook.getWorksheet('Adjustments')!.getRow(4);
    expect(adjustment.getCell(5).value).toBe('1 / G01');
    expect(adjustment.getCell(6).value).toBe(-1);
    expect(adjustment.getCell(8).value).toBe('Mina');
    expect(adjustment.getCell(11).value).toBe(true);
    expect(adjustment.getCell(13).value).toBe('Correction');
    const staff = workbook.getWorksheet('Staff')!.getRow(4);
    expect(staff.values).toEqual([undefined, 'Mina', 'مينا', 'REFEREE', 'G01, G02']);
    const serialized = JSON.stringify(workbook.model);
    for (const sensitive of [
      '+201000000000',
      'secret-auth-id',
      'secret-password',
      'private-member-id',
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it('keeps formula-like user text literal, preserves manual positions, and uses RTL sheet views in Arabic', async () => {
    const snapshot = exportFixture();
    snapshot.standings[0].team.name_en = '=HYPERLINK("https://invalid.test")';
    snapshot.standings[0].final_tiebreak_pos = 1;
    snapshot.standings[0].is_tied = false;
    snapshot.adjustments[0].reason = '+SUM(1,2)';
    const workbook = await createStandingsWorkbook(snapshot, 'ar', text);
    const ExcelJS = (await import('exceljs')).default;
    const parsed = await new ExcelJS.Workbook().xlsx.load(await workbook.xlsx.writeBuffer());
    const cell = parsed.getWorksheet('Standings')!.getCell('C4');
    expect(cell.value).toBe(snapshot.standings[0].team.name_en);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(parsed.getWorksheet('Standings')!.getCell('N4').value).toBe(1);
    expect(parsed.getWorksheet('Adjustments')!.getCell('G4').value).toBe('+SUM(1,2)');
    expect(parsed.worksheets.every((sheet) => sheet.views[0].rightToLeft)).toBe(true);
  });
});

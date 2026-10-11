import type { Workbook } from 'exceljs';
import type { StandingsExport } from '../../core/standings/standings-types';

export type ExportText = (key: string) => string;
type Value = string | number | boolean | null;

function cairoParts(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_EXPORT_TIME');
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

export function cairoExportTime(value: string) {
  const p = cairoParts(value);
  return `${p['year']}-${p['month']}-${p['day']} ${p['hour']}:${p['minute']}`;
}

export function standingsFilename(eventCode: string, generatedAt: string) {
  const p = cairoParts(generatedAt);
  const code =
    eventCode.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '') || 'event';
  return `DST-${code}-standings-${p['year']}${p['month']}${p['day']}-${p['hour']}${p['minute']}.xlsx`;
}

function addSheet(
  workbook: Workbook,
  name: string,
  headers: string[],
  rows: Value[][],
  stamp: string,
  rtl: boolean,
  boldColumn?: number,
) {
  const sheet = workbook.addWorksheet(name);
  sheet.views = [{ state: 'frozen', ySplit: 3, rightToLeft: rtl }];
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).value = stamp;
  sheet.getCell(1, 1).font = { italic: true, color: { argb: 'FF172B4D' } };
  sheet.addRow([]);
  sheet.addRow(headers);
  sheet.getRow(3).height = 30;
  sheet.getRow(3).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172B4D' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  for (const values of rows) {
    // ExcelJS treats strings literally. Never construct formula/hyperlink cell objects
    // from event, team, staff or adjustment text.
    const row = sheet.addRow(
      values.map((value) => (typeof value === 'string' ? value.slice(0, 32767) : value)),
    );
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      if (typeof cell.value === 'number') cell.numFmt = '0';
    });
    if (boldColumn) row.getCell(boldColumn).font = { bold: true };
  }
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } };
  sheet.columns.forEach((column, index) => {
    column.width = index === 0 ? 12 : 24;
  });
  return sheet;
}

export async function createStandingsWorkbook(
  snapshot: StandingsExport,
  language: string,
  text: ExportText,
): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DST';
  workbook.created = new Date(snapshot.generated_at);
  workbook.modified = new Date(snapshot.generated_at);
  const t = (key: string) => text(`phase6.workbook.${key}`);
  const stamp = `${snapshot.event.code} · ${t('generatedAt')}: ${cairoExportTime(snapshot.generated_at)} (Africa/Cairo)`;
  const rtl = language === 'ar';
  const date = (value: string | null) => (value ? cairoExportTime(value) : '');
  addSheet(
    workbook,
    'Standings',
    [
      'rank',
      'code',
      'teamEn',
      'teamAr',
      'played',
      'wins',
      'draws',
      'losses',
      'forfeits',
      'matchPoints',
      'adjustments',
      'total',
      'tied',
      'manualPosition',
    ].map(t),
    snapshot.standings.map((row) => [
      row.rank,
      row.team.code,
      row.team.name_en,
      row.team.name_ar,
      row.played,
      row.wins,
      row.draws,
      row.losses,
      row.forfeits,
      row.match_points,
      row.adjustment_points,
      row.total,
      row.is_tied,
      row.final_tiebreak_pos,
    ]),
    stamp,
    rtl,
    12,
  );
  addSheet(
    workbook,
    'Matches',
    [
      'round',
      'roundType',
      'gameCode',
      'gameEn',
      'gameAr',
      'status',
      'teamCodes',
      'teamsEn',
      'teamsAr',
      'outcomes',
      'enteredByEn',
      'enteredByAr',
      'at',
    ].map(t),
    snapshot.matches.map((match) => [
      match.round_number,
      match.round_type,
      match.game_code,
      match.game_name_en,
      match.game_name_ar,
      match.status,
      match.participants.map((team) => team.team_code).join(' / '),
      match.participants.map((team) => team.name_en).join(' / '),
      match.participants.map((team) => team.name_ar ?? team.name_en).join(' / '),
      match.participants.map((team) => `${team.team_code}: ${team.outcome}`).join(' / '),
      match.entered_by?.name_en ?? '',
      match.entered_by?.name_ar ?? '',
      date(match.result_entered_at),
    ]),
    stamp,
    rtl,
  );
  const matchNames = new Map(
    snapshot.matches.map((match) => [match.id, `${match.round_number} / ${match.game_code}`]),
  );
  addSheet(
    workbook,
    'Adjustments',
    [
      'code',
      'teamEn',
      'teamAr',
      'scope',
      'match',
      'points',
      'reason',
      'givenByEn',
      'givenByAr',
      'at',
      'revoked',
      'revokedAt',
      'revokeReason',
    ].map(t),
    snapshot.adjustments.map((adjustment) => [
      adjustment.team_code,
      adjustment.team_name_en,
      adjustment.team_name_ar,
      adjustment.scope,
      adjustment.match_id ? (matchNames.get(adjustment.match_id) ?? adjustment.match_id) : '',
      adjustment.points,
      adjustment.reason,
      adjustment.given_by.name_en,
      adjustment.given_by.name_ar,
      date(adjustment.created_at),
      !!adjustment.revoked_at,
      date(adjustment.revoked_at),
      adjustment.revoke_reason,
    ]),
    stamp,
    rtl,
  );
  addSheet(
    workbook,
    'Staff',
    ['nameEn', 'nameAr', 'role', 'games', 'team'].map(t),
    snapshot.staff.map((staff) => [
      staff.name_en,
      staff.name_ar,
      staff.role,
      staff.game_codes.join(', '),
      staff.team_code,
    ]),
    stamp,
    rtl,
  );
  return workbook;
}

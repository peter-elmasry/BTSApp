export type ImportMode = 'UPSERT' | 'REPLACE';
export type ImportSheet = 'Event' | 'Teams' | 'Games' | 'Rounds' | 'Matches' | 'Staff' | 'Workbook';
export interface ImportIssue {
  sheet: ImportSheet;
  row: number;
  column: string;
  code: string;
}
export interface ImportRecord {
  row?: number;
  [key: string]: unknown;
}
export interface ImportPayload {
  event: Record<string, unknown>;
  teams: ImportRecord[];
  games: ImportRecord[];
  rounds: ImportRecord[];
  matches: ImportRecord[];
  staff: ImportRecord[];
}
export interface ImportReport {
  valid: boolean;
  errors: ImportIssue[];
  counts: Record<'teams' | 'games' | 'rounds' | 'matches' | 'staff', number>;
  applied: boolean;
}
export interface ParsedImport {
  payload: ImportPayload;
  errors: ImportIssue[];
}

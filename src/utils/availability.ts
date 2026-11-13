import ExcelJS from 'exceljs';
import type { AvailabilityCode, ProjectAvailability, Task } from '../types';
import { excelValue } from './importTasks';
import { getSchedulePoint } from './scheduler';

// ---------------------------------------------------------------------------
// Codes — shared by the Excel "Availability" sheet and the in-app tab, so a
// block copied from Excel pastes straight back in (the clipboard carries cell
// values, not fill colours — the codes are what round-trips).
// ---------------------------------------------------------------------------

export interface AvailabilityCodeDef {
  code: AvailabilityCode;
  label: string;
  /** Cell fill (hex, no alpha). Same in the app and the workbook. */
  fill: string;
  /** Text colour on that fill. */
  ink: string;
}

export const AVAILABILITY_CODES: AvailabilityCodeDef[] = [
  { code: 'A', label: 'Available', fill: '#BBF7D0', ink: '#14532D' },
  { code: 'U', label: 'Unavailable / holiday', fill: '#EF4444', ink: '#FFFFFF' },
  { code: 'H', label: 'Half day / partial', fill: '#FCD34D', ink: '#78350F' },
  { code: 'T', label: 'Training / other commitment', fill: '#93C5FD', ink: '#1E3A8A' },
  { code: 'P', label: 'Public holiday / non-working', fill: '#D1D5DB', ink: '#374151' },
];

export const CODE_META: Record<AvailabilityCode, AvailabilityCodeDef> =
  Object.fromEntries(AVAILABILITY_CODES.map(c => [c.code, c])) as Record<AvailabilityCode, AvailabilityCodeDef>;

/** Words people type instead of the code letter. Keys are lower-case. */
const CODE_ALIASES: Record<string, AvailabilityCode> = {
  a: 'A', available: 'A', y: 'A', yes: 'A',
  u: 'U', unavailable: 'U', holiday: 'U', hol: 'U', off: 'U', x: 'U', leave: 'U', annual: 'U',
  h: 'H', half: 'H', 'half day': 'H', partial: 'H', am: 'H', pm: 'H',
  t: 'T', training: 'T', other: 'T',
  p: 'P', 'public holiday': 'P', 'bank holiday': 'P', bh: 'P', ph: 'P',
};

/** A code from a cell's text, `null` for blank, `undefined` when not recognised. */
export function parseCode(raw: unknown): AvailabilityCode | null | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  return CODE_ALIASES[s];
}

// ---------------------------------------------------------------------------
// Timeline — identical to the Gantt chart's working-day columns.
// ---------------------------------------------------------------------------

/**
 * Number of working-day columns the Gantt shows for these tasks. The app's
 * Gantt is uncapped; the Excel Gantt sheet caps at 120 columns — pass `cap`
 * to match it.
 */
export function timelineDayCount(projectTasks: Task[], cap?: number): number {
  const maxEndHalf = Math.max(0, ...projectTasks.map(t => t.endHalfDay ?? 0));
  const n = Math.max(16, Math.ceil((maxEndHalf + 4) / 2));
  return cap ? Math.min(cap, n) : n;
}

/** The working days (YYYY-MM-DD) of the Gantt timeline, weekends skipped. */
export function timelineDates(startDate: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(getSchedulePoint(startDate, i * 2).date);
  return out;
}

// ---------------------------------------------------------------------------
// Parsing a pasted / imported block
// ---------------------------------------------------------------------------

/** Text in the Name column that ends the people block (the sheet's legend). */
const STOP_WORDS = new Set(['key', 'legend']);
const HEADER_NAMES = new Set(['name', 'person', 'people', 'resource']);

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;

function pad(n: number) { return String(n).padStart(2, '0'); }

/** A date out of a header cell, as YYYY-MM-DD, or null. */
function headerDate(raw: unknown): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    // ExcelJS returns dates at UTC midnight.
    return `${raw.getUTCFullYear()}-${pad(raw.getUTCMonth() + 1)}-${pad(raw.getUTCDate())}`;
  }
  const s = String(raw ?? '').trim();
  let m = s.match(ISO);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(DMY);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`; // UK order, like the rest of the app
  return null;
}

export interface ParsedPerson {
  name: string;
  /** Only the dates the block covers. `null` = the cell was blank (clears that day). */
  days: Record<string, AvailabilityCode | null>;
}

export interface ParsedAvailability {
  people: ParsedPerson[];
  /** How day columns were matched to dates. */
  mode: 'dated' | 'positional';
  /** Number of dates the block covers. */
  dayCount: number;
  /** Cell texts that are not a known code (ignored). */
  unknownValues: string[];
  error?: string;
}

/** Split clipboard text from Excel / Sheets into a grid (tab-separated, quoted cells allowed). */
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let atCellStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && atCellStart) { inQuotes = true; atCellStart = false; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; atCellStart = true; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; atCellStart = true; continue; }
    cell += ch;
    atCellStart = false;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Read people × days out of a grid (pasted or imported). If a row carries
 * dates (the sheet's "Name | 2026-06-15 | …" row), columns are matched by
 * date; otherwise the first column after the name is the timeline's first day.
 */
export function parseAvailabilityGrid(grid: unknown[][], timeline: string[]): ParsedAvailability {
  const unknown = new Set<string>();
  const cellText = (v: unknown) => String(v ?? '').trim();

  // Find a header row: at least two cells after the first that are dates.
  let headerIdx = -1;
  let colDates: (string | null)[] = [];
  for (let r = 0; r < grid.length; r++) {
    const dates = (grid[r] ?? []).map((v, c) => (c === 0 ? null : headerDate(v)));
    if (dates.filter(Boolean).length >= 2) { headerIdx = r; colDates = dates; break; }
  }

  const mode: ParsedAvailability['mode'] = headerIdx >= 0 ? 'dated' : 'positional';
  if (mode === 'positional') {
    const width = Math.max(0, ...grid.map(r => (r ?? []).length));
    colDates = [null, ...timeline.slice(0, Math.max(0, width - 1))];
  }

  const people: ParsedPerson[] = [];
  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = cellText(row[0]);
    if (STOP_WORDS.has(name.toLowerCase())) break;
    if (!name) continue;
    // A pasted header row without dates ("Name") is not a person.
    if (mode === 'positional' && r === 0 && HEADER_NAMES.has(name.toLowerCase())) continue;
    const days: ParsedPerson['days'] = {};
    for (let c = 1; c < colDates.length; c++) {
      const date = colDates[c];
      if (!date) continue;
      const code = parseCode(row[c]);
      if (code === undefined) {
        unknown.add(cellText(row[c]));
        continue;
      }
      days[date] = code;
    }
    people.push({ name, days });
  }

  const dayCount = colDates.filter(Boolean).length;
  let error: string | undefined;
  if (people.length === 0) {
    error = 'No people found. Copy from the Name column so each row starts with a person\'s name.';
  } else if (dayCount === 0) {
    error = 'No day columns found next to the names.';
  } else if (mode === 'positional' && people.every(p => parseCode(p.name) !== undefined)) {
    error = 'The first column looks like day codes, not names. Include the Name column when you copy.';
  }

  return { people, mode, dayCount, unknownValues: [...unknown].slice(0, 8), error };
}

/**
 * Merge a parsed block into the saved rows. People are matched by name
 * (case-insensitive); only the dates the block covers change. Returns the
 * rows to save and the ids to delete (when `removeMissing`).
 */
export function mergeAvailability(
  existing: ProjectAvailability[],
  parsed: ParsedPerson[],
  projectId: string,
  newId: () => string,
  removeMissing: boolean,
): { rows: ProjectAvailability[]; deletedIds: string[]; added: number; updated: number } {
  const key = (s: string) => s.trim().toLowerCase();
  const byName = new Map(existing.map(r => [key(r.personName), r]));
  const touched = new Set<string>();
  const rows = existing.map(r => ({ ...r, days: { ...r.days } }));
  const rowById = new Map(rows.map(r => [r.id, r]));
  let nextSort = Math.max(-1, ...existing.map(r => r.sortOrder)) + 1;
  let added = 0;
  let updated = 0;

  for (const p of parsed) {
    const match = byName.get(key(p.name));
    let row: ProjectAvailability;
    if (match && !touched.has(match.id)) {
      row = rowById.get(match.id)!;
      updated++;
    } else if (match) {
      row = rowById.get(match.id)!; // same name twice in the block: later cells win
    } else {
      row = { id: newId(), projectId, personName: p.name.trim(), sortOrder: nextSort++, days: {} };
      rows.push(row);
      rowById.set(row.id, row);
      byName.set(key(p.name), row);
      added++;
    }
    touched.add(row.id);
    for (const [date, code] of Object.entries(p.days)) {
      if (code) row.days[date] = code;
      else delete row.days[date];
    }
  }

  const deletedIds = removeMissing ? rows.filter(r => !touched.has(r.id)).map(r => r.id) : [];
  return { rows: rows.filter(r => !deletedIds.includes(r.id)), deletedIds, added, updated };
}

// ---------------------------------------------------------------------------
// Importing the exported workbook
// ---------------------------------------------------------------------------

/**
 * Read the availability block out of an .xlsx: the "Availability" sheet of the
 * project export, or failing that the first sheet with a row of dates.
 */
export async function readAvailabilityWorkbook(file: File): Promise<unknown[][]> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Please choose the Excel (.xlsx) export of this project.');
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const toGrid = (ws: ExcelJS.Worksheet): unknown[][] => {
    const grid: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const raw = row.values as unknown[];
      const values: unknown[] = [];
      for (let c = 1; c < raw.length; c++) values[c - 1] = excelValue(raw[c]);
      grid[rowNumber - 1] = values;
    });
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
    return grid;
  };
  const hasDateRow = (grid: unknown[][]) =>
    grid.some(r => r.filter((v, c) => c > 0 && headerDate(v)).length >= 2);

  const named = wb.worksheets.find(ws => ws.name.trim().toLowerCase() === 'availability');
  if (named) return toGrid(named);
  for (const ws of wb.worksheets) {
    const grid = toGrid(ws);
    if (hasDateRow(grid)) return grid;
  }
  throw new Error('This workbook has no "Availability" sheet. Export the project to Excel to get one.');
}

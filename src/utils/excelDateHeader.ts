import type ExcelJS from 'exceljs';
import { parseDate } from './scheduler';
import { BRAND } from './excelBrand';

// ---------------------------------------------------------------------------
// Shared timeline header for the "Gantt Chart" and "Availability" sheets.
//
// Four rows above the day columns, each with one job, so nothing is squeezed
// into a single cell:
//   month band   "June 2026"
//   week band    "w/c 15 Jun · wk 25"
//   weekday      "Mon"
//   day number   "15"  (large, bold)
// A thick line marks the start of each week, here and in the data rows.
// ---------------------------------------------------------------------------

/** Width of one day column. Wide enough that the day number never wraps. */
export const DAY_COL_WIDTH = 5.5;

/** How many rows `writeTimelineHeader` uses. */
export const TIMELINE_HEADER_ROWS = 4;

const FONT = 'Segoe UI';
const TODAY_BG = BRAND.orangeSoft;
const WHITE = 'FFFFFFFF';
const solid = (a: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });

/** True when column `i` starts a new week (first column, or the weekday went backwards). */
export function isWeekStart(dates: string[], i: number): boolean {
  if (i === 0) return true;
  return parseDate(dates[i]).getDay() < parseDate(dates[i - 1]).getDay()
    || parseDate(dates[i]).getTime() - parseDate(dates[i - 1]).getTime() > 6 * 86400000;
}

/** Left border that marks a week start in the data rows (undefined otherwise). */
export function weekStartBorder(dates: string[], i: number, accentArgb: string): Partial<ExcelJS.Border> | undefined {
  return isWeekStart(dates, i) && i > 0 ? { style: 'medium', color: { argb: accentArgb } } : undefined;
}

/** ISO-8601 week number. */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return m;
}

/** Merge [start, end] on `row` (if more than one cell) and return the first cell. */
function band(sheet: ExcelJS.Worksheet, row: number, start: number, end: number): ExcelJS.Cell {
  if (end > start) sheet.mergeCells(row, start, row, end);
  return sheet.getCell(row, start);
}

export interface TimelineHeaderOptions {
  /** YYYY-MM-DD, one per day column. */
  dates: string[];
  /** Excel column of the first day. */
  firstCol: number;
  /** Excel row of the month band; the header fills this row and the next three. */
  topRow: number;
  accentArgb: string;
  accentLightArgb: string;
  todayStr: string;
}

/**
 * Writes the four header rows over the day columns and sets their widths.
 * Columns left of `firstCol` are the caller's to fill.
 */
export function writeTimelineHeader(sheet: ExcelJS.Worksheet, o: TimelineHeaderOptions): void {
  const { dates, firstCol, topRow, accentArgb, accentLightArgb, todayStr } = o;
  const MONTH = topRow, WEEK = topRow + 1, WDAY = topRow + 2, DAY = topRow + 3;
  const lastCol = firstCol + dates.length - 1;
  const divider: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: WHITE } };

  sheet.getRow(MONTH).height = 20;
  sheet.getRow(WEEK).height = 18;
  sheet.getRow(WDAY).height = 16;
  sheet.getRow(DAY).height = 26;

  for (let c = firstCol; c <= lastCol; c++) sheet.getColumn(c).width = DAY_COL_WIDTH;

  // ---- Month band ----
  let start = 0;
  for (let i = 1; i <= dates.length; i++) {
    if (i < dates.length && dates[i].slice(0, 7) === dates[start].slice(0, 7)) continue;
    const cell = band(sheet, MONTH, firstCol + start, firstCol + i - 1);
    cell.value = parseDate(dates[start]).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    cell.font = { bold: true, size: 11, color: { argb: WHITE }, name: FONT };
    cell.fill = solid(accentArgb);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { left: start > 0 ? divider : undefined };
    start = i;
  }

  // ---- Week band ----
  start = 0;
  for (let i = 1; i <= dates.length; i++) {
    if (i < dates.length && !isWeekStart(dates, i)) continue;
    const span = i - start;
    const mon = mondayOf(parseDate(dates[start]));
    const dm = mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const cell = band(sheet, WEEK, firstCol + start, firstCol + i - 1);
    cell.value = span >= 4 ? `w/c ${dm}  ·  wk ${isoWeek(mon)}` : span >= 2 ? `w/c ${dm}` : dm;
    cell.font = { size: 9, color: { argb: WHITE }, name: FONT };
    cell.fill = solid(accentArgb);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { left: start > 0 ? divider : undefined, top: divider };
    start = i;
  }

  // ---- Weekday + day number ----
  const weekLine: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: accentArgb } };
  const bottomLine: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: BRAND.orange } };
  dates.forEach((date, i) => {
    const d = parseDate(date);
    const isToday = date === todayStr;
    const left = i > 0 && isWeekStart(dates, i) ? weekLine : undefined;
    const bg = solid(isToday ? TODAY_BG : accentLightArgb);

    const wd = sheet.getCell(WDAY, firstCol + i);
    wd.value = d.toLocaleDateString('en-US', { weekday: 'short' });
    wd.font = { size: 9, color: { argb: isToday ? BRAND.orangeInk : BRAND.muted }, bold: isToday, name: FONT };
    wd.fill = bg;
    wd.alignment = { vertical: 'bottom', horizontal: 'center' };
    wd.border = { left };

    const dn = sheet.getCell(DAY, firstCol + i);
    dn.value = d.getDate();
    dn.font = { size: 14, bold: true, color: { argb: isToday ? BRAND.orangeInk : BRAND.ink }, name: FONT };
    dn.fill = bg;
    dn.alignment = { vertical: 'middle', horizontal: 'center' };
    dn.border = { left, bottom: bottomLine };
  });
}

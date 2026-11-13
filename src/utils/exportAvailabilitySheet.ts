import type ExcelJS from 'exceljs';
import type { Project, ProjectAvailability, Task } from '../types';
import { parseDate } from './scheduler';
import { AVAILABILITY_CODES, timelineDates, timelineDayCount } from './availability';

// ---------------------------------------------------------------------------
// Sheet 3 — Availability (holiday tracker)
//
// Same working-day columns as the "Gantt Chart" sheet. People type a code in
// each day cell (dropdown); conditional formatting colours it. The row of ISO
// dates above the names lets the app match pasted / imported columns by date.
// ---------------------------------------------------------------------------

/** Name of the sheet; the app's importer looks for it. */
export const AVAILABILITY_SHEET_NAME = 'Availability';

/** The Excel Gantt sheet caps its timeline at this many working days. */
const EXCEL_TIMELINE_CAP = 120;

const FONT = 'Segoe UI';
const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();
const solid = (a: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addAvailabilitySheet(
  workbook: ExcelJS.Workbook,
  project: Project,
  projectTasks: Task[],
  availability: ProjectAvailability[],
  accentArgb: string,
  accentLightArgb: string,
): void {
  const sheet = workbook.addWorksheet(AVAILABILITY_SHEET_NAME);

  const dates = timelineDates(project.startDate, timelineDayCount(projectTasks, EXCEL_TIMELINE_CAP));
  const todayStr = toYMD(new Date());
  const NAME_COL = 1;
  const FIRST_DAY = 2;
  const LAST_DAY = FIRST_DAY + dates.length - 1;
  const TOTAL_COLS = LAST_DAY;

  const TITLE_ROW = 1;
  const HELP_ROW = 2;
  const MONTH_ROW = 3;
  const DAY_ROW = 4;
  const DATE_ROW = 5;            // "Name | 2026-06-15 | …" — the paste/import header
  const FIRST_PERSON = 6;

  const people = [...availability].sort((a, b) => a.sortOrder - b.sortOrder);
  const personRows = Math.max(15, people.length + 10);
  const LAST_PERSON = FIRST_PERSON + personRows - 1;

  const TODAY_BG = 'FFFFF3CD';
  const GRID = 'FFD6D8DE';

  sheet.getColumn(NAME_COL).width = 26;
  for (let c = FIRST_DAY; c <= LAST_DAY; c++) sheet.getColumn(c).width = 3.2;

  // ---- Row 1: title ----
  sheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, TOTAL_COLS);
  const title = sheet.getCell(TITLE_ROW, 1);
  title.value = `${project.name}  ·  Availability`;
  title.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' }, name: FONT };
  title.fill = solid(accentArgb);
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(TITLE_ROW).height = 32;

  // ---- Row 2: how to use it, with the codes in their colours ----
  sheet.mergeCells(HELP_ROW, 1, HELP_ROW, TOTAL_COLS);
  const help = sheet.getCell(HELP_ROW, 1);
  const rich: ExcelJS.RichText[] = [
    { text: 'Add names in column A, then type a code in each day (or pick from the dropdown):  ', font: { size: 9, name: FONT, color: { argb: 'FF374151' } } },
  ];
  AVAILABILITY_CODES.forEach(c => {
    rich.push({ text: ` ${c.code} `, font: { bold: true, size: 9, name: FONT, color: { argb: argb(c.fill === '#EF4444' ? '#C62828' : c.ink) } } });
    rich.push({ text: `${c.label}   `, font: { size: 9, name: FONT, color: { argb: 'FF374151' } } });
  });
  rich.push({
    text: '\nTo load it into the app: copy from the "Name" cell (A5) to the last filled day and paste into the project\'s Availability tab, or import this workbook there. Weekends are not shown — the days match the Gantt chart.',
    font: { italic: true, size: 8, name: FONT, color: { argb: 'FF6B7280' } },
  });
  help.value = { richText: rich };
  help.fill = solid(accentLightArgb);
  help.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
  sheet.getRow(HELP_ROW).height = 60;

  // ---- Row 3: month bands (as the Gantt sheet) ----
  sheet.getRow(MONTH_ROW).height = 18;
  const headCell = (r: number, c: number, value: string) => {
    const cell = sheet.getCell(r, c);
    cell.value = value;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' }, name: FONT };
    cell.fill = solid(accentArgb);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  };
  headCell(MONTH_ROW, NAME_COL, 'Person');
  let start = FIRST_DAY;
  for (let i = 0; i <= dates.length; i++) {
    const key = i < dates.length ? dates[i].slice(0, 7) : '';
    const prevKey = i > 0 ? dates[i - 1].slice(0, 7) : key;
    if (i === dates.length || (i > 0 && key !== prevKey)) {
      const end = FIRST_DAY + i - 1;
      if (end > start) sheet.mergeCells(MONTH_ROW, start, MONTH_ROW, end);
      const mc = sheet.getCell(MONTH_ROW, start);
      mc.value = parseDate(dates[i - 1]).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      mc.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' }, name: FONT };
      mc.fill = solid(accentArgb);
      mc.alignment = { vertical: 'middle', horizontal: 'center' };
      for (let c = start; c <= end; c++) sheet.getCell(MONTH_ROW, c).border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
      start = end + 1;
    }
  }

  // ---- Row 4: day headers (as the Gantt sheet) ----
  sheet.getRow(DAY_ROW).height = 28;
  headCell(DAY_ROW, NAME_COL, '');
  dates.forEach((date, i) => {
    const d = parseDate(date);
    const isToday = date === todayStr;
    const cell = sheet.getCell(DAY_ROW, FIRST_DAY + i);
    cell.value = d.toLocaleDateString('en-US', { weekday: 'narrow' }) + '\n' + d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    cell.font = { bold: isToday, size: 7, color: { argb: isToday ? 'FF1F2937' : 'FFFFFFFF' }, name: FONT };
    cell.fill = solid(isToday ? TODAY_BG : accentArgb);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      left: d.getDay() === 1 ? { style: 'thin', color: { argb: 'FFFFFFFF' } } : undefined,
    };
  });

  // ---- Row 5: machine-readable dates + "Name" header ----
  sheet.getRow(DATE_ROW).height = 50;
  const nameHead = sheet.getCell(DATE_ROW, NAME_COL);
  nameHead.value = 'Name';
  nameHead.font = { bold: true, size: 9, color: { argb: 'FF1F2937' }, name: FONT };
  nameHead.fill = solid(accentLightArgb);
  nameHead.alignment = { vertical: 'bottom', horizontal: 'left', indent: 1 };
  nameHead.border = { bottom: { style: 'medium', color: { argb: accentArgb } } };
  dates.forEach((date, i) => {
    const cell = sheet.getCell(DATE_ROW, FIRST_DAY + i);
    cell.value = date; // text on purpose: copies as "2026-06-15" in any locale
    cell.font = { size: 7, color: { argb: 'FF6B7280' }, name: FONT };
    cell.fill = solid(date === todayStr ? TODAY_BG : accentLightArgb);
    cell.alignment = { vertical: 'bottom', horizontal: 'center', textRotation: 90 };
    cell.border = { bottom: { style: 'medium', color: { argb: accentArgb } } };
  });

  // ---- Rows 6+: people ----
  const codeList = `"${AVAILABILITY_CODES.map(c => c.code).join(',')}"`;
  for (let r = FIRST_PERSON; r <= LAST_PERSON; r++) {
    const person = people[r - FIRST_PERSON];
    const row = sheet.getRow(r);
    row.height = 18;
    const nameCell = row.getCell(NAME_COL);
    nameCell.value = person?.personName ?? '';
    nameCell.font = { size: 10, color: { argb: 'FF1F2937' }, name: FONT };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    nameCell.border = { bottom: { style: 'hair', color: { argb: GRID } }, right: { style: 'thin', color: { argb: GRID } } };

    dates.forEach((date, i) => {
      const cell = row.getCell(FIRST_DAY + i);
      const code = person?.days[date];
      if (code) cell.value = code;
      cell.font = { size: 8, name: FONT };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (date === todayStr) cell.fill = solid(TODAY_BG);
      cell.border = {
        bottom: { style: 'hair', color: { argb: GRID } },
        right: { style: 'hair', color: { argb: GRID } },
        left: parseDate(date).getDay() === 1 ? { style: 'thin', color: { argb: 'FF94A3B8' } } : undefined,
      };
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [codeList],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Unknown code',
        error: AVAILABILITY_CODES.map(c => `${c.code} = ${c.label}`).join('\n'),
      };
    });
  }

  // Typing a code colours the cell (= is case-insensitive in Excel).
  if (dates.length > 0) {
    const ref = `${colLetter(FIRST_DAY)}${FIRST_PERSON}:${colLetter(LAST_DAY)}${LAST_PERSON}`;
    sheet.addConditionalFormatting({
      ref,
      rules: AVAILABILITY_CODES.map((c, i) => ({
        type: 'cellIs' as const,
        operator: 'equal' as const,
        formulae: [`"${c.code}"`],
        priority: i + 1,
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(c.fill) }, fgColor: { argb: argb(c.fill) } },
          font: { bold: true, color: { argb: argb(c.ink) } },
        },
      })),
    });
  }

  // ---- Key (below the people; the app stops reading at "Key") ----
  const KEY_ROW = LAST_PERSON + 2;
  const keyHead = sheet.getCell(KEY_ROW, NAME_COL);
  keyHead.value = 'Key';
  keyHead.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: FONT };
  keyHead.fill = solid(accentArgb);
  keyHead.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(KEY_ROW).height = 20;

  AVAILABILITY_CODES.forEach((c, i) => {
    const r = KEY_ROW + 1 + i;
    sheet.getRow(r).height = 18;
    const label = sheet.getCell(r, NAME_COL);
    label.value = c.label;
    label.font = { size: 9, color: { argb: 'FF1F2937' }, name: FONT };
    label.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    label.border = { bottom: { style: 'hair', color: { argb: GRID } } };
    const sw = sheet.getCell(r, FIRST_DAY);
    sw.value = c.code;
    sw.font = { bold: true, size: 9, color: { argb: argb(c.ink) }, name: FONT };
    sw.fill = solid(argb(c.fill));
    sw.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  const noteRow = KEY_ROW + AVAILABILITY_CODES.length + 1;
  const note = sheet.getCell(noteRow, NAME_COL);
  note.value = 'Weekends are excluded (same working days as the Gantt chart). Leave a day blank if unknown.';
  note.font = { italic: true, size: 8, color: { argb: 'FF6B7280' }, name: FONT };

  sheet.views = [{
    state: 'frozen',
    xSplit: 1,
    ySplit: DATE_ROW,
    topLeftCell: `${colLetter(FIRST_DAY)}${FIRST_PERSON}`,
    activeCell: `A${FIRST_PERSON}`,
  }];
}

import type ExcelJS from 'exceljs';
import type { Project, ProjectAvailability, Task } from '../types';
import { AVAILABILITY_CODES, timelineDates, timelineDayCount } from './availability';
import { TIMELINE_HEADER_ROWS, weekStartBorder, writeTimelineHeader } from './excelDateHeader';
import { BRAND, BRAND_HEADER_ROWS, FONT, applySheetChrome, line, solid, writeBrandHeader } from './excelBrand';

// ---------------------------------------------------------------------------
// Sheet 3 — Availability (holiday tracker)
//
// Same working-day columns and date header as the "Gantt Chart" sheet. People
// type a code in each day cell (dropdown); conditional formatting colours it.
// A hidden row of ISO dates above the names lets the app match pasted /
// imported columns by date.
// ---------------------------------------------------------------------------

/** Name of the sheet; the app's importer looks for it. */
export const AVAILABILITY_SHEET_NAME = 'Availability';

/** The Excel Gantt sheet caps its timeline at this many working days. */
const EXCEL_TIMELINE_CAP = 120;

const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();

/** Row of the "Person" header cell — where a copy for pasting into the app starts. */
export const AVAILABILITY_PERSON_ROW = BRAND_HEADER_ROWS + 1;

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
  logoId?: number,
): void {
  const accentArgb = BRAND.navy;
  const accentLightArgb = BRAND.panelSoft;
  const sheet = workbook.addWorksheet(AVAILABILITY_SHEET_NAME);

  const dates = timelineDates(project.startDate, timelineDayCount(projectTasks, EXCEL_TIMELINE_CAP));
  const todayStr = toYMD(new Date());
  const NAME_COL = 1;
  const FIRST_DAY = 2;
  const LAST_DAY = FIRST_DAY + dates.length - 1;
  const TOTAL_COLS = LAST_DAY;

  const MONTH_ROW = AVAILABILITY_PERSON_ROW;       // 4 header rows (month, week, weekday, day)
  const DAY_NUM_ROW = MONTH_ROW + TIMELINE_HEADER_ROWS - 1;
  const DATE_ROW = DAY_NUM_ROW + 1;                 // hidden "| 2026-06-15 | …" — the paste/import key
  const FIRST_PERSON = DATE_ROW + 1;

  const people = [...availability].sort((a, b) => a.sortOrder - b.sortOrder);
  const personRows = Math.max(15, people.length + 10);
  const LAST_PERSON = FIRST_PERSON + personRows - 1;

  const TODAY_BG = BRAND.orangeSoft;
  const GRID = BRAND.border;

  sheet.getColumn(NAME_COL).width = 26;

  // ---- Rows 1–4: banner, rule, title, and how to use it (codes in their colours) ----
  const rich: ExcelJS.RichText[] = [
    { text: 'Add names in column A, then type a code in each day (or pick from the dropdown):\n', font: { size: 9, name: FONT, color: { argb: BRAND.text } } },
  ];
  AVAILABILITY_CODES.forEach(c => {
    rich.push({ text: ` ${c.code} `, font: { bold: true, size: 9, name: FONT, color: { argb: argb(c.fill === '#EF4444' ? '#C62828' : c.ink) } } });
    rich.push({ text: `${c.label}    `, font: { size: 9, name: FONT, color: { argb: BRAND.muted } } });
  });
  rich.push({
    text: `
To load it into the app: copy from the "Person" cell (A${MONTH_ROW}) to the last filled day and paste into the project's Availability tab, or import this workbook there. Weekends are not shown — the days match the Gantt chart.`,
    font: { italic: true, size: 8, name: FONT, color: { argb: BRAND.muted } },
  });
  writeBrandHeader(sheet, {
    lastCol: Math.max(TOTAL_COLS, 12),
    sheetLabel: 'Availability',
    project,
    logoId,
    meta: rich,
    metaHeight: 58,
  });

  // ---- Rows 3–6: month / week / weekday / day number (shared with the Gantt sheet) ----
  if (dates.length > 0) {
    writeTimelineHeader(sheet, { dates, firstCol: FIRST_DAY, topRow: MONTH_ROW, accentArgb, accentLightArgb, todayStr });
  }
  // Column A: "Person" over the navy bands, "Name" over the light rows.
  sheet.mergeCells(MONTH_ROW, NAME_COL, MONTH_ROW + 1, NAME_COL);
  const personHead = sheet.getCell(MONTH_ROW, NAME_COL);
  personHead.value = 'Person';
  personHead.font = { bold: true, size: 10, color: { argb: BRAND.white }, name: FONT };
  personHead.fill = solid(accentArgb);
  personHead.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.mergeCells(DAY_NUM_ROW - 1, NAME_COL, DAY_NUM_ROW, NAME_COL);
  const nameHead = sheet.getCell(DAY_NUM_ROW - 1, NAME_COL);
  nameHead.value = 'Name';
  nameHead.font = { bold: true, size: 10, color: { argb: BRAND.navy }, name: FONT };
  nameHead.fill = solid(accentLightArgb);
  nameHead.alignment = { vertical: 'bottom', horizontal: 'left', indent: 1 };
  nameHead.border = { bottom: line('medium', BRAND.orange) };

  // ---- Row 7 (hidden): machine-readable dates ----
  // Hidden, not removed: a normal copy in Excel still includes hidden rows,
  // so a pasted block (and an imported workbook) keeps its date key.
  const dateRow = sheet.getRow(DATE_ROW);
  dateRow.hidden = true;
  dates.forEach((date, i) => {
    const cell = dateRow.getCell(FIRST_DAY + i);
    cell.value = date; // text on purpose: copies as "2026-06-15" in any locale
    cell.font = { size: 8, color: { argb: BRAND.muted }, name: FONT };
  });

  // ---- Rows 6+: people ----
  const codeList = `"${AVAILABILITY_CODES.map(c => c.code).join(',')}"`;
  for (let r = FIRST_PERSON; r <= LAST_PERSON; r++) {
    const person = people[r - FIRST_PERSON];
    const row = sheet.getRow(r);
    row.height = 21;
    const nameCell = row.getCell(NAME_COL);
    nameCell.value = person?.personName ?? '';
    nameCell.font = { size: 10, color: { argb: BRAND.text }, name: FONT };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    nameCell.border = { bottom: line('thin', GRID), right: line('thin', BRAND.borderStrong) };

    dates.forEach((date, i) => {
      const cell = row.getCell(FIRST_DAY + i);
      const code = person?.days[date];
      if (code) cell.value = code;
      cell.font = { size: 10, name: FONT };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (date === todayStr) cell.fill = solid(TODAY_BG);
      cell.border = {
        bottom: line('thin', GRID),
        right: line('thin', GRID),
        left: weekStartBorder(dates, i, BRAND.borderStrong),
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
  keyHead.font = { bold: true, size: 10, color: { argb: BRAND.white }, name: FONT };
  keyHead.border = { bottom: line('medium', BRAND.orange) };
  keyHead.fill = solid(accentArgb);
  keyHead.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(KEY_ROW).height = 20;

  AVAILABILITY_CODES.forEach((c, i) => {
    const r = KEY_ROW + 1 + i;
    sheet.getRow(r).height = 18;
    const label = sheet.getCell(r, NAME_COL);
    label.value = c.label;
    label.font = { size: 9, color: { argb: BRAND.text }, name: FONT };
    label.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    label.border = { bottom: line('thin', GRID) };
    const sw = sheet.getCell(r, FIRST_DAY);
    sw.value = c.code;
    sw.font = { bold: true, size: 9, color: { argb: argb(c.ink) }, name: FONT };
    sw.fill = solid(argb(c.fill));
    sw.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  const noteRow = KEY_ROW + AVAILABILITY_CODES.length + 1;
  const note = sheet.getCell(noteRow, NAME_COL);
  note.value = 'Weekends are excluded (same working days as the Gantt chart). Leave a day blank if unknown.';
  note.font = { italic: true, size: 8, color: { argb: BRAND.muted }, name: FONT };

  sheet.views = [{
    state: 'frozen',
    xSplit: 1,
    ySplit: DATE_ROW,
    topLeftCell: `${colLetter(FIRST_DAY)}${FIRST_PERSON}`,
    activeCell: `A${FIRST_PERSON}`,
  }];
  applySheetChrome(sheet, { printTitleRows: `${MONTH_ROW}:${DAY_NUM_ROW}` });
}

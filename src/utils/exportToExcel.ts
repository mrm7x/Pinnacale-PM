import ExcelJS from 'exceljs';
import type { Project, Task, Consultant, ProjectAvailability } from '../types';
import { addAvailabilitySheet } from './exportAvailabilitySheet';
import { TIMELINE_HEADER_ROWS, weekStartBorder, writeTimelineHeader } from './excelDateHeader';
import {
  BRAND, FONT, STATUS_STYLE, applySheetChrome, line, loadLogoPng,
  projectMeta, solid, writeBrandHeader,
} from './excelBrand';
import { getSchedulePoint } from './scheduler';

/**
 * AM/PM label for a half-day task, blank for anything a day or longer.
 * Same rule as the Outlook export (halfDayPeriod in exportToIcs.ts): a task is
 * half-day when it starts and ends on the same half-day slot; it shows the
 * period chosen in the task form, and tasks saved before that option existed
 * default to AM. Kept local so the two exports don't depend on each other.
 */
function amPmLabel(task: Task): string {
  const { startHalfDay: s, endHalfDay: e } = task;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s !== e) return '';
  return task.startPeriod ?? 'AM';
}

const STATUS_LABEL: Record<Task['status'], string> = Object.fromEntries(
  Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.label]),
) as Record<Task['status'], string>;

// ---------------------------------------------------------------------------
// Flat task tree
// ---------------------------------------------------------------------------

interface FlatTask {
  task: Task;
  depth: number;
  wbs: string;
  isParent: boolean;
}

function buildFlatList(projectTasks: Task[]): FlatTask[] {
  const parentIds = new Set<string>();
  projectTasks.forEach(t => { if (t.parentId) parentIds.add(t.parentId); });

  function recurse(parentId: string | null, depth: number, prefix: string): FlatTask[] {
    const children = projectTasks
      .filter(t => t.parentId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const result: FlatTask[] = [];
    children.forEach((task, idx) => {
      const wbs = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
      result.push({ task, depth, wbs, isParent: parentIds.has(task.id) });
      result.push(...recurse(task.id, depth + 1, wbs));
    });
    return result;
  }

  return recurse(null, 0, '');
}

// ---------------------------------------------------------------------------
// Progress helpers (mirrors TaskListV2 logic)
// ---------------------------------------------------------------------------

function progressFor(task: Task, allTasks: Task[], parentIds: Set<string>): number {
  if (!parentIds.has(task.id)) return task.status === 'completed' ? 100 : 0;

  let completed = 0;
  let total = 0;
  const walk = (id: string) => {
    allTasks.filter(t => t.parentId === id).forEach(child => {
      if (parentIds.has(child.id)) {
        walk(child.id);
      } else {
        total++;
        if (child.status === 'completed') completed++;
      }
    });
  };
  walk(task.id);
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function friendlyDate(ymd?: string | null): string {
  if (!ymd) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = ymd.split('-');
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Estimate how many wrapped lines a string needs in a column of the given
 * character capacity. Honours explicit newlines and wraps long lines.
 */
function estimateWrappedLines(text: string, charsPerLine: number): number {
  if (!text) return 1;
  return text
    .split(/\r?\n/)
    .reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
}

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

const HAIRLINE = line('thin', BRAND.border);

function applyHeaderCell(
  cell: ExcelJS.Cell,
  value: string,
  align: ExcelJS.Alignment['horizontal'] = 'center',
): void {
  cell.value = value;
  cell.font = { bold: true, size: 10, color: { argb: BRAND.white }, name: FONT };
  cell.fill = solid(BRAND.navy);
  cell.alignment = { vertical: 'middle', horizontal: align, indent: align === 'left' ? 1 : 0 };
  cell.border = { bottom: line('medium', BRAND.orange) };
}

function applyDataCell(
  cell: ExcelJS.Cell,
  value: ExcelJS.CellValue,
  opts: {
    bgArgb: string;
    textArgb?: string;
    bold?: boolean;
    size?: number;
    align?: ExcelJS.Alignment['horizontal'];
    indent?: number;
    wrap?: boolean;
  },
): void {
  cell.value = value;
  cell.font = {
    bold: opts.bold ?? false,
    size: opts.size ?? 10,
    color: { argb: opts.textArgb ?? BRAND.text },
    name: FONT,
  };
  cell.fill = solid(opts.bgArgb);
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts.align ?? 'left',
    indent: opts.indent,
    wrapText: opts.wrap ?? false,
  };
  cell.border = { bottom: HAIRLINE };
}

/** Orange bar down the left of a parent (phase / group) row. */
function markParentRow(row: ExcelJS.Row): void {
  row.getCell(1).border = { bottom: HAIRLINE, left: line('thick', BRAND.orange) };
}

/** Overall completion: completed leaf tasks / all leaf tasks. */
function overallProgress(flatList: FlatTask[]): { done: number; total: number; pct: number } {
  const leaves = flatList.filter(f => !f.isParent);
  const done = leaves.filter(f => f.task.status === 'completed').length;
  return { done, total: leaves.length, pct: leaves.length ? Math.round((done / leaves.length) * 100) : 0 };
}

interface SheetContext {
  project: Project;
  flatList: FlatTask[];
  logoId?: number;
}

// ---------------------------------------------------------------------------
// Sheet 1 — Task List
// ---------------------------------------------------------------------------

function addTaskSheet(workbook: ExcelJS.Workbook, ctx: SheetContext, consultants: Consultant[]): void {
  const { project, flatList } = ctx;
  const sheet = workbook.addWorksheet('Tasks');

  sheet.columns = [
    { width: 7 },   // A  WBS
    { width: 40 },  // B  Task Name
    { width: 14 },  // C  Status
    { width: 18 },  // D  Owner
    { width: 18 },  // E  Assignee
    { width: 9 },   // F  AM/PM
    { width: 13 },  // G  Start Date
    { width: 13 },  // H  End Date
    { width: 12 },  // I  Progress
    { width: 10 },  // J  Pink #
    { width: 46 },  // K  Description
  ];
  const TOTAL_COLS = 11;

  // ---- Rows 1–4: banner, rule, title, meta ----
  const { done, total, pct } = overallProgress(flatList);
  const HEADER_ROW = writeBrandHeader(sheet, {
    lastCol: TOTAL_COLS,
    sheetLabel: 'Task list',
    project,
    logoId: ctx.logoId,
    meta: projectMeta(project, [['Progress', `${pct}%  (${done} of ${total} tasks)`, BRAND.orangeInk]]),
  });
  const FIRST_TASK_ROW = HEADER_ROW + 1;

  // ---- Column headers ----
  const headers = ['#', 'Task Name', 'Status', 'Owner', 'Assignee', 'AM/PM',
                   'Start Date', 'End Date', 'Progress', 'Pink #', 'Description'];
  const hRow = sheet.getRow(HEADER_ROW);
  hRow.height = 26;
  headers.forEach((h, i) => {
    applyHeaderCell(hRow.getCell(i + 1), h, i === 1 || i === 10 ? 'left' : 'center');
  });

  // ---- Task rows ----
  const parentIds = new Set<string>();
  flatList.forEach(({ isParent, task }) => { if (isParent) parentIds.add(task.id); });
  const allTasks = flatList.map(f => f.task);

  let leafIdx = 0;
  flatList.forEach(({ task, depth, wbs, isParent }, idx) => {
    const rowNum = idx + FIRST_TASK_ROW;
    const row = sheet.getRow(rowNum);
    // Height must grow to fit the wrapped Description (col K, width 46 ≈ 42 chars/line),
    // otherwise multi-line text is clipped and overlaps the next row.
    const descLines = estimateWrappedLines(task.description || '', 42);
    const baseHeight = isParent ? 24 : 20;
    row.height = Math.min(200, Math.max(baseHeight, descLines * 13.5 + 6));

    const assignee = consultants.find(c => c.id === task.assignedConsultantId);
    const rowBg = isParent ? BRAND.navySoft : (leafIdx++ % 2 === 0 ? BRAND.white : BRAND.zebra);
    const isDone = task.status === 'completed';
    const textArgb = isParent ? BRAND.navy : (isDone ? BRAND.muted : BRAND.text);
    const status = STATUS_STYLE[task.status];
    const prog = progressFor(task, allTasks, parentIds);

    const cells: Array<{
      value: ExcelJS.CellValue; align?: ExcelJS.Alignment['horizontal']; indent?: number;
      bg?: string; textColor?: string; bold?: boolean; size?: number;
    }> = [
      { value: wbs, align: 'center', textColor: isParent ? BRAND.navy : BRAND.faint, size: 9 },
      { value: task.name, align: 'left', indent: 1 + depth * 2 },
      { value: STATUS_LABEL[task.status], align: 'center', bg: status.fill, textColor: status.ink, bold: true, size: 9 },
      { value: task.taskOwner || 'Pinnacle', align: 'center' },
      { value: assignee?.name || 'Unassigned', align: 'center', textColor: assignee ? undefined : BRAND.faint },
      { value: amPmLabel(task), align: 'center' },
      { value: friendlyDate(task.plannedStartDate), align: 'center' },
      { value: friendlyDate(task.plannedEndDate), align: 'center' },
      // Progress: faint at 0%, orange while under way, green when done.
      {
        value: prog / 100, align: 'center', bold: prog > 0,
        textColor: prog === 100 ? STATUS_STYLE.completed.ink : prog > 0 ? BRAND.orangeInk : BRAND.faint,
      },
      { value: task.pinkNumber || '', align: 'center' },
      { value: task.description || '', align: 'left', indent: 1, textColor: BRAND.muted, size: 9 },
    ];

    cells.forEach(({ value, align, indent, bg, textColor, bold, size }, ci) => {
      applyDataCell(row.getCell(ci + 1), value, {
        bgArgb: bg ?? rowBg,
        textArgb: textColor ?? textArgb,
        bold: bold ?? isParent,
        size,
        align,
        indent,
        wrap: ci === 10,
      });
    });

    row.getCell(9).numFmt = '0%';
    // A wrapped Description reads better top-aligned than vertically centred.
    row.getCell(11).alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    // Row-coloured gap either side of the status chip so it reads as a pill, not a column.
    row.getCell(3).border = {
      bottom: HAIRLINE,
      top: line('thin', rowBg), left: line('medium', rowBg), right: line('medium', rowBg),
    };

    if (isParent) markParentRow(row);
  });

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: HEADER_ROW, topLeftCell: `A${FIRST_TASK_ROW}`, activeCell: `A${FIRST_TASK_ROW}` }];
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: TOTAL_COLS } };
  applySheetChrome(sheet, { printTitleRows: `${HEADER_ROW}:${HEADER_ROW}` });
}

// ---------------------------------------------------------------------------
// Sheet 2 — Gantt Chart
// ---------------------------------------------------------------------------

function addGanttSheet(workbook: ExcelJS.Workbook, ctx: SheetContext): void {
  const { project, flatList } = ctx;
  const sheet = workbook.addWorksheet('Gantt Chart');

  const LEFT_COLS = 5; // #, Task Name, AM/PM, Start, End

  // Compute working-day columns (same logic as GanttChart.tsx)
  const scheduledTasks = flatList.map(f => f.task);
  const maxEndHalf = Math.max(0, ...scheduledTasks.map(t => t.endHalfDay ?? 0));
  const totalWorkDays = Math.min(120, Math.max(16, Math.ceil((maxEndHalf + 4) / 2)));

  const todayStr = toYMD(new Date());

  interface DayCol {
    dateStr: string;
    isToday: boolean;
  }

  const dayCols: DayCol[] = [];
  for (let i = 0; i < totalWorkDays; i++) {
    const pt = getSchedulePoint(project.startDate, i * 2);
    dayCols.push({ dateStr: pt.date, isToday: pt.date === todayStr });
  }
  const dates = dayCols.map(c => c.dateStr);

  // Set column widths (day columns are set by writeTimelineHeader)
  sheet.getColumn(1).width = 6;   // #
  sheet.getColumn(2).width = 36;  // Task Name
  sheet.getColumn(3).width = 8;   // AM/PM
  sheet.getColumn(4).width = 12;  // Start
  sheet.getColumn(5).width = 12;  // End

  const TOTAL_COLS = LEFT_COLS + dayCols.length;

  // ---- Rows 1–4: banner, rule, title, meta + bar legend ----
  const legend: ExcelJS.RichText[] = [{ text: '\n', font: { size: 10, name: FONT } }];
  const legendItems: Array<[string, string]> = [
    ['Phase / group', BRAND.navy],
    ...Object.values(STATUS_STYLE).map(s => [s.label, s.bar] as [string, string]),
    ['Today', BRAND.orange],
  ];
  legendItems.forEach(([label, argb]) => {
    legend.push({ text: '■ ', font: { size: 11, color: { argb }, name: FONT } });
    legend.push({ text: `${label}       `, font: { size: 9, color: { argb: BRAND.muted }, name: FONT } });
  });

  const HEADER_TOP = writeBrandHeader(sheet, {
    lastCol: TOTAL_COLS,
    sheetLabel: 'Gantt chart',
    project,
    logoId: ctx.logoId,
    meta: [...projectMeta(project), ...legend],
    metaHeight: 40,
  });
  const HEADER_LAST = HEADER_TOP + TIMELINE_HEADER_ROWS - 1;
  const FIRST_TASK_ROW = HEADER_LAST + 1;

  // ---- Month / week / weekday / day number (shared with the Availability sheet) ----
  writeTimelineHeader(sheet, {
    dates, firstCol: LEFT_COLS + 1, topRow: HEADER_TOP, accentArgb: BRAND.navy, accentLightArgb: BRAND.panelSoft, todayStr,
  });

  // Left info headers span all four header rows
  ['#', 'Task Name', 'AM/PM', 'Start', 'End'].forEach((h, i) => {
    sheet.mergeCells(HEADER_TOP, i + 1, HEADER_LAST, i + 1);
    applyHeaderCell(sheet.getCell(HEADER_TOP, i + 1), h, i === 1 ? 'left' : 'center');
  });

  // ---- Task rows ----
  const parentIds = new Set<string>();
  flatList.forEach(({ isParent, task }) => { if (isParent) parentIds.add(task.id); });
  const allTasks = flatList.map(f => f.task);

  let leafIdx = 0;
  flatList.forEach(({ task, depth, wbs, isParent }, idx) => {
    const rowNum = idx + FIRST_TASK_ROW;
    const row = sheet.getRow(rowNum);
    row.height = isParent ? 22 : 20;

    const rowBg = isParent ? BRAND.navySoft : (leafIdx++ % 2 === 0 ? BRAND.white : BRAND.zebra);
    const textArgb = isParent ? BRAND.navy : (task.status === 'completed' ? BRAND.muted : BRAND.text);

    // Left info columns
    const leftData: Array<{ v: ExcelJS.CellValue; align: ExcelJS.Alignment['horizontal']; indent?: number }> = [
      { v: wbs, align: 'center' },
      { v: task.name, align: 'left', indent: 1 + depth * 2 },
      { v: amPmLabel(task), align: 'center' },
      { v: friendlyDate(task.plannedStartDate), align: 'center' },
      { v: friendlyDate(task.plannedEndDate), align: 'center' },
    ];
    leftData.forEach(({ v, align, indent }, ci) => {
      applyDataCell(row.getCell(ci + 1), v, {
        bgArgb: rowBg,
        textArgb: ci === 0 && !isParent ? BRAND.faint : textArgb,
        bold: isParent,
        size: ci === 0 ? 9 : 10,
        align,
        indent,
      });
    });
    row.getCell(LEFT_COLS).border = { bottom: HAIRLINE, right: line('thin', BRAND.borderStrong) };
    if (isParent) markParentRow(row);

    // Bars: navy for phases/groups (light navy = still to do), status colour for tasks.
    const barArgb = isParent ? BRAND.navy : STATUS_STYLE[task.status].bar;
    const barRestArgb = isParent ? BRAND.navyTint : barArgb;

    const prog = progressFor(task, allTasks, parentIds);
    const barProgCols = task.plannedStartDate && task.plannedEndDate
      ? dayCols.filter(c => c.dateStr >= task.plannedStartDate! && c.dateStr <= task.plannedEndDate!).length
      : 0;
    const progFillCount = Math.round((prog / 100) * barProgCols);

    let barColIdx = 0;
    let firstBarCol = -1;
    let lastBarCol = -1;
    dayCols.forEach((col, i) => {
      const excelCol = LEFT_COLS + 1 + i;
      const cell = row.getCell(excelCol);
      const weekLine = weekStartBorder(dates, i, BRAND.borderStrong);

      const inBar = !!(task.plannedStartDate && task.plannedEndDate &&
                       col.dateStr >= task.plannedStartDate &&
                       col.dateStr <= task.plannedEndDate);

      if (inBar) {
        if (firstBarCol === -1) firstBarCol = excelCol;
        lastBarCol = excelCol;
        cell.fill = solid(barColIdx < progFillCount ? barArgb : barRestArgb);
        barColIdx++;
        // Row-coloured top/bottom borders inset the bar so it reads as a bar, not a filled row.
        cell.border = {
          top: line('thick', rowBg),
          bottom: line('thick', rowBg),
          left: weekLine,
        };
      } else {
        cell.fill = solid(col.isToday ? BRAND.orangeSoft : rowBg);
        cell.border = { bottom: HAIRLINE, left: weekLine };
      }
    });

    // Place the task-name label *beside* the bar (on the light timeline area) with
    // dark text, so it stays readable regardless of the bar's fill colour. A label
    // written inside a short bar would be clipped.
    if (firstBarCol !== -1) {
      const labelFont: Partial<ExcelJS.Font> = { bold: isParent, size: 8, color: { argb: isParent ? BRAND.navy : BRAND.muted }, name: FONT };
      const rightCol = lastBarCol + 1;
      if (rightCol <= TOTAL_COLS) {
        const lc = row.getCell(rightCol);
        lc.value = task.name;
        lc.font = labelFont;
        lc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      } else if (firstBarCol - 1 > LEFT_COLS) {
        // Bar runs to the right edge — drop the label to its left instead.
        const lc = row.getCell(firstBarCol - 1);
        lc.value = task.name;
        lc.font = labelFont;
        lc.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      }
    }
  });

  // Freeze left cols + title and header rows
  sheet.views = [{
    state: 'frozen',
    xSplit: LEFT_COLS,
    ySplit: HEADER_LAST,
    topLeftCell: `F${FIRST_TASK_ROW}`,
    activeCell: `A${FIRST_TASK_ROW}`,
  }];
  applySheetChrome(sheet, { printTitleRows: `${HEADER_TOP}:${HEADER_LAST}` });
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Builds the workbook. `logoPng` is a PNG data URL (or bare base64) of the reverse logo. */
export function buildProjectWorkbook(
  project: Project,
  tasks: Task[],
  consultants: Consultant[],
  availability: ProjectAvailability[] = [],
  logoPng?: string | null,
): ExcelJS.Workbook {
  const projectTasks = tasks
    .filter(t => t.projectId === project.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const flatList = buildFlatList(projectTasks);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pinnacle Flow';
  workbook.company = 'Pinnacle';
  workbook.title = `${project.name} — ${project.clientName}`;
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  const logoId = logoPng
    ? workbook.addImage({ base64: logoPng.replace(/^data:image\/png;base64,/, ''), extension: 'png' })
    : undefined;

  const ctx: SheetContext = { project, flatList, logoId };
  addTaskSheet(workbook, ctx, consultants);
  addGanttSheet(workbook, ctx);
  addAvailabilitySheet(workbook, project, projectTasks, availability, logoId);

  return workbook;
}

export async function exportProjectToExcel(
  project: Project,
  tasks: Task[],
  consultants: Consultant[],
  availability: ProjectAvailability[] = [],
): Promise<void> {
  const logoPng = await loadLogoPng();
  const workbook = buildProjectWorkbook(project, tasks, consultants, availability, logoPng);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name} - ${project.clientName} - Export.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


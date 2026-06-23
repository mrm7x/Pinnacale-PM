import ExcelJS from 'exceljs';
import type { Project, Task, Consultant } from '../types';
import { getProjectAccent } from './phases';
import { getSchedulePoint, parseDate } from './scheduler';

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function hexToArgb(hex: string): string {
  return 'FF' + hex.replace('#', '').toUpperCase();
}

/** Mix hex colour with white by `factor` (0 = original, 1 = white). */
function lighten(hex: string, factor = 0.85): string {
  const h = hex.replace('#', '');
  const ch = (offset: number) => parseInt(h.slice(offset, offset + 2), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * factor);
  return 'FF' + [mix(ch(0)), mix(ch(2)), mix(ch(4))]
    .map(v => v.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

const STATUS_LABEL: Record<Task['status'], string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
};

const STATUS_ARGB: Record<Task['status'], string> = {
  not_started: 'FF9CA3AF',
  in_progress: 'FF3B82F6',
  on_hold: 'FFF59E0B',
  completed: 'FF10B981',
};

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

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

type BorderStyle = ExcelJS.BorderStyle;
const THIN: { style: BorderStyle } = { style: 'thin' };
const HAIR: { style: BorderStyle } = { style: 'hair' };

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function applyHeaderCell(
  cell: ExcelJS.Cell,
  value: string,
  accentArgb: string,
  align: ExcelJS.Alignment['horizontal'] = 'center',
): void {
  cell.value = value;
  cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
  cell.fill = solidFill(accentArgb);
  cell.alignment = { vertical: 'middle', horizontal: align };
  cell.border = {
    top: THIN, bottom: THIN, left: THIN, right: THIN,
  };
}

function applyDataCell(
  cell: ExcelJS.Cell,
  value: ExcelJS.CellValue,
  opts: {
    bgArgb: string;
    textArgb?: string;
    bold?: boolean;
    align?: ExcelJS.Alignment['horizontal'];
    wrap?: boolean;
    border?: boolean;
  },
): void {
  cell.value = value;
  cell.font = {
    bold: opts.bold ?? false,
    size: 10,
    color: { argb: opts.textArgb ?? 'FF1F2937' },
    name: 'Segoe UI',
  };
  cell.fill = solidFill(opts.bgArgb);
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts.align ?? 'left',
    wrapText: opts.wrap ?? false,
  };
  if (opts.border !== false) {
    cell.border = {
      top: HAIR, bottom: HAIR, left: THIN, right: THIN,
    };
  }
}

// ---------------------------------------------------------------------------
// Sheet 1 — Task List
// ---------------------------------------------------------------------------

function addTaskSheet(
  workbook: ExcelJS.Workbook,
  project: Project,
  flatList: FlatTask[],
  consultants: Consultant[],
  accentArgb: string,
  accentLightArgb: string,
  accentMidArgb: string,
): void {
  const sheet = workbook.addWorksheet('Tasks');

  sheet.columns = [
    { width: 8 },   // A  WBS
    { width: 38 },  // B  Task Name
    { width: 14 },  // C  Status
    { width: 16 },  // D  Owner
    { width: 18 },  // E  Assignee
    { width: 11 },  // F  Duration
    { width: 13 },  // G  Start Date
    { width: 13 },  // H  End Date
    { width: 10 },  // I  Progress
    { width: 10 },  // J  Pink #
    { width: 42 },  // K  Description
  ];

  const TOTAL_COLS = 11;

  // ---- Row 1: Project title ----
  sheet.mergeCells(1, 1, 1, TOTAL_COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${project.name}  ·  ${project.clientName}`;
  titleCell.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
  titleCell.fill = solidFill(accentArgb);
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 32;

  // ---- Row 2: Meta strip ----
  sheet.getRow(2).height = 20;
  const meta: [string, string][] = [
    ['Status', project.status.charAt(0).toUpperCase() + project.status.slice(1)],
    ['Start', friendlyDate(project.startDate)],
    ['Go-Live', friendlyDate(project.targetGoLiveDate) || '—'],
    ['Phase', project.phase || '—'],
  ];
  // Use pairs of columns: (1,2), (3,4), (5,6), (7,8); leave 9-11 as accent strip
  meta.forEach(([label, value], i) => {
    const lc = i * 2 + 1;
    const vc = i * 2 + 2;
    const lCell = sheet.getCell(2, lc);
    lCell.value = label;
    lCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
    lCell.fill = solidFill(accentMidArgb);
    lCell.alignment = { vertical: 'middle', horizontal: 'right' };

    const vCell = sheet.getCell(2, vc);
    vCell.value = value;
    vCell.font = { bold: false, size: 9, color: { argb: 'FF1F2937' }, name: 'Segoe UI' };
    vCell.fill = solidFill(accentLightArgb);
    vCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  });
  // fill remaining cols
  for (let c = 9; c <= TOTAL_COLS; c++) {
    const cell = sheet.getCell(2, c);
    cell.fill = solidFill(accentLightArgb);
  }

  // ---- Row 3: Column headers ----
  const headers = ['#', 'Task Name', 'Status', 'Owner', 'Assignee', 'Duration (d)',
                   'Start Date', 'End Date', 'Progress', 'Pink #', 'Description'];
  const hRow = sheet.getRow(3);
  hRow.height = 22;
  headers.forEach((h, i) => {
    applyHeaderCell(hRow.getCell(i + 1), h, accentArgb, i === 1 ? 'left' : 'center');
  });

  // ---- Rows 4+: Task data ----
  const parentIds = new Set<string>();
  flatList.forEach(({ task }) => { if (task.parentId) parentIds.add(task.parentId); });
  // rebuild parentIds from the full flat list
  flatList.forEach(({ isParent, task }) => { if (isParent) parentIds.add(task.id); });

  flatList.forEach(({ task, depth, wbs, isParent }, idx) => {
    const rowNum = idx + 4;
    const row = sheet.getRow(rowNum);
    row.height = isParent ? 21 : 18;

    const assignee = consultants.find(c => c.id === task.assignedConsultantId);
    const isEven = idx % 2 === 0;
    const rowBg = isParent ? accentLightArgb : (isEven ? 'FFFFFFFF' : 'FFF9FAFB');
    const textArgb = isParent ? accentArgb : 'FF1F2937';
    const indent = '  '.repeat(depth);

    const prog = progressFor(task, flatList.map(f => f.task), parentIds);

    const cells: Array<{ value: ExcelJS.CellValue; align?: ExcelJS.Alignment['horizontal']; bg?: string; textColor?: string }> = [
      { value: wbs, align: 'center' },
      { value: indent + task.name, align: 'left' },
      { value: STATUS_LABEL[task.status], align: 'center', bg: STATUS_ARGB[task.status], textColor: 'FFFFFFFF' },
      { value: task.taskOwner || 'Pinnacle', align: 'center' },
      { value: assignee?.name || 'Unassigned', align: 'center' },
      { value: task.durationDays, align: 'center' },
      { value: friendlyDate(task.plannedStartDate), align: 'center' },
      { value: friendlyDate(task.plannedEndDate), align: 'center' },
      { value: `${prog}%`, align: 'center' },
      { value: task.pinkNumber || '', align: 'center' },
      { value: task.description || '', align: 'left' },
    ];

    cells.forEach(({ value, align, bg, textColor }, ci) => {
      const cell = row.getCell(ci + 1);
      applyDataCell(cell, value, {
        bgArgb: bg ?? rowBg,
        textArgb: textColor ?? textArgb,
        bold: isParent,
        align,
        wrap: ci === 10,
      });
    });

    // Accent left border on parent rows
    if (isParent) {
      row.getCell(1).border = {
        top: HAIR, bottom: HAIR,
        left: { style: 'medium', color: { argb: accentArgb } },
        right: THIN,
      };
    }
  });

  // Freeze top 3 rows
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4', activeCell: 'A4' }];

  // Auto-filter
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: TOTAL_COLS } };
}

// ---------------------------------------------------------------------------
// Sheet 2 — Gantt Chart
// ---------------------------------------------------------------------------

function addGanttSheet(
  workbook: ExcelJS.Workbook,
  project: Project,
  flatList: FlatTask[],
  consultants: Consultant[],
  accentArgb: string,
  accentLightArgb: string,
): void {
  const sheet = workbook.addWorksheet('Gantt Chart');

  const LEFT_COLS = 5; // #, Task Name, Duration, Start, End

  // Compute working-day columns (same logic as GanttChart.tsx)
  const scheduledTasks = flatList.map(f => f.task);
  const maxEndHalf = Math.max(0, ...scheduledTasks.map(t => t.endHalfDay ?? 0));
  const totalWorkDays = Math.min(120, Math.max(16, Math.ceil((maxEndHalf + 4) / 2)));

  const todayStr = toYMD(new Date());

  interface DayCol {
    dateStr: string;
    dayName: string;
    dateLabel: string;
    isToday: boolean;
    isFriday: boolean;
    monthKey: string;
    monthLabel: string;
  }

  const dayCols: DayCol[] = [];
  for (let i = 0; i < totalWorkDays; i++) {
    const pt = getSchedulePoint(project.startDate, i * 2);
    const d = parseDate(pt.date);
    const dow = d.getDay(); // 5 = Fri
    dayCols.push({
      dateStr: pt.date,
      dayName: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      dateLabel: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
      isToday: pt.date === todayStr,
      isFriday: dow === 5,
      monthKey: `${d.getFullYear()}-${d.getMonth()}`,
      monthLabel: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }

  // Set column widths
  sheet.getColumn(1).width = 6;   // #
  sheet.getColumn(2).width = 28;  // Task Name
  sheet.getColumn(3).width = 9;   // Duration
  sheet.getColumn(4).width = 11;  // Start
  sheet.getColumn(5).width = 11;  // End
  dayCols.forEach((_, i) => {
    sheet.getColumn(LEFT_COLS + 1 + i).width = 2.4;
  });

  const TOTAL_COLS = LEFT_COLS + dayCols.length;
  const TODAY_BG   = 'FFFFF3CD';  // pale amber for today
  const FRIDAY_BG  = 'FFEFF6FF';  // faint blue at week-end boundary

  // ---- Row 1: Title ----
  sheet.mergeCells(1, 1, 1, TOTAL_COLS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${project.name}  ·  Gantt Chart`;
  titleCell.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
  titleCell.fill = solidFill(accentArgb);
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 32;

  // ---- Row 2: Month bands ----
  sheet.getRow(2).height = 18;
  let monthStart = LEFT_COLS + 1;
  let curKey = '';
  let curLabel = '';
  let curCount = 0;

  const flushMonth = (endCol: number) => {
    if (!curKey) return;
    if (curCount === 1) {
      sheet.getCell(2, monthStart).value = curLabel;
    } else {
      sheet.mergeCells(2, monthStart, 2, endCol);
      sheet.getCell(2, monthStart).value = curLabel;
    }
    const mc = sheet.getCell(2, monthStart);
    mc.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
    mc.fill = solidFill(accentArgb);
    mc.alignment = { vertical: 'middle', horizontal: 'center' };
    // thin border bottom
    for (let c = monthStart; c <= endCol; c++) {
      const cell = sheet.getCell(2, c);
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    }
  };

  dayCols.forEach((col, i) => {
    const excelCol = LEFT_COLS + 1 + i;
    if (col.monthKey !== curKey) {
      flushMonth(excelCol - 1);
      monthStart = excelCol;
      curKey = col.monthKey;
      curLabel = col.monthLabel;
      curCount = 1;
    } else {
      curCount++;
    }
  });
  flushMonth(LEFT_COLS + dayCols.length);

  // Left info header cells for row 2
  ['#', 'Task Name', 'Dur.', 'Start', 'End'].forEach((h, i) => {
    const cell = sheet.getCell(2, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
    cell.fill = solidFill(accentArgb);
    cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
  });

  // ---- Row 3: Day headers ----
  sheet.getRow(3).height = 28;

  // Left header placeholders
  for (let c = 1; c <= LEFT_COLS; c++) {
    const cell = sheet.getCell(3, c);
    cell.fill = solidFill(accentArgb);
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } } };
  }

  dayCols.forEach((col, i) => {
    const excelCol = LEFT_COLS + 1 + i;
    const cell = sheet.getCell(3, excelCol);
    cell.value = col.dayName + '\n' + col.dateLabel;
    cell.font = {
      bold: col.isToday,
      size: 7,
      color: { argb: col.isToday ? 'FF1F2937' : 'FFFFFFFF' },
      name: 'Segoe UI',
    };
    cell.fill = solidFill(col.isToday ? TODAY_BG : accentArgb);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      left: col.isFriday ? { style: 'thin', color: { argb: 'FFFFFFFF' } } : undefined,
      bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } },
    };
  });

  // ---- Rows 4+: Task rows ----
  const parentIds = new Set<string>();
  flatList.forEach(({ isParent, task }) => { if (isParent) parentIds.add(task.id); });

  flatList.forEach(({ task, depth, wbs, isParent }, idx) => {
    const rowNum = idx + 4;
    const row = sheet.getRow(rowNum);
    row.height = isParent ? 18 : 16;

    const isEven = idx % 2 === 0;
    const rowBg = isParent ? accentLightArgb : (isEven ? 'FFFFFFFF' : 'FFF9FAFB');
    const textArgb = isParent ? accentArgb : 'FF1F2937';
    const indent = '  '.repeat(depth);

    // Left info columns
    const leftData: Array<{ v: ExcelJS.CellValue; align: ExcelJS.Alignment['horizontal'] }> = [
      { v: wbs, align: 'center' },
      { v: indent + task.name, align: 'left' },
      { v: task.durationDays, align: 'center' },
      { v: friendlyDate(task.plannedStartDate), align: 'center' },
      { v: friendlyDate(task.plannedEndDate), align: 'center' },
    ];
    leftData.forEach(({ v, align }, ci) => {
      applyDataCell(row.getCell(ci + 1), v, {
        bgArgb: rowBg,
        textArgb,
        bold: isParent,
        align,
      });
    });
    if (isParent) {
      row.getCell(1).border = {
        top: HAIR, bottom: HAIR,
        left: { style: 'medium', color: { argb: accentArgb } },
        right: THIN,
      };
    }

    // Bar colour: use status colour
    const barArgb = STATUS_ARGB[task.status];
    const barLightArgb = lighten(
      '#' + STATUS_ARGB[task.status].slice(2), // strip leading FF
      0.65,
    );

    const prog = progressFor(task, flatList.map(f => f.task), parentIds);
    const barProgCols = task.plannedStartDate && task.plannedEndDate
      ? dayCols.filter(c => c.dateStr >= task.plannedStartDate! && c.dateStr <= task.plannedEndDate!).length
      : 0;
    const progFillCount = Math.round((prog / 100) * barProgCols);

    let barColIdx = 0;
    dayCols.forEach((col, i) => {
      const excelCol = LEFT_COLS + 1 + i;
      const cell = row.getCell(excelCol);

      const inBar = !!(task.plannedStartDate && task.plannedEndDate &&
                       col.dateStr >= task.plannedStartDate &&
                       col.dateStr <= task.plannedEndDate);

      if (inBar) {
        const isProgFill = barColIdx < progFillCount;
        cell.fill = solidFill(isProgFill ? barArgb : barLightArgb);
        barColIdx++;

        // Write task name label in the first bar cell
        if (barColIdx === 1 && !isParent) {
          cell.value = task.name;
          cell.font = {
            bold: false, size: 7, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI',
          };
        }
        if (isParent) {
          cell.fill = solidFill(barArgb);
        }

        cell.border = {
          top: { style: 'hair', color: { argb: barArgb } },
          bottom: { style: 'hair', color: { argb: barArgb } },
        };
      } else {
        const colBg = col.isToday ? TODAY_BG : (col.isFriday ? FRIDAY_BG : rowBg);
        cell.fill = solidFill(colBg);
        cell.border = {
          top: HAIR, bottom: HAIR,
          left: col.isFriday ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined,
        };
      }
    });
  });

  // Freeze left cols + top 3 rows
  sheet.views = [{
    state: 'frozen',
    xSplit: LEFT_COLS,
    ySplit: 3,
    topLeftCell: 'F4',
    activeCell: 'A4',
  }];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function exportProjectToExcel(
  project: Project,
  tasks: Task[],
  consultants: Consultant[],
): Promise<void> {
  const projectTasks = tasks
    .filter(t => t.projectId === project.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const flatList = buildFlatList(projectTasks);

  const accent = getProjectAccent(project);
  const accentArgb = hexToArgb(accent);
  const accentLightArgb = lighten(accent, 0.88);
  const accentMidArgb = lighten(accent, 0.55);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pinnacle PM';
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  addTaskSheet(workbook, project, flatList, consultants, accentArgb, accentLightArgb, accentMidArgb);
  addGanttSheet(workbook, project, flatList, consultants, accentArgb, accentLightArgb);

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

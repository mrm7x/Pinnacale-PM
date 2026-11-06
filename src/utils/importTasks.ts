// Excel / CSV task import — parsing, validation and conversion to Task rows.
// Pure functions except readSpreadsheet/downloadTemplate (which touch File /
// the DOM). ExcelJS is already in the main bundle via exportToExcel.ts.

import ExcelJS from 'exceljs';
import type { Consultant, Task } from '../types';

export type TaskOwner = NonNullable<Task['taskOwner']>;

/** One parsed spreadsheet row, normalised and checked. */
export interface ImportRow {
  /** 1-based row number in the source file (for messages). */
  rowNumber: number;
  name: string;
  parentName: string;
  description: string;
  durationDays: number;
  assigneeId: string | null;
  assigneeLabel: string;
  status: Task['status'];
  dueDate: string | null;      // YYYY-MM-DD
  startDate: string | null;    // YYYY-MM-DD (fixed start)
  taskOwner: TaskOwner;
  pinkNumber: string;
  /** Blocking problems — the row is skipped. */
  errors: string[];
  /** Non-blocking: imported with a default value. */
  warnings: string[];
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Headers we didn't recognise (ignored). */
  unknownHeaders: string[];
  /** File-level problem (e.g. no Name column) — nothing can be imported. */
  fatal: string | null;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

type Field = 'name' | 'parent' | 'description' | 'duration' | 'assignee' | 'status' | 'due' | 'start' | 'owner' | 'pink';

/** Template column order + the header text written into the template. */
export const TEMPLATE_COLUMNS: { field: Field; header: string; example: string; note: string }[] = [
  { field: 'name',        header: 'Name',           example: 'Configure General Ledger', note: 'Required' },
  { field: 'parent',      header: 'Parent',         example: '',                         note: 'Name of a task higher up in this file (or already in the project) to nest under' },
  { field: 'description', header: 'Description',    example: 'Chart of accounts, dimensions', note: '' },
  { field: 'duration',    header: 'Duration (days)', example: '2',                       note: 'Number of days, halves allowed (e.g. 0.5)' },
  { field: 'assignee',    header: 'Assignee',       example: '',                         note: 'Consultant name or email' },
  { field: 'status',      header: 'Status',         example: 'Not Started',              note: 'Not Started, In Progress, On Hold, Completed' },
  { field: 'due',         header: 'Due Date',       example: '',                         note: 'Date (e.g. 2026-12-31 or 31/12/2026)' },
  { field: 'start',       header: 'Start Date',     example: '',                         note: 'Optional fixed start date' },
  { field: 'owner',       header: 'Task Owner',     example: 'Pinnacle',                 note: 'Pinnacle, Customer, or Pinnacle/Customer' },
  { field: 'pink',        header: 'Pink Number',    example: '',                         note: '' },
];

/** Header aliases, compared after normalising (lowercase, letters/digits only). */
const HEADER_ALIASES: Record<Field, string[]> = {
  name:        ['name', 'taskname', 'task', 'title'],
  parent:      ['parent', 'parenttask', 'parentname', 'parenttaskname'],
  description: ['description', 'notes', 'details', 'desc'],
  duration:    ['duration', 'durationdays', 'durationd', 'days', 'estimatedays', 'effortdays'],
  assignee:    ['assignee', 'assignedto', 'consultant', 'resource', 'assigned'],
  status:      ['status', 'state'],
  due:         ['duedate', 'due', 'deadline', 'enddate', 'finishdate'],
  start:       ['startdate', 'start', 'fixedstart', 'customstartdate'],
  owner:       ['taskowner', 'owner', 'ownedby'],
  pink:        ['pinknumber', 'pink', 'pinkno'],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

function mapHeaders(headers: string[]): { index: Partial<Record<Field, number>>; unknown: string[] } {
  const index: Partial<Record<Field, number>> = {};
  const unknown: string[] = [];
  headers.forEach((raw, i) => {
    const h = normHeader(raw);
    if (!h) return;
    const field = (Object.keys(HEADER_ALIASES) as Field[]).find(f => HEADER_ALIASES[f].includes(h));
    if (field && index[field] === undefined) index[field] = i;
    else if (!field) unknown.push(raw.trim());
  });
  return { index, unknown };
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? ymd(y, m, d) : null; // rejects 31/02
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Parse a date cell. Accepts JS Dates (from Excel date cells), Excel serial
 * numbers, ISO `YYYY-MM-DD`, UK `DD/MM/YYYY` (also `-` / `.`), and
 * `31 Dec 2026` / `Dec 31, 2026`. Returns undefined for blank, null for invalid.
 */
export function parseDateCell(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // ExcelJS returns date cells as UTC midnight.
    return ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // not a plausible Excel serial
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validYmd(y, +m[2], +m[1]); // UK day-first
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,})\.?,?[\s-]+(\d{4})$/i);
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mon === -1 ? null : validYmd(+m[3], mon + 1, +m[1]);
  }
  m = s.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (m) {
    const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mon === -1 ? null : validYmd(+m[3], mon + 1, +m[2]);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDateCell(Number(s));
  return null;
}

const STATUS_MAP: Record<string, Task['status']> = {
  notstarted: 'not_started', todo: 'not_started', new: 'not_started', open: 'not_started', pending: 'not_started',
  inprogress: 'in_progress', started: 'in_progress', wip: 'in_progress', active: 'in_progress', ongoing: 'in_progress',
  onhold: 'on_hold', hold: 'on_hold', blocked: 'on_hold', paused: 'on_hold', waiting: 'on_hold',
  completed: 'completed', complete: 'completed', done: 'completed', closed: 'completed', finished: 'completed',
};

const OWNER_MAP: Record<string, TaskOwner> = {
  pinnacle: 'Pinnacle', internal: 'Pinnacle', us: 'Pinnacle',
  customer: 'Customer', client: 'Customer',
  pinnaclecustomer: 'Pinnacle/Customer', customerpinnacle: 'Pinnacle/Customer',
  shared: 'Pinnacle/Customer', both: 'Pinnacle/Customer', joint: 'Pinnacle/Customer',
  pinncust: 'Pinnacle/Customer',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Match a consultant by full name, email, or a unique first name. */
export function matchConsultant(raw: string, consultants: Consultant[]): Consultant | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const byName = consultants.find(c => c.name.trim().toLowerCase() === s);
  if (byName) return byName;
  const byEmail = consultants.find(c => (c.email || '').trim().toLowerCase() === s);
  if (byEmail) return byEmail;
  const byFirst = consultants.filter(c => c.name.trim().toLowerCase().split(/\s+/)[0] === s);
  return byFirst.length === 1 ? byFirst[0] : null;
}

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

// ---------------------------------------------------------------------------
// Grid → rows
// ---------------------------------------------------------------------------

/**
 * Turn a 2-D grid (first non-empty row = headers) into validated rows.
 * `existingNames` are task names already in the project, usable as parents.
 */
export function parseGrid(grid: unknown[][], consultants: Consultant[], existingNames: string[]): ParsedImport {
  const headerIdx = grid.findIndex(r => r.some(c => cellText(c) !== ''));
  if (headerIdx === -1) return { rows: [], unknownHeaders: [], fatal: 'The file is empty.' };

  const headers = grid[headerIdx].map(cellText);
  const { index, unknown } = mapHeaders(headers);
  if (index.name === undefined) {
    return {
      rows: [], unknownHeaders: unknown,
      fatal: 'No "Name" column found. The first row must contain column headers, including Name (download the template to see the layout).',
    };
  }

  const get = (row: unknown[], f: Field): unknown => (index[f] === undefined ? undefined : row[index[f] as number]);
  const seenNames = new Set<string>();
  const existing = new Set(existingNames.map(n => n.trim().toLowerCase()));
  const rows: ImportRow[] = [];

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const raw = grid[r];
    if (!raw || raw.every(c => cellText(c) === '')) continue; // skip blank lines

    const errors: string[] = [];
    const warnings: string[] = [];

    const name = cellText(get(raw, 'name'));
    if (!name) errors.push('Name is missing');

    // Duration
    let durationDays = 0;
    const durRaw = cellText(get(raw, 'duration')).replace(/\s*d(ays?)?$/i, '');
    if (durRaw) {
      const n = Number(durRaw.replace(',', '.'));
      if (isNaN(n) || n < 0) errors.push(`Duration "${durRaw}" is not a number of days`);
      else {
        durationDays = Math.round(n * 2) / 2;
        if (durationDays !== n) warnings.push(`Duration rounded to ${durationDays} days`);
      }
    }

    // Dates
    const dueParsed = parseDateCell(get(raw, 'due'));
    if (dueParsed === null) errors.push(`Due date "${cellText(get(raw, 'due'))}" is not a date`);
    const startParsed = parseDateCell(get(raw, 'start'));
    if (startParsed === null) errors.push(`Start date "${cellText(get(raw, 'start'))}" is not a date`);

    // Status
    let status: Task['status'] = 'not_started';
    const statusRaw = cellText(get(raw, 'status'));
    if (statusRaw) {
      const s = STATUS_MAP[norm(statusRaw)];
      if (s) status = s;
      else warnings.push(`Unknown status "${statusRaw}" — set to Not Started`);
    }

    // Owner
    let taskOwner: TaskOwner = 'Pinnacle';
    const ownerRaw = cellText(get(raw, 'owner'));
    if (ownerRaw) {
      const o = OWNER_MAP[norm(ownerRaw)];
      if (o) taskOwner = o;
      else warnings.push(`Unknown task owner "${ownerRaw}" — set to Pinnacle`);
    }

    // Assignee
    const assigneeRaw = cellText(get(raw, 'assignee'));
    let assigneeId: string | null = null;
    let assigneeLabel = '';
    if (assigneeRaw) {
      const c = matchConsultant(assigneeRaw, consultants);
      if (c) { assigneeId = c.id; assigneeLabel = c.name; }
      else warnings.push(`No consultant matches "${assigneeRaw}" — left unassigned`);
    }

    // Parent: must be an earlier row in this file or an existing project task.
    const parentName = cellText(get(raw, 'parent'));
    if (parentName) {
      const key = parentName.toLowerCase();
      if (name && key === name.toLowerCase()) {
        warnings.push('A task cannot be its own parent — imported at top level');
      } else if (!seenNames.has(key) && !existing.has(key)) {
        warnings.push(`Parent "${parentName}" not found above this row or in the project — imported at top level`);
      }
    }

    if (name) seenNames.add(name.toLowerCase());

    rows.push({
      rowNumber: r + 1,
      name,
      parentName,
      description: cellText(get(raw, 'description')),
      durationDays,
      assigneeId,
      assigneeLabel,
      status,
      dueDate: dueParsed ?? null,
      startDate: startParsed ?? null,
      taskOwner,
      pinkNumber: cellText(get(raw, 'pink')),
      errors,
      warnings,
    });
  }

  if (rows.length === 0) return { rows, unknownHeaders: unknown, fatal: 'The file has headers but no task rows.' };
  return { rows, unknownHeaders: unknown, fatal: null };
}

// ---------------------------------------------------------------------------
// Rows → Task objects
// ---------------------------------------------------------------------------

/**
 * Build Task objects for every row without errors. Parents resolve to the
 * most recent earlier imported row with that name, else an existing project
 * task. New tasks go after the existing siblings in each group, in file order.
 */
export function buildTasks(
  rows: ImportRow[],
  projectId: string,
  existingTasks: Task[],
  makeId: () => string
): Task[] {
  const importedByName = new Map<string, string>();
  const existingByName = new Map<string, string>();
  existingTasks.forEach(t => {
    const k = t.name.trim().toLowerCase();
    if (!existingByName.has(k)) existingByName.set(k, t.id);
  });

  // Next free sortOrder per parent group (existing max + 10).
  const nextSort = new Map<string, number>();
  const groupKey = (p: string | null) => p ?? '__root__';
  existingTasks.forEach(t => {
    const k = groupKey(t.parentId ?? null);
    nextSort.set(k, Math.max(nextSort.get(k) ?? 0, t.sortOrder ?? 0));
  });

  const out: Task[] = [];
  for (const row of rows) {
    if (row.errors.length) continue;
    const id = makeId();
    let parentId: string | null = null;
    if (row.parentName) {
      const k = row.parentName.toLowerCase();
      if (k !== row.name.toLowerCase()) parentId = importedByName.get(k) ?? existingByName.get(k) ?? null;
    }
    const g = groupKey(parentId);
    const sortOrder = (nextSort.get(g) ?? 0) + 10;
    nextSort.set(g, sortOrder);

    out.push({
      id,
      projectId,
      parentId,
      name: row.name,
      description: row.description,
      durationDays: row.durationDays,
      assignedConsultantId: row.assigneeId,
      predecessorIds: [],
      status: row.status,
      pinkNumber: row.pinkNumber,
      sortOrder,
      customStartDate: row.startDate,
      progress: row.status === 'completed' ? 100 : 0,
      dueDate: row.dueDate,
      taskOwner: row.taskOwner,
      startPeriod: null,
    });
    importedByName.set(row.name.toLowerCase(), id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  // Excel in some locales saves "CSV" with semicolons; detect from the header line.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Plain value out of an ExcelJS cell value (formulas, rich text, hyperlinks). */
function excelValue(v: unknown): unknown {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  if ('result' in o) return excelValue(o.result);            // formula
  if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join('');
  if ('text' in o) return excelValue(o.text);                 // hyperlink
  if ('error' in o) return '';
  return String(v);
}

/** Read a .xlsx or .csv File into a 2-D grid of cell values. */
export async function readSpreadsheet(file: File): Promise<unknown[][]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || file.type === 'text/csv') {
    return parseCsv(await file.text());
  }
  if (lower.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported. In Excel, use File → Save As → Excel Workbook (.xlsx) or CSV.');
  }
  if (!lower.endsWith('.xlsx')) {
    throw new Error('Please choose an Excel (.xlsx) or CSV (.csv) file.');
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets.find(s => s.state !== 'hidden' && s.actualRowCount > 0) ?? wb.worksheets[0];
  if (!ws) return [];
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: unknown[] = [];
    // row.values is 1-based (index 0 unused).
    const raw = row.values as unknown[];
    for (let c = 1; c < raw.length; c++) values[c - 1] = excelValue(raw[c]);
    grid[rowNumber - 1] = values;
  });
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
  return grid;
}

/** Download a ready-to-fill .xlsx template (with an instructions sheet). */
export async function downloadTemplate(projectName: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tasks');
  ws.columns = TEMPLATE_COLUMNS.map(c => ({ header: c.header, key: c.field, width: Math.max(14, c.header.length + 4) }));
  ws.getColumn('name').width = 36;
  ws.getColumn('description').width = 36;
  ws.getColumn('parent').width = 28;
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3449' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Two example rows showing a parent and a sub-task.
  ws.addRow({ name: 'General Ledger setup', description: 'Phase 1 configuration', owner: 'Pinnacle', status: 'Not Started' });
  ws.addRow({ name: 'Configure chart of accounts', parent: 'General Ledger setup', duration: 2, status: 'Not Started', owner: 'Pinnacle' });
  ws.addRow({ name: 'Provide opening balances', parent: 'General Ledger setup', duration: 1, owner: 'Customer' });

  // Dropdowns for the constrained columns (rows 2–500).
  const colLetter = (field: Field) => ws.getColumn(field).letter;
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`${colLetter('status')}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Not Started,In Progress,On Hold,Completed"'],
    };
    ws.getCell(`${colLetter('owner')}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Pinnacle,Customer,Pinnacle/Customer"'],
    };
  }

  const help = wb.addWorksheet('How to use');
  help.columns = [{ header: 'Column', key: 'h', width: 20 }, { header: 'What to enter', key: 'n', width: 80 }];
  help.getRow(1).font = { bold: true };
  TEMPLATE_COLUMNS.forEach(c => help.addRow({ h: c.header, n: c.note || '—' }));
  help.addRow({});
  help.addRow({ h: 'Tips', n: 'Only Name is required. Delete the example rows before importing. You can also save this sheet as CSV.' });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Task import template - ${projectName}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Excel / CSV task import — parsing, validation and conversion to new or
// updated Task rows, plus the template / task-list export in the same layout.
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
  /** Task ID from the file ('' = a new task). Rows with an ID update that task. */
  taskId: string;
  /** Assignee cell text (non-empty even when no consultant matched). */
  assigneeRaw: string;
  /** Status / Task Owner cell held a recognised value (blank keeps an existing task's value). */
  statusGiven: boolean;
  ownerGiven: boolean;
  /** Blocking problems — the row is skipped. */
  errors: string[];
  /** Non-blocking: imported with a default value. */
  warnings: string[];
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Columns present in the file. On updates, only these fields are changed. */
  columns: Field[];
  /** Headers we didn't recognise (ignored). */
  unknownHeaders: string[];
  /** File-level problem (e.g. no Name column) — nothing can be imported. */
  fatal: string | null;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type Field = 'name' | 'parent' | 'description' | 'duration' | 'assignee' | 'status' | 'due' | 'start' | 'owner' | 'pink' | 'id';

/** Text of the Name column in the explanation row — also how the importer recognises (and skips) that row. */
export const NAME_NOTE = 'Required. The task name';

/**
 * Template column order, the header text, and the explanation written into
 * row 2 of the template / task-list export.
 */
export const TEMPLATE_COLUMNS: { field: Field; header: string; note: string }[] = [
  { field: 'name',        header: 'Name',            note: NAME_NOTE },
  { field: 'parent',      header: 'Parent',          note: 'Optional. Name of a task higher up in this file (or already in the project) to nest this one under' },
  { field: 'description', header: 'Description',     note: 'Optional. Free-text notes' },
  { field: 'duration',    header: 'Duration (days)', note: 'Number of days, halves allowed (e.g. 0.5)' },
  { field: 'assignee',    header: 'Assignee',        note: 'Consultant name or email' },
  { field: 'status',      header: 'Status',          note: 'Not Started, In Progress, On Hold or Completed (blank = Not Started)' },
  { field: 'due',         header: 'Due Date',        note: 'Date, e.g. 2026-12-31 or 31/12/2026' },
  { field: 'start',       header: 'Start Date',      note: 'Optional fixed start date' },
  { field: 'owner',       header: 'Task Owner',      note: 'Pinnacle, Customer or Pinnacle/Customer (blank = Pinnacle)' },
  { field: 'pink',        header: 'Pink Number',     note: 'Optional reference number' },
  { field: 'id',          header: 'Task ID',         note: 'Leave blank for new tasks. Filled in by "Export current tasks" so re-importing updates those tasks; do not edit' },
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
  id:          ['taskid', 'id'],
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
  if (headerIdx === -1) return { rows: [], columns: [], unknownHeaders: [], fatal: 'The file is empty.' };

  const headers = grid[headerIdx].map(cellText);
  const { index, unknown } = mapHeaders(headers);
  const columns = (Object.keys(index) as Field[]);
  if (index.name === undefined && index.id === undefined) {
    return {
      rows: [], columns, unknownHeaders: unknown,
      fatal: 'No "Name" column found. The first row must contain column headers, including Name (download the template to see the layout).',
    };
  }

  const get = (row: unknown[], f: Field): unknown => (index[f] === undefined ? undefined : row[index[f] as number]);
  /** Row 2 of our template/export explains each column — not a task. */
  const isNoteRow = (row: unknown[]) =>
    norm(cellText(get(row, 'name'))) === norm(NAME_NOTE) ||
    (index.name === undefined && norm(cellText(get(row, 'id'))) === norm(TEMPLATE_COLUMNS.find(c => c.field === 'id')!.note));
  const seenNames = new Set<string>();
  const seenIds = new Map<string, number>();
  const existing = new Set(existingNames.map(n => n.trim().toLowerCase()));
  const rows: ImportRow[] = [];

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const raw = grid[r];
    if (!raw || raw.every(c => cellText(c) === '')) continue; // skip blank lines
    if (isNoteRow(raw)) continue;

    const errors: string[] = [];
    const warnings: string[] = [];

    const taskId = cellText(get(raw, 'id'));
    if (taskId) {
      const first = seenIds.get(taskId);
      if (first !== undefined) errors.push(`Task ID ${taskId} is already used on row ${first}`);
      else seenIds.set(taskId, r + 1);
    }

    // Name is required for new tasks; on an update a blank name keeps the current one.
    const name = cellText(get(raw, 'name'));
    if (!name && !taskId) errors.push('Name is missing');

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

    const keepOr = (fallback: string) => (taskId ? 'left unchanged' : `set to ${fallback}`);

    // Status
    let status: Task['status'] = 'not_started';
    let statusGiven = false;
    const statusRaw = cellText(get(raw, 'status'));
    if (statusRaw) {
      const s = STATUS_MAP[norm(statusRaw)];
      if (s) { status = s; statusGiven = true; }
      else warnings.push(`Unknown status "${statusRaw}" — ${keepOr('Not Started')}`);
    }

    // Owner
    let taskOwner: TaskOwner = 'Pinnacle';
    let ownerGiven = false;
    const ownerRaw = cellText(get(raw, 'owner'));
    if (ownerRaw) {
      const o = OWNER_MAP[norm(ownerRaw)];
      if (o) { taskOwner = o; ownerGiven = true; }
      else warnings.push(`Unknown task owner "${ownerRaw}" — ${keepOr('Pinnacle')}`);
    }

    // Assignee
    const assigneeRaw = cellText(get(raw, 'assignee'));
    let assigneeId: string | null = null;
    let assigneeLabel = '';
    if (assigneeRaw) {
      const c = matchConsultant(assigneeRaw, consultants);
      if (c) { assigneeId = c.id; assigneeLabel = c.name; }
      else warnings.push(`No consultant matches "${assigneeRaw}" — ${taskId ? 'assignee left unchanged' : 'left unassigned'}`);
    }

    // Parent: must be an earlier row in this file or an existing project task.
    const parentName = cellText(get(raw, 'parent'));
    if (parentName) {
      const key = parentName.toLowerCase();
      if (name && key === name.toLowerCase()) {
        warnings.push('A task cannot be its own parent — placed at top level');
      } else if (!seenNames.has(key) && !existing.has(key)) {
        warnings.push(`Parent "${parentName}" not found above this row or in the project — placed at top level`);
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
      taskId,
      assigneeRaw,
      statusGiven,
      ownerGiven,
      errors,
      warnings,
    });
  }

  if (rows.length === 0) return { rows, columns, unknownHeaders: unknown, fatal: 'The file has headers but no task rows.' };
  return { rows, columns, unknownHeaders: unknown, fatal: null };
}

// ---------------------------------------------------------------------------
// Rows → new and updated tasks
// ---------------------------------------------------------------------------

export interface FieldChange { label: string; from: string; to: string }

export interface PlannedRow {
  row: ImportRow;
  action: 'create' | 'update' | 'unchanged' | 'skip';
  /** The resulting task (absent when skipped). */
  task?: Task;
  /** Name of the resulting parent ('' = top level). */
  parentLabel: string;
  /** For updates: what changes, old → new. */
  changes: FieldChange[];
  errors: string[];
  warnings: string[];
}

export interface ImportPlan {
  rows: PlannedRow[];
  created: Task[];
  updated: Task[];
}

const STATUS_TEXT: Record<Task['status'], string> = {
  not_started: 'Not Started', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed',
};

/**
 * Work out what importing `parsed` does. Rows with a Task ID that exists in
 * the project update that task; every other valid row becomes a new task.
 *
 * Updates only touch columns present in the file. Within a present column a
 * blank cell clears the value (description, duration, assignee, dates, pink
 * number, parent → top level), except Name, Status and Task Owner, which are
 * never blank on a task, so a blank cell keeps them.
 *
 * Parents resolve to the most recent earlier row in the file with that name,
 * else an existing project task. New tasks — and tasks moved to a new parent —
 * go after the existing siblings in that group, in file order.
 */
export function planImport(
  parsed: ParsedImport,
  projectId: string,
  existingTasks: Task[],
  consultants: Consultant[],
  makeId: () => string
): ImportPlan {
  const has = new Set(parsed.columns);
  const byId = new Map(existingTasks.map(t => [t.id, t]));
  const consultantName = new Map(consultants.map(c => [c.id, c.name]));

  const importedByName = new Map<string, string>();
  const existingByName = new Map<string, string>();
  existingTasks.forEach(t => {
    const k = t.name.trim().toLowerCase();
    if (!existingByName.has(k)) existingByName.set(k, t.id);
  });

  // Current name / parent of every task, kept up to date as rows apply.
  const nameOf = new Map(existingTasks.map(t => [t.id, t.name]));
  const parentOf = new Map(existingTasks.map(t => [t.id, t.parentId ?? null]));
  const isUnder = (id: string | null, ancestor: string): boolean => {
    for (let cur = id, n = 0; cur && n < 1000; cur = parentOf.get(cur) ?? null, n++) {
      if (cur === ancestor) return true;
    }
    return false;
  };

  // Next free sortOrder per parent group (existing max + 10).
  const nextSort = new Map<string, number>();
  const groupKey = (p: string | null) => p ?? '__root__';
  existingTasks.forEach(t => {
    const k = groupKey(t.parentId ?? null);
    nextSort.set(k, Math.max(nextSort.get(k) ?? 0, t.sortOrder ?? 0));
  });
  const takeSort = (parentId: string | null) => {
    const g = groupKey(parentId);
    const s = (nextSort.get(g) ?? 0) + 10;
    nextSort.set(g, s);
    return s;
  };

  const resolveParent = (row: ImportRow, selfName: string): string | null => {
    if (!row.parentName) return null;
    const k = row.parentName.toLowerCase();
    if (k === selfName.toLowerCase()) return null;
    return importedByName.get(k) ?? existingByName.get(k) ?? null;
  };

  const out: PlannedRow[] = [];
  const created: Task[] = [];
  const updated: Task[] = [];

  for (const row of parsed.rows) {
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    const existing = row.taskId ? byId.get(row.taskId) : undefined;
    if (row.taskId && !existing) {
      if (row.name) warnings.push(`Task ID ${row.taskId} is not in this project — added as a new task`);
      else errors.push(`Task ID ${row.taskId} is not in this project and the row has no Name`);
    }
    if (errors.length) {
      out.push({ row, action: 'skip', parentLabel: row.parentName, changes: [], errors, warnings });
      continue;
    }

    if (!existing) {
      // ---- New task ----
      const id = makeId();
      const parentId = resolveParent(row, row.name);
      const task: Task = {
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
        sortOrder: takeSort(parentId),
        customStartDate: row.startDate,
        progress: row.status === 'completed' ? 100 : 0,
        dueDate: row.dueDate,
        taskOwner: row.taskOwner,
        startPeriod: null,
      };
      created.push(task);
      importedByName.set(row.name.toLowerCase(), id);
      nameOf.set(id, row.name);
      parentOf.set(id, parentId);
      out.push({ row, action: 'create', task, parentLabel: parentId ? nameOf.get(parentId) ?? '' : '', changes: [], errors, warnings });
      continue;
    }

    // ---- Update an existing task ----
    const next: Task = { ...existing };
    if (has.has('name') && row.name) next.name = row.name;
    if (has.has('description')) next.description = row.description;
    if (has.has('duration')) next.durationDays = row.durationDays;
    if (has.has('assignee') && (!row.assigneeRaw || row.assigneeId)) next.assignedConsultantId = row.assigneeId;
    if (has.has('status') && row.statusGiven) {
      next.status = row.status;
      if (row.status === 'completed' && existing.status !== 'completed') next.progress = 100;
    }
    if (has.has('due')) next.dueDate = row.dueDate;
    if (has.has('start')) next.customStartDate = row.startDate;
    if (has.has('owner') && row.ownerGiven) next.taskOwner = row.taskOwner;
    if (has.has('pink')) next.pinkNumber = row.pinkNumber;

    if (has.has('parent')) {
      const currentParent = existing.parentId ?? null;
      const currentParentName = currentParent ? (nameOf.get(currentParent) ?? '') : '';
      let target: string | null;
      if (row.parentName && currentParent && currentParentName.toLowerCase() === row.parentName.toLowerCase()) {
        target = currentParent; // same parent — don't let a duplicate name move it
      } else {
        target = resolveParent(row, next.name);
      }
      if (target && isUnder(target, existing.id)) {
        warnings.push(`Can't move under "${row.parentName}" — it is this task or one of its sub-tasks; parent left unchanged`);
        target = currentParent;
      }
      if (target !== currentParent) {
        next.parentId = target;
        next.sortOrder = takeSort(target);
        parentOf.set(existing.id, target);
      }
    }

    importedByName.set(next.name.toLowerCase(), existing.id);
    nameOf.set(existing.id, next.name);

    const changes = diffTasks(existing, next, consultantName, nameOf);
    const parentLabel = next.parentId ? nameOf.get(next.parentId) ?? '' : '';
    if (changes.length) updated.push(next);
    out.push({ row, action: changes.length ? 'update' : 'unchanged', task: next, parentLabel, changes, errors, warnings });
  }

  return { rows: out, created, updated };
}

function diffTasks(a: Task, b: Task, consultantName: Map<string, string>, nameOf: Map<string, string>): FieldChange[] {
  const out: FieldChange[] = [];
  const add = (label: string, from: string, to: string) => { if (from !== to) out.push({ label, from: from || '—', to: to || '—' }); };
  const who = (id: string | null) => (id ? consultantName.get(id) ?? 'Unknown' : '');
  const parent = (id: string | null | undefined) => (id ? nameOf.get(id) ?? '' : '(top level)');
  add('Name', a.name, b.name);
  if ((a.parentId ?? null) !== (b.parentId ?? null)) out.push({ label: 'Parent', from: parent(a.parentId), to: parent(b.parentId) });
  add('Description', a.description || '', b.description || '');
  add('Duration', a.durationDays ? `${a.durationDays} d` : '', b.durationDays ? `${b.durationDays} d` : '');
  add('Assignee', who(a.assignedConsultantId), who(b.assignedConsultantId));
  add('Status', STATUS_TEXT[a.status], STATUS_TEXT[b.status]);
  add('Due', a.dueDate || '', b.dueDate || '');
  add('Start', a.customStartDate || '', b.customStartDate || '');
  add('Owner', a.taskOwner || 'Pinnacle', b.taskOwner || 'Pinnacle');
  add('Pink number', a.pinkNumber || '', b.pinkNumber || '');
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

/** One spreadsheet row in the import layout, keyed by field. */
type SheetRow = Partial<Record<Field, string | number | Date>>;

/**
 * Add the "Tasks" sheet in the import layout: header row, an explanation row,
 * then `rows`. Dropdowns cover the data rows.
 */
function addTaskSheet(wb: ExcelJS.Workbook, rows: SheetRow[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Tasks');
  ws.columns = TEMPLATE_COLUMNS.map(c => ({ header: c.header, key: c.field, width: Math.max(16, c.header.length + 4) }));
  ws.getColumn('name').width = 36;
  ws.getColumn('description').width = 36;
  ws.getColumn('parent').width = 28;
  ws.getColumn('id').width = 16;
  ws.getColumn('due').numFmt = 'yyyy-mm-dd';
  ws.getColumn('start').numFmt = 'yyyy-mm-dd';

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3449' } };

  // Row 2: what goes in each column. The importer skips this row.
  const notes = ws.addRow(Object.fromEntries(TEMPLATE_COLUMNS.map(c => [c.field, c.note])));
  notes.font = { italic: true, size: 9, color: { argb: 'FF5B6B7B' } };
  notes.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F4F7' } };
  notes.alignment = { wrapText: true, vertical: 'top' };
  notes.height = 42;
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  rows.forEach(r => ws.addRow(r));

  // Dropdowns for the constrained columns (data rows only).
  const last = Math.max(500, rows.length + 200);
  const colLetter = (field: Field) => ws.getColumn(field).letter;
  for (let r = 3; r <= last; r++) {
    ws.getCell(`${colLetter('status')}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Not Started,In Progress,On Hold,Completed"'],
    };
    ws.getCell(`${colLetter('owner')}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Pinnacle,Customer,Pinnacle/Customer"'],
    };
  }
  return ws;
}

function addHelpSheet(wb: ExcelJS.Workbook, tip: string) {
  const help = wb.addWorksheet('How to use');
  help.columns = [{ header: 'Column', key: 'h', width: 20 }, { header: 'What to enter', key: 'n', width: 80 }];
  help.getRow(1).font = { bold: true };
  TEMPLATE_COLUMNS.forEach(c => help.addRow({ h: c.header, n: c.note }));
  help.addRow({});
  help.addRow({ h: 'Tips', n: tip });
}

async function saveWorkbook(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[\\/:*?"<>|]/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** YYYY-MM-DD → a UTC-midnight Date, so Excel shows a real date cell. */
function dateCell(v: string | null | undefined): Date | undefined {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : undefined;
}

/**
 * Project tasks as import-layout rows, parents before their children (in
 * sort order), so the Parent column resolves when the file is imported.
 */
export function tasksToSheetRows(tasks: Task[], consultants: Consultant[]): SheetRow[] {
  const ids = new Set(tasks.map(t => t.id));
  const byId = new Map(tasks.map(t => [t.id, t]));
  const children = new Map<string, Task[]>();
  tasks.forEach(t => {
    const k = t.parentId && ids.has(t.parentId) ? t.parentId : '__root__';
    const list = children.get(k);
    if (list) list.push(t); else children.set(k, [t]);
  });
  children.forEach(list => list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
  const consultantName = new Map(consultants.map(c => [c.id, c.name]));

  const out: SheetRow[] = [];
  const visited = new Set<string>();
  const visit = (t: Task) => {
    if (visited.has(t.id)) return; // guard against a parent cycle
    visited.add(t.id);
    const parent = t.parentId ? byId.get(t.parentId) : undefined;
    out.push({
      name: t.name,
      parent: parent?.name ?? '',
      description: t.description || '',
      duration: t.durationDays || '',
      assignee: (t.assignedConsultantId && consultantName.get(t.assignedConsultantId)) || '',
      status: STATUS_TEXT[t.status] ?? '',
      due: dateCell(t.dueDate) ?? '',
      start: dateCell(t.customStartDate) ?? '',
      owner: t.taskOwner || 'Pinnacle',
      pink: t.pinkNumber || '',
      id: t.id,
    });
    (children.get(t.id) ?? []).forEach(visit);
  };
  (children.get('__root__') ?? []).forEach(visit);
  return out;
}

/** Download a ready-to-fill .xlsx template (with an instructions sheet). */
export async function downloadTemplate(projectName: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  // Example rows showing a parent and its sub-tasks.
  addTaskSheet(wb, [
    { name: 'General Ledger setup', description: 'Phase 1 configuration', owner: 'Pinnacle', status: 'Not Started' },
    { name: 'Configure chart of accounts', parent: 'General Ledger setup', duration: 2, status: 'Not Started', owner: 'Pinnacle' },
    { name: 'Provide opening balances', parent: 'General Ledger setup', duration: 1, owner: 'Customer' },
  ]);
  addHelpSheet(wb, 'Only Name is required. Leave Task ID blank. Row 2 explains each column and is ignored on import. Delete the example rows before importing. You can also save this sheet as CSV.');
  await saveWorkbook(wb, `Task import template - ${projectName}.xlsx`);
}

/** Download the project's current tasks in the import layout. */
export async function downloadTaskList(projectName: string, tasks: Task[], consultants: Consultant[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  addTaskSheet(wb, tasksToSheetRows(tasks, consultants));
  addHelpSheet(wb, 'This is the current task list in the import layout. Row 2 explains each column and is ignored on import. Edit it and import it back to update these tasks: rows keep their Task ID, so they update the matching task. Rows without a Task ID are added as new tasks. Deleting a row does not delete the task.');
  await saveWorkbook(wb, `Task list - ${projectName}.xlsx`);
}

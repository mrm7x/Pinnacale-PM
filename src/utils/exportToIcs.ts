import type { Project, Task, Consultant } from '../types';
// Explicit .ts extension (allowed by allowImportingTsExtensions) so scripts/
// exportToIcs.selfcheck.ts can run this module under plain `node` with no bundler.
import { parseDate, formatDate, getSchedulePoint } from './scheduler.ts';

/*
 * Calendar export for one consultant on one project.
 *
 * The pipeline has exactly one place that reads Task objects:
 *
 *   selectCalendarTasks()   which tasks       (leaf tasks only, filtered, stably ordered)
 *   planAppointments()      -> Appointment[]  (immutable per-day snapshots, built per task id)
 *   renderIcs / renderSummaryText / renderSummaryHtml / renderEml
 *
 * Every renderer works from the Appointment snapshots alone and never looks a
 * task up again, so an appointment's title, description, dates and owner can
 * only ever come from the one task it was built from. The on-screen preview,
 * the .ics and the email are all produced by prepareCalendarExport() from the
 * same list, so they cannot disagree with each other.
 *
 * Previous defects this replaces:
 *  - Parent (phase) tasks were exported as appointments of their own. Assigning
 *    a phase with "apply to subtasks" assigns the parent too, so every working
 *    day of the phase got an extra 09:30-17:00 "Define Stage (n/15)" booking
 *    carrying the phase's description, stacked on top of the real task — the
 *    consultant opened an appointment and read a description that belonged to
 *    something else, and the effort total double-counted.
 *  - The description did not name the task, phase or day it described.
 *  - The email listed task names only, with no descriptions at all.
 *  - Multi-day UIDs were numbered by position ("-2"), so after a reschedule
 *    the same UID referred to a different day.
 *  - The sort comparator never returned 0, so equal start dates had no
 *    defined order.
 */

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545) text helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a TEXT property value. Unescaped commas/semicolons are treated as
 * value separators by Outlook, which silently truncates the property; escaping
 * newlines also stops a task name from injecting extra VEVENT blocks. Control
 * characters are stripped — RFC 5545 forbids them in TEXT and a single stray
 * one (pasted from Excel or Word) makes Outlook reject the whole file.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

/**
 * Folds a content line to 75 octets, continuation lines starting with a space.
 * Measured in UTF-8 bytes, not characters, so a multi-byte glyph is never split.
 */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;

  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    if (curBytes + chBytes > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // continuation lines lose one octet to the leading space
    }
    cur += ch;
    curBytes += chBytes;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** YYYY-MM-DD -> YYYYMMDD */
function icsDate(ymd: string): string {
  return ymd.replace(/-/g, '');
}

/**
 * DTEND on an all-day event is exclusive, so a task ending on the 5th needs a
 * DTEND of the 6th. Uses parseDate/formatDate so month and year rollovers go
 * through the same local-time logic as the rest of the scheduler.
 */
export function dayAfter(ymd: string): string {
  const d = parseDate(ymd);
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

/**
 * Written as floating local time (no timezone), so 09:30 stays 09:30 for the
 * consultant regardless of where their mailbox thinks it is — and no VTIMEZONE
 * block is needed. Tune here.
 */
const HOURS = {
  AM: { start: '093000', end: '123000' },
  PM: { start: '140000', end: '170000' },
  DAY: { start: '093000', end: '170000' },
} as const;

/** Outlook category applied to every exported appointment. */
const CATEGORY = 'Chargable';

const STATUS_LABEL: Record<Task['status'], string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
};

/**
 * Which half of the day a task occupies, or null if it is not a half-day task.
 * Tasks saved before the AM/PM option existed have no stored period and default
 * to the morning.
 */
export function halfDayPeriod(task: Task): 'AM' | 'PM' | null {
  const { startHalfDay: s, endHalfDay: e } = task;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s !== e) return null;
  return task.startPeriod ?? 'AM';
}

/** One working day of a task, timed by how much of the day it occupies. */
export interface DaySlot {
  date: string;   // YYYY-MM-DD
  start: string;  // HHMMSS
  end: string;
  days: 0.5 | 1;
}

/**
 * The working days a task occupies. Walking the half-day indices through
 * getSchedulePoint means weekends are skipped by exactly the same rule the plan
 * uses. Returns [] when the task has no usable schedule; the caller then falls
 * back to an all-day event over the planned dates.
 */
export function daySlots(task: Task, projectStartDate: string): DaySlot[] {
  const { startHalfDay: s, endHalfDay: e } = task;

  const period = halfDayPeriod(task);
  if (period && task.plannedStartDate) {
    return [{ date: task.plannedStartDate, ...HOURS[period], days: 0.5 }];
  }

  // Without a project start date the half-day indices have nothing to resolve against.
  if (!projectStartDate) return [];
  if (!Number.isFinite(s) || !Number.isFinite(e) || e! < s!) return [];
  // A corrupt index pair must not spin out thousands of events. Raise this if
  // a genuine task ever runs longer than ~a year of working days.
  if (e! - s! > 500) return [];

  const byDate = new Map<string, Set<'AM' | 'PM'>>();
  for (let i = s!; i <= e!; i++) {
    const point = getSchedulePoint(projectStartDate, i);
    const periods = byDate.get(point.date) ?? new Set<'AM' | 'PM'>();
    periods.add(point.period);
    byDate.set(point.date, periods);
  }

  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, periods]): DaySlot => periods.size === 2
      ? { date, ...HOURS.DAY, days: 1 }
      : { date, ...HOURS[periods.has('AM') ? 'AM' : 'PM'], days: 0.5 });
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * How customer-owned tasks are treated. They are the customer's own work rather
 * than the consultant's, so they stay out of the diary unless asked for.
 * 'Pinnacle/Customer' is shared work and is never treated as customer-owned.
 */
export type CustomerTaskMode = 'exclude' | 'include' | 'only';

export interface CalendarFilter {
  consultantId: string;
  fromDate: string;
  /** Empty means no upper bound. */
  toDate?: string;
  customerTasks?: CustomerTaskMode;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The leaf tasks of one project assigned to one consultant whose planned start
 * falls within [fromDate, toDate].
 *
 * Parent tasks are never exported: their dates are a rollup of their children,
 * so a parent appointment would double-book every day already covered by the
 * real work — with the phase's description instead of the task's.
 *
 * The date range is the user's de-duplication control: re-exporting from a
 * later date avoids re-adding appointments already in the diary.
 */
export function selectCalendarTasks(project: Project, tasks: Task[], filter: CalendarFilter): Task[] {
  const { consultantId, fromDate, toDate = '', customerTasks = 'exclude' } = filter;
  const projectTasks = tasks.filter(t => t.projectId === project.id);
  const parentIds = new Set(projectTasks.map(t => t.parentId).filter((id): id is string => !!id));

  return projectTasks
    .filter(t =>
      !parentIds.has(t.id) &&
      t.assignedConsultantId === consultantId &&
      !!t.plannedStartDate &&
      !!t.plannedEndDate &&
      t.plannedStartDate >= fromDate &&
      (!toDate || t.plannedStartDate <= toDate) &&
      (customerTasks === 'include' || (t.taskOwner === 'Customer') === (customerTasks === 'only')),
    )
    .sort((a, b) =>
      compareText(a.plannedStartDate!, b.plannedStartDate!) ||
      (a.startHalfDay ?? 0) - (b.startHalfDay ?? 0) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      compareText(a.id, b.id));
}

// ---------------------------------------------------------------------------
// Appointments — immutable per-day snapshots of one task each
// ---------------------------------------------------------------------------

/** One appointment exactly as it will appear in the diary and the email. */
export interface Appointment {
  readonly uid: string;
  readonly taskId: string;
  readonly taskName: string;
  /** The task's own description, trimmed. */
  readonly taskDescription: string;
  /** Name of the parent (phase) task, if any. */
  readonly phase: string | null;
  readonly pinkNumber: string;
  readonly status: string;
  readonly owner: string;
  /** SUMMARY line: "Project: Task", plus "(2/3)" on multi-day tasks. */
  readonly title: string;
  /** Full DESCRIPTION text (unescaped), built from this task only. */
  readonly details: string;
  readonly date: string;            // YYYY-MM-DD, the day it lands on
  /** Clock times, or null for an all-day fallback. */
  readonly start: string | null;    // HHMMSS
  readonly end: string | null;
  /** Exclusive end date, all-day fallback only. */
  readonly allDayUntil: string | null;
  readonly dayIndex: number;        // 1-based
  readonly dayCount: number;
  /** Effort booked, in days (0.5 / 1; all-day fallback counts its working span as 1). */
  readonly days: number;
}

function buildDetails(
  project: Project,
  task: Task,
  phase: string | null,
  dayIndex: number,
  dayCount: number,
): string {
  const description = (task.description ?? '').trim();
  const facts = [
    `Task: ${task.name}`,
    phase ? `Phase: ${phase}` : '',
    dayCount > 1 ? `Day ${dayIndex} of ${dayCount}` : '',
    task.pinkNumber ? `Pink #: ${task.pinkNumber}` : '',
    `Status: ${STATUS_LABEL[task.status] ?? task.status}`,
    task.taskOwner && task.taskOwner !== 'Pinnacle' ? `Owner: ${task.taskOwner}` : '',
    `Project: ${project.name}`,
    `Client: ${project.clientName}`,
  ].filter(Boolean);
  return description ? `${description}\n\n${facts.join('\n')}` : facts.join('\n');
}

/**
 * Expands the selected tasks into appointments. Each task is processed on its
 * own and every value on its appointments is copied from that task (looked up
 * by id for the phase name), so nothing can shift onto a neighbouring task.
 *
 * `allTasks` is only used to resolve parent names; it may contain any project.
 */
export function planAppointments(project: Project, allTasks: Task[], selected: Task[]): Appointment[] {
  const byId = new Map(allTasks.map(t => [t.id, t] as const));

  const list = selected.flatMap((task): Appointment[] => {
    // Snapshot every value up front: the appointment must not hold a live
    // reference that a later edit (or another task) could change.
    const phase = task.parentId ? byId.get(task.parentId)?.name ?? null : null;
    const base = {
      taskId: task.id,
      taskName: task.name,
      taskDescription: (task.description ?? '').trim(),
      phase,
      pinkNumber: task.pinkNumber ?? '',
      status: STATUS_LABEL[task.status] ?? task.status,
      owner: task.taskOwner ?? 'Pinnacle',
    };
    const name = `${project.name}: ${task.name}`;

    // Persisted columns: one inverted row must not emit DTEND before DTSTART,
    // because Outlook rejects the whole file rather than skipping the event.
    const startDate = task.plannedStartDate!;
    const endDate = task.plannedEndDate! < startDate ? startDate : task.plannedEndDate!;

    const slots = daySlots(task, project.startDate);
    if (slots.length === 0) {
      return [Object.freeze({
        ...base,
        uid: `${task.id}@pinnacle-flow`,
        title: name,
        details: buildDetails(project, task, phase, 1, 1),
        date: startDate,
        start: null,
        end: null,
        allDayUntil: dayAfter(endDate),
        dayIndex: 1,
        dayCount: 1,
        days: 1,
      })];
    }

    const count = slots.length;
    return slots.map((slot, i) => Object.freeze({
      ...base,
      // Keyed by task id AND date, never by position: each day is its own
      // event, and the same UID always means the same task on the same day.
      uid: count > 1 ? `${task.id}-${icsDate(slot.date)}@pinnacle-flow` : `${task.id}@pinnacle-flow`,
      title: count > 1 ? `${name} (${i + 1}/${count})` : name,
      details: buildDetails(project, task, phase, i + 1, count),
      date: slot.date,
      start: slot.start,
      end: slot.end,
      allDayUntil: null,
      dayIndex: i + 1,
      dayCount: count,
      days: slot.days,
    }));
  });

  // Diary order: by day, then time of day. Ties keep selection order (stable sort).
  return list.sort((a, b) =>
    compareText(a.date, b.date) || compareText(a.start ?? '', b.start ?? ''));
}

// ---------------------------------------------------------------------------
// .ics
// ---------------------------------------------------------------------------

export function renderIcs(
  project: Project,
  consultant: Consultant,
  list: readonly Appointment[],
  now = new Date(),
): string {
  const stamp = utcStamp(now);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pinnacle Flow//Project Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${project.name} - ${consultant.name}`)}`,
  ];

  for (const a of list) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.uid}`,
      `DTSTAMP:${stamp}`,
      ...(a.start
        ? [`DTSTART:${icsDate(a.date)}T${a.start}`, `DTEND:${icsDate(a.date)}T${a.end}`]
        : [`DTSTART;VALUE=DATE:${icsDate(a.date)}`, `DTEND;VALUE=DATE:${icsDate(a.allDayUntil!)}`]),
      `SUMMARY:${escapeIcsText(a.title)}`,
      `DESCRIPTION:${escapeIcsText(a.details)}`,
      `CATEGORIES:${escapeIcsText(CATEGORY)}`,
      // All-day events import as Free in Outlook unless told otherwise.
      'TRANSP:OPAQUE',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Summary (on-screen preview, clipboard and email body)
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 2026-08-10 -> "Mon 10 Aug 2026" */
export function longDate(ymd: string): string {
  const d = parseDate(ymd);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 093000 -> "09:30" */
function clock(hhmmss: string): string {
  return `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}`;
}

function slotLabel(a: Appointment): string {
  return a.start ? `${clock(a.start)} - ${clock(a.end!)}` : 'All day';
}

/** "Data migration (2/3)" — the task name as it reads in the summary row. */
function rowTaskLabel(a: Appointment): string {
  return a.dayCount > 1 ? `${a.taskName} (${a.dayIndex}/${a.dayCount})` : a.taskName;
}

/** The task's description is shown once, on its first day. */
function showsDescription(a: Appointment): boolean {
  return a.dayIndex === 1 && a.taskDescription !== '';
}

function totalDays(list: readonly Appointment[]): number {
  return list.reduce((sum, a) => sum + a.days, 0);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "from Mon 10 Aug 2026", or "… to Fri 14 Aug 2026" when an end date is set. */
export function rangeLabel(fromDate: string, toDate: string): string {
  return `from ${longDate(fromDate)}${toDate ? ` to ${longDate(toDate)}` : ''}`;
}

/** Plain-text summary of everything in the calendar file. */
export function renderSummaryText(
  project: Project,
  consultant: Consultant,
  list: readonly Appointment[],
  fromDate: string,
  toDate = '',
): string {
  const indent = ' '.repeat(2 + 16 + 2 + 15 + 2);
  const rows = list.flatMap(a => {
    const row = `  ${longDate(a.date).padEnd(16)}  ${slotLabel(a).padEnd(15)}  ${rowTaskLabel(a)}`;
    if (!showsDescription(a)) return [row];
    return [row, ...a.taskDescription.split(/\r\n|\r|\n/).map(l => `${indent}${l}`)];
  });

  const total = totalDays(list);
  return [
    `Bookings for ${project.name}`,
    `${consultant.name} · ${project.clientName}`,
    `${plural(list.length, 'appointment')} ${rangeLabel(fromDate, toDate)}`,
    '',
    ...rows,
    '',
    `Total: ${plural(total, 'day')} of effort across ${plural(new Set(list.map(a => a.date)).size, 'working day')}.`,
    '',
    'The attached .ics adds these to your Outlook calendar:',
    'File > Open & Export > Import/Export > Import an iCalendar (.ics) file > Import.',
  ].join('\n');
}

/**
 * The same summary as a simple table, for the body of the email draft and for
 * the clipboard.
 *
 * Outlook renders HTML with the Word engine, which drops <style> blocks and
 * does not inherit the body font into a table — so every style is inline and
 * the font is repeated on each cell, otherwise a pasted table falls back to
 * Times New Roman.
 */
export function renderSummaryHtml(
  project: Project,
  consultant: Consultant,
  list: readonly Appointment[],
  fromDate: string,
  toDate = '',
): string {
  // Single quotes: a family name with a space must be quoted to be valid CSS,
  // and these strings sit inside double-quoted style attributes.
  const font = "font-family:'Segoe UI',Arial,sans-serif;";
  const cell = `${font}padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#1f2937;vertical-align:top;`;
  const note = `${font}font-size:12px;color:#6b7280;margin-top:2px;`;

  const rows = list.map(a => {
    const desc = showsDescription(a)
      ? `<div style="${note}">${escapeHtml(a.taskDescription).replace(/\r\n|\r|\n/g, '<br>')}</div>`
      : '';
    return `      <tr>
        <td style="${cell}white-space:nowrap;">${escapeHtml(longDate(a.date))}</td>
        <td style="${cell}white-space:nowrap;">${escapeHtml(slotLabel(a))}</td>
        <td style="${cell}">${escapeHtml(rowTaskLabel(a))}${desc}</td>
      </tr>`;
  }).join('\n');

  const head = `${font}padding:6px 12px;border-bottom:2px solid #2d4a65;font-size:12px;text-align:left;color:#2d4a65;`;
  const para = `${font}font-size:13px;color:#1f2937;`;
  const total = totalDays(list);

  return `<html><body style="${font}color:#1f2937;">
    <p style="${para}">Hi ${escapeHtml(consultant.name.split(' ')[0])},</p>
    <p style="${para}">Here are your bookings for <strong>${escapeHtml(project.name)}</strong> (${escapeHtml(project.clientName)})
       ${escapeHtml(rangeLabel(fromDate, toDate))} &mdash; ${plural(list.length, 'appointment')},
       ${plural(total, 'day')} in total.</p>
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr><th style="${head}">Date</th><th style="${head}">Time</th><th style="${head}">Task</th></tr>
${rows}
    </table>
    <p style="${font}font-size:13px;color:#6b7280;">To add these to your calendar, open the attached .ics and use
       <strong>File &gt; Open &amp; Export &gt; Import/Export &gt; Import an iCalendar (.ics) file &gt; Import</strong>.
       Opening it by double-click shows it as a separate calendar instead of adding to your diary.</p>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// Outlook email draft (.eml)
// ---------------------------------------------------------------------------

/** UTF-8 safe base64, wrapped at 76 characters as MIME requires. */
function base64Lines(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return (btoa(binary).match(/.{1,76}/g) ?? []).join('\r\n');
}

/**
 * Encodes a header value that may contain non-ASCII (RFC 2047). Line breaks are
 * flattened first: a project name containing one would end the header and let
 * anything typed after it become a real header (Bcc:, …) in the sent message.
 */
function encodeHeader(value: string): string {
  const flat = value.replace(/[\r\n]+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7f]/.test(flat)) return flat;
  const bytes = new TextEncoder().encode(flat);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return `=?utf-8?B?${btoa(binary)}?=`;
}

/**
 * An .eml Outlook opens as an editable, unsent draft (X-Unsent). The calendar
 * rides along as a plain attachment rather than text/calendar, so Outlook does
 * not treat it as a meeting request addressed to the sender.
 */
export function renderEml(
  project: Project,
  consultant: Consultant,
  htmlBody: string,
  icsContent: string,
  icsFilename: string,
  now = new Date(),
): string {
  const boundary = `----pinnacle-${now.getTime().toString(36)}`;
  // A quote would close the filename parameter early, so drop those too.
  const safeName = icsFilename.replace(/[\r\n"]+/g, ' ').trim();

  return [
    `To: ${encodeHeader(consultant.email || '')}`,
    `Subject: ${encodeHeader(`Bookings for ${project.name}`)}`,
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(htmlBody),
    '',
    `--${boundary}`,
    `Content-Type: application/octet-stream; name="${safeName}"`,
    `Content-Disposition: attachment; filename="${safeName}"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(icsContent),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export type CalendarFormat = 'ics' | 'eml';

export interface CalendarExport {
  appointments: readonly Appointment[];
  ics: string;
  icsFilename: string;
  emlFilename: string;
  text: string;
  html: string;
}

/**
 * Everything one export produces, from one list of appointments. The preview,
 * the clipboard copy, the .ics and the email are all taken from this, so they
 * always describe the same bookings. Null when nothing matches the filter.
 */
export function prepareCalendarExport(
  project: Project,
  tasks: Task[],
  consultant: Consultant,
  fromDate: string,
  toDate = '',
  customerTasks: CustomerTaskMode = 'exclude',
  now = new Date(),
): CalendarExport | null {
  const selected = selectCalendarTasks(project, tasks, { consultantId: consultant.id, fromDate, toDate, customerTasks });
  if (selected.length === 0) return null;

  const list = planAppointments(project, tasks, selected);
  const stem = `${project.name} - ${consultant.name}`;
  return {
    appointments: list,
    ics: renderIcs(project, consultant, list, now),
    icsFilename: `${stem} - Calendar.ics`,
    emlFilename: `${stem} - Bookings.eml`,
    text: renderSummaryText(project, consultant, list, fromDate, toDate),
    html: renderSummaryHtml(project, consultant, list, fromDate, toDate),
  };
}

/** The shareable summary on its own, for the export modal. Empty when nothing matches. */
export function consultantSummary(
  project: Project,
  tasks: Task[],
  consultant: Consultant,
  fromDate: string,
  toDate = '',
  customerTasks: CustomerTaskMode = 'exclude',
): { text: string; html: string } {
  const result = prepareCalendarExport(project, tasks, consultant, fromDate, toDate, customerTasks);
  return result ? { text: result.text, html: result.html } : { text: '', html: '' };
}

function download(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Downloads the consultant's calendar as an .ics, or as an Outlook draft email
 * (.eml) with the summary in the body and the .ics attached. Returns the number
 * of appointments written so the caller can warn when the filter matched nothing.
 *
 * To land these in the main Outlook diary the user must import rather than open:
 * File > Open & Export > Import/Export > Import an iCalendar (.ics) file > Import.
 */
export function exportConsultantCalendar(
  project: Project,
  tasks: Task[],
  consultant: Consultant,
  fromDate: string,
  toDate = '',
  format: CalendarFormat = 'ics',
  customerTasks: CustomerTaskMode = 'exclude',
): number {
  const now = new Date();
  const result = prepareCalendarExport(project, tasks, consultant, fromDate, toDate, customerTasks, now);
  if (!result) return 0;

  if (format === 'eml') {
    download(
      renderEml(project, consultant, result.html, result.ics, result.icsFilename, now),
      result.emlFilename,
      'message/rfc822',
    );
  } else {
    download(result.ics, result.icsFilename, 'text/calendar;charset=utf-8');
  }
  return result.appointments.length;
}

import type { Project, Task, Consultant } from '../types';
// Explicit .ts extension (allowed by allowImportingTsExtensions) so scripts/
// exportToIcs.selfcheck.ts can run this module under plain `node` with no bundler.
import { parseDate, formatDate, getSchedulePoint } from './scheduler.ts';

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545) text helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a TEXT property value. Unescaped commas/semicolons are treated as
 * value separators by Outlook, which silently truncates the property; escaping
 * newlines also stops a task name from injecting extra VEVENT blocks.
 * Control characters are stripped — RFC 5545 forbids them in TEXT and a single
 * stray one (pasted from Excel or Word) makes Outlook reject the whole file.
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
// Calendar building
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<Task['status'], string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
};

/** Outlook category applied to every exported appointment. */
const CATEGORY = 'Chargable';

/**
 * Working hours. Written as floating local time (no timezone), so 09:30 stays
 * 09:30 for the consultant regardless of where their mailbox thinks it is — and
 * no VTIMEZONE block is needed. Tune here.
 */
const HALF_DAY_HOURS = {
  AM: { start: '093000', end: '123000' },
  PM: { start: '140000', end: '170000' },
};
const FULL_DAY_HOURS = { start: '093000', end: '170000' };

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

export interface Appointment {
  date: string;   // YYYY-MM-DD
  start: string;  // HHMMSS
  end: string;
}

/**
 * A task's working day is longer than one calendar day, so it becomes one
 * appointment per working day rather than a single all-day banner. Each day is
 * timed by how much of it the task actually occupies: both halves run
 * 09:30-17:00, a lone morning 09:30-12:30, a lone afternoon 14:00-17:00.
 *
 * Walking the half-day indices through getSchedulePoint means weekends are
 * skipped by exactly the same rule the plan uses — no second calendar to keep
 * in step. Returns [] when the task has no usable schedule, and the caller
 * falls back to an all-day event.
 */
export function appointments(task: Task, projectStartDate: string): Appointment[] {
  const { startHalfDay: s, endHalfDay: e } = task;

  const period = halfDayPeriod(task);
  if (period) return [{ date: task.plannedStartDate!, ...HALF_DAY_HOURS[period] }];

  // Without a project start date the half-day indices have nothing to resolve
  // against, so fall back to an all-day event rather than throwing mid-export.
  if (!projectStartDate) return [];
  if (!Number.isFinite(s) || !Number.isFinite(e) || e! < s!) return [];
  // ponytail: a corrupt index pair shouldn't spin out thousands of events.
  // Raise this if a genuine task ever runs longer than a year of working days.
  if (e! - s! > 500) return [];

  const byDate = new Map<string, Set<'AM' | 'PM'>>();
  for (let i = s!; i <= e!; i++) {
    const point = getSchedulePoint(projectStartDate, i);
    const periods = byDate.get(point.date) ?? new Set<'AM' | 'PM'>();
    periods.add(point.period);
    byDate.set(point.date, periods);
  }

  return [...byDate].map(([date, periods]) => ({
    date,
    ...(periods.size === 2 ? FULL_DAY_HOURS : HALF_DAY_HOURS[periods.has('AM') ? 'AM' : 'PM']),
  }));
}

/**
 * How customer-owned tasks are treated. They are the customer's own work rather
 * than the consultant's, so they stay out of the diary unless asked for.
 * 'Pinnacle/Customer' is shared work and is never treated as customer-owned.
 */
export type CustomerTaskMode = 'exclude' | 'include' | 'only';

/**
 * Tasks for one consultant on one project, starting within [fromDate, toDate].
 * An empty `toDate` means no upper bound.
 *
 * The date range is the user's own de-duplication control: Outlook's file import
 * ignores UID and will happily create duplicates, so re-exporting from a later
 * date is how you avoid re-adding appointments already in the diary.
 */
export function calendarTasks(
  project: Project,
  tasks: Task[],
  consultantId: string,
  fromDate: string,
  toDate = '',
  customerTasks: CustomerTaskMode = 'exclude',
): Task[] {
  return tasks
    .filter(t =>
      t.projectId === project.id &&
      t.assignedConsultantId === consultantId &&
      !!t.plannedStartDate &&
      !!t.plannedEndDate &&
      t.plannedStartDate >= fromDate &&
      (!toDate || t.plannedStartDate! <= toDate) &&
      (customerTasks === 'include' || (t.taskOwner === 'Customer') === (customerTasks === 'only')),
    )
    .sort((a, b) => (a.plannedStartDate! < b.plannedStartDate! ? -1 : 1));
}

/** One appointment as it will appear in the diary. */
export interface Booking {
  task: Task;
  uid: string;
  title: string;
  date: string;          // YYYY-MM-DD, the day it lands on
  /** Clock times, or null when it falls back to an all-day event. */
  start: string | null;  // HHMMSS
  end: string | null;
  /** Exclusive end date, all-day bookings only. */
  allDayUntil: string | null;
}

/**
 * Everything that will be written to the calendar, in order. The .ics and the
 * summary report are both built from this, so the email can never describe
 * something different from what the attached calendar actually books.
 */
export function bookings(project: Project, tasks: Task[]): Booking[] {
  return tasks.flatMap((task): Booking[] => {
    // Defensive: the scheduler always produces end >= start, but these dates are
    // persisted columns. One row where they are inverted would emit DTEND before
    // DTSTART, and Outlook rejects the whole file rather than skipping the event.
    const start = task.plannedStartDate!;
    const end = task.plannedEndDate! < start ? start : task.plannedEndDate!;
    const title = `${project.name}: ${task.name}`;

    // One appointment per working day. An empty list means the task has no
    // usable schedule, so it falls back to an all-day event over its range.
    const slots = appointments(task, project.startDate);
    if (slots.length === 0) {
      return [{ task, uid: task.id, title, date: start, start: null, end: null, allDayUntil: dayAfter(end) }];
    }

    const spans = slots.length > 1;
    return slots.map((slot, i) => ({
      task,
      // Each day is its own event, so each needs its own UID — a repeated UID
      // lets Outlook treat the later days as edits of the first.
      uid: spans ? `${task.id}-${i + 1}` : task.id,
      // Days are otherwise identical in the diary; number them so a consultant
      // can tell day 2 of 5 from day 3.
      title: spans ? `${title} (${i + 1}/${slots.length})` : title,
      date: slot.date,
      start: slot.start,
      end: slot.end,
      allDayUntil: null,
    }));
  });
}

export function buildIcs(
  project: Project,
  tasks: Task[],
  consultant: Consultant,
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

  bookings(project, tasks).forEach(b => {
    const detail = [
      b.task.description,
      b.task.pinkNumber ? `Pink #: ${b.task.pinkNumber}` : '',
      `Status: ${STATUS_LABEL[b.task.status]}`,
      `Client: ${project.clientName}`,
    ].filter(Boolean).join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.uid}@pinnacle-flow`,
      `DTSTAMP:${stamp}`,
      ...(b.start
        ? [`DTSTART:${icsDate(b.date)}T${b.start}`, `DTEND:${icsDate(b.date)}T${b.end}`]
        : [`DTSTART;VALUE=DATE:${icsDate(b.date)}`, `DTEND;VALUE=DATE:${icsDate(b.allDayUntil!)}`]),
      `SUMMARY:${escapeIcsText(b.title)}`,
      `DESCRIPTION:${escapeIcsText(detail)}`,
      `CATEGORIES:${escapeIcsText(CATEGORY)}`,
      // ponytail: all-day events import as Free in Outlook unless told otherwise.
      // Flip these two to TRANSPARENT/FREE if consultants shouldn't look booked.
      'TRANSP:OPAQUE',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Summary report
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

function slotLabel(b: Booking): string {
  return b.start ? `${clock(b.start)} - ${clock(b.end!)}` : 'All day';
}

/** Half-days booked, so the total reads in the same units as task durations. */
function totalDays(list: Booking[]): number {
  return list.reduce((sum, b) => {
    if (!b.start) return sum + 1;
    return sum + (b.start === '093000' && b.end === '170000' ? 1 : 0.5);
  }, 0);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "from Mon 10 Aug 2026", or "… to Fri 14 Aug 2026" when an end date is set. */
export function rangeLabel(fromDate: string, toDate: string): string {
  return `from ${longDate(fromDate)}${toDate ? ` to ${longDate(toDate)}` : ''}`;
}

/** Plain-text summary of everything in the calendar file. */
export function buildSummaryText(
  project: Project,
  consultant: Consultant,
  list: Booking[],
  fromDate: string,
  toDate = '',
): string {
  const rows = list.map(b =>
    `  ${longDate(b.date).padEnd(16)}  ${slotLabel(b).padEnd(15)}  ${b.task.name}`);

  return [
    `Bookings for ${project.name}`,
    `${consultant.name} · ${project.clientName}`,
    `${list.length} appointment${list.length === 1 ? '' : 's'} ${rangeLabel(fromDate, toDate)}`,
    '',
    ...rows,
    '',
    `Total: ${totalDays(list)} day${totalDays(list) === 1 ? '' : 's'} of effort across ${new Set(list.map(b => b.date)).size} working days.`,
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
export function buildSummaryHtml(
  project: Project,
  consultant: Consultant,
  list: Booking[],
  fromDate: string,
  toDate = '',
): string {
  // Single quotes: a family name with a space must be quoted to be valid CSS,
  // and these strings sit inside double-quoted style attributes.
  const font = "font-family:'Segoe UI',Arial,sans-serif;";
  const cell = `${font}padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#1f2937;`;
  const rows = list.map(b => `      <tr>
        <td style="${cell}white-space:nowrap;">${escapeHtml(longDate(b.date))}</td>
        <td style="${cell}white-space:nowrap;">${escapeHtml(slotLabel(b))}</td>
        <td style="${cell}">${escapeHtml(b.task.name)}</td>
      </tr>`).join('\n');

  const head = `${font}padding:6px 12px;border-bottom:2px solid #2d4a65;font-size:12px;text-align:left;color:#2d4a65;`;
  const para = `${font}font-size:13px;color:#1f2937;`;

  return `<html><body style="${font}color:#1f2937;">
    <p style="${para}">Hi ${escapeHtml(consultant.name.split(' ')[0])},</p>
    <p style="${para}">Here are your bookings for <strong>${escapeHtml(project.name)}</strong> (${escapeHtml(project.clientName)})
       ${escapeHtml(rangeLabel(fromDate, toDate))} &mdash; ${list.length} appointment${list.length === 1 ? '' : 's'},
       ${totalDays(list)} day${totalDays(list) === 1 ? '' : 's'} in total.</p>
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
 * Encodes a header value that may contain non-ASCII (RFC 2047). Plain ASCII is
 * left alone so the common case stays readable in the raw file.
 *
 * Line breaks are flattened first: a project name containing one would end the
 * header and start a new line, letting anything typed after it become a real
 * header (Bcc:, Content-Type:, …) in the message the consultant then sends.
 */
function encodeHeader(value: string): string {
  const flat = value.replace(/[\r\n]+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7f]/.test(flat)) return flat;
  return `=?utf-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(flat)))}?=`;
}

/**
 * An .eml Outlook opens as an editable, unsent draft — that is what X-Unsent
 * does; without it the file opens read-only as a received message. The calendar
 * rides along as a normal attachment rather than text/calendar, so Outlook does
 * not try to interpret it as a meeting request addressed to the sender.
 */
export function buildEml(
  project: Project,
  consultant: Consultant,
  list: Booking[],
  icsContent: string,
  icsFilename: string,
  fromDate: string,
  toDate = '',
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
    base64Lines(buildSummaryHtml(project, consultant, list, fromDate, toDate)),
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
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Downloads an .ics of a consultant's tasks on this project. Returns the number
 * of events written so the caller can warn when the filter matched nothing.
 *
 * To land these in the main Outlook diary the user must import rather than open:
 * File > Open & Export > Import/Export > Import an iCalendar (.ics) file > Import.
 * Double-clicking the file instead opens it as a separate read-only calendar.
 */
/**
 * The shareable summary on its own, for showing on screen and copying. Both
 * flavours come from the same bookings: the plain text is what shows in the
 * modal, the HTML is what Outlook picks up when the copy is pasted into an
 * email. Empty strings when nothing matches the filter.
 */
export function consultantSummary(
  project: Project,
  tasks: Task[],
  consultant: Consultant,
  fromDate: string,
  toDate = '',
  customerTasks: CustomerTaskMode = 'exclude',
): { text: string; html: string } {
  const selected = calendarTasks(project, tasks, consultant.id, fromDate, toDate, customerTasks);
  if (selected.length === 0) return { text: '', html: '' };
  const list = bookings(project, selected);
  return {
    text: buildSummaryText(project, consultant, list, fromDate, toDate),
    html: buildSummaryHtml(project, consultant, list, fromDate, toDate),
  };
}

export type CalendarFormat = 'ics' | 'eml';

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

export function exportConsultantCalendar(
  project: Project,
  tasks: Task[],
  consultant: Consultant,
  fromDate: string,
  toDate = '',
  format: CalendarFormat = 'ics',
  customerTasks: CustomerTaskMode = 'exclude',
): number {
  const selected = calendarTasks(project, tasks, consultant.id, fromDate, toDate, customerTasks);
  if (selected.length === 0) return 0;

  const stem = `${project.name} - ${consultant.name}`;
  const icsName = `${stem} - Calendar.ics`;
  const ics = buildIcs(project, selected, consultant);

  if (format === 'eml') {
    const list = bookings(project, selected);
    download(
      buildEml(project, consultant, list, ics, icsName, fromDate, toDate),
      `${stem} - Bookings.eml`,
      'message/rfc822',
    );
    return list.length;
  }

  download(ics, icsName, 'text/calendar;charset=utf-8');
  return bookings(project, selected).length;
}


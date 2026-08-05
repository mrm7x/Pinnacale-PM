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
 * Tasks for one consultant on one project, starting on or after `fromDate`.
 * The from-date is the user's own de-duplication control: Outlook's file import
 * ignores UID and will happily create duplicates, so re-exporting from a later
 * date is how you avoid re-adding appointments already in the diary.
 */
export function calendarTasks(
  project: Project,
  tasks: Task[],
  consultantId: string,
  fromDate: string,
): Task[] {
  return tasks
    .filter(t =>
      t.projectId === project.id &&
      t.assignedConsultantId === consultantId &&
      !!t.plannedStartDate &&
      !!t.plannedEndDate &&
      t.plannedStartDate >= fromDate,
    )
    .sort((a, b) => (a.plannedStartDate! < b.plannedStartDate! ? -1 : 1));
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

  tasks.forEach(task => {
    const detail = [
      task.description,
      task.pinkNumber ? `Pink #: ${task.pinkNumber}` : '',
      `Status: ${STATUS_LABEL[task.status]}`,
      `Client: ${project.clientName}`,
    ].filter(Boolean).join('\n');

    // Defensive: the scheduler always produces end >= start, but these dates are
    // persisted columns. One row where they are inverted would emit DTEND before
    // DTSTART, and Outlook rejects the whole file rather than skipping the event.
    const start = task.plannedStartDate!;
    const end = task.plannedEndDate! < start ? start : task.plannedEndDate!;

    // One appointment per working day. An empty list means the task has no
    // usable schedule, so it falls back to an all-day event over its range.
    const slots = appointments(task, project.startDate);
    const spans = slots.length > 1;

    const emit = (when: string[], uid: string, summary: string) => lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@pinnacle-flow`,
      `DTSTAMP:${stamp}`,
      ...when,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(detail)}`,
      `CATEGORIES:${escapeIcsText(CATEGORY)}`,
      // ponytail: all-day events import as Free in Outlook unless told otherwise.
      // Flip these two to TRANSPARENT/FREE if consultants shouldn't look booked.
      'TRANSP:OPAQUE',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
      'END:VEVENT',
    );

    const title = `${project.name}: ${task.name}`;

    if (slots.length === 0) {
      emit([
        `DTSTART;VALUE=DATE:${icsDate(start)}`,
        `DTEND;VALUE=DATE:${icsDate(dayAfter(end))}`,
      ], task.id, title);
      return;
    }

    slots.forEach((slot, i) => {
      emit(
        [
          `DTSTART:${icsDate(slot.date)}T${slot.start}`,
          `DTEND:${icsDate(slot.date)}T${slot.end}`,
        ],
        // Each day is its own event, so each needs its own UID — a repeated UID
        // lets Outlook treat the later days as edits of the first.
        spans ? `${task.id}-${i + 1}` : task.id,
        // Days are otherwise identical in the diary; number them so a consultant
        // can tell day 2 of 5 from day 3.
        spans ? `${title} (${i + 1}/${slots.length})` : title,
      );
    });
  });

  lines.push('END:VCALENDAR');

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
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
export function exportConsultantCalendar(
  project: Project,
  tasks: Task[],
  consultant: Consultant,
  fromDate: string,
): number {
  const selected = calendarTasks(project, tasks, consultant.id, fromDate);
  if (selected.length === 0) return 0;

  const blob = new Blob([buildIcs(project, selected, consultant)], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name} - ${consultant.name} - Calendar.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return selected.length;
}

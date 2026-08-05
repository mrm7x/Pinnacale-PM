import type { Project, Task, Consultant } from '../types';
// Explicit .ts extension (allowed by allowImportingTsExtensions) so scripts/
// exportToIcs.selfcheck.ts can run this module under plain `node` with no bundler.
import { parseDate, formatDate } from './scheduler.ts';

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

    lines.push(
      'BEGIN:VEVENT',
      `UID:${task.id}@pinnacle-flow`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(dayAfter(end))}`,
      `SUMMARY:${escapeIcsText(`${project.name}: ${task.name}`)}`,
      `DESCRIPTION:${escapeIcsText(detail)}`,
      // ponytail: all-day events import as Free in Outlook unless told otherwise.
      // Flip these two to TRANSPARENT/FREE if consultants don't want to look booked.
      'TRANSP:OPAQUE',
      'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
      'END:VEVENT',
    );
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

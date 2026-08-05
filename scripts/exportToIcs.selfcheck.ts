/*
 * Self-check for the .ics calendar export. No test framework — run it directly:
 *   node scripts/exportToIcs.selfcheck.ts
 * Lives outside src/ so `tsc -b` (which includes only src) never sees it.
 */
import {
  escapeIcsText, foldIcsLine, dayAfter, calendarTasks, buildIcs,
} from '../src/utils/exportToIcs.ts';
import type { Project, Task, Consultant } from '../src/types.ts';

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

// --- escaping -------------------------------------------------------------
check(escapeIcsText('Review A, B; C') === 'Review A\\, B\\; C', 'commas and semicolons escaped');
check(escapeIcsText('line1\nline2') === 'line1\\nline2', 'newline escaped');
check(escapeIcsText('a\r\nb') === 'a\\nb', 'CRLF collapses to one \\n');
check(escapeIcsText('back\\slash') === 'back\\\\slash', 'backslash escaped first');
const ctrl = String.fromCharCode(7) + String.fromCharCode(31) + String.fromCharCode(127);
check(escapeIcsText('a' + ctrl + 'b') === 'ab', 'control characters stripped');
check(escapeIcsText('keep\ttab') === 'keep\ttab', 'tab is legal in TEXT and kept');
// A task name must not be able to inject its own calendar entries.
check(!escapeIcsText('X\nEND:VEVENT\nBEGIN:VEVENT').includes('\n'), 'newline injection neutralised');

// --- line folding ---------------------------------------------------------
const long = 'DESCRIPTION:' + 'x'.repeat(300);
const folded = foldIcsLine(long);
const physical = folded.split('\r\n');
check(physical.length > 1, 'long line is folded');
check(physical.every(l => new TextEncoder().encode(l).length <= 75), 'no physical line exceeds 75 octets');
check(physical.slice(1).every(l => l.startsWith(' ')), 'continuation lines start with a space');
check(physical.map((l, i) => (i ? l.slice(1) : l)).join('') === long, 'unfolding restores the original line');
check(foldIcsLine('SUMMARY:short') === 'SUMMARY:short', 'short line left alone');
// Multi-byte glyphs must not be split mid-character.
const accents = 'SUMMARY:' + 'é'.repeat(60);
check(foldIcsLine(accents).split('\r\n').every(l => !l.includes('�')), 'multi-byte chars survive folding');

// --- exclusive DTEND ------------------------------------------------------
check(dayAfter('2026-08-05') === '2026-08-06', 'plain day rollover');
check(dayAfter('2026-08-31') === '2026-09-01', 'month rollover');
check(dayAfter('2026-12-31') === '2027-01-01', 'year rollover');
check(dayAfter('2028-02-28') === '2028-02-29', 'leap day rollover');

// --- fixtures -------------------------------------------------------------
const project = { id: 'p1', name: 'Acme Rollout', clientName: 'Acme, Ltd' } as Project;
const consultant = { id: 'c1', name: 'Sam Reed' } as Consultant;

const task = (over: Partial<Task>): Task => ({
  id: 't', projectId: 'p1', parentId: null, name: 'Task', description: '',
  durationDays: 1, assignedConsultantId: 'c1', predecessorIds: [], status: 'not_started',
  plannedStartDate: '2026-08-10', plannedEndDate: '2026-08-12', ...over,
});

const all: Task[] = [
  task({ id: 'early', plannedStartDate: '2026-07-01', plannedEndDate: '2026-07-02' }),
  task({ id: 'mine', name: 'Config; setup', plannedStartDate: '2026-08-10', plannedEndDate: '2026-08-12' }),
  task({ id: 'later', plannedStartDate: '2026-09-01', plannedEndDate: '2026-09-01' }),
  task({ id: 'theirs', assignedConsultantId: 'c2' }),
  task({ id: 'unassigned', assignedConsultantId: null }),
  task({ id: 'otherproject', projectId: 'p2' }),
  task({ id: 'unscheduled', plannedStartDate: undefined, plannedEndDate: undefined }),
];

// --- filtering ------------------------------------------------------------
const picked = calendarTasks(project, all, consultant.id, '2026-08-01');
check(picked.map(t => t.id).join(',') === 'mine,later', 'filters by project, consultant and from-date');
check(calendarTasks(project, all, consultant.id, '2026-01-01').length === 3, 'earlier from-date widens the set');
check(calendarTasks(project, all, consultant.id, '2027-01-01').length === 0, 'future from-date matches nothing');
check(calendarTasks(project, all, 'c2', '2026-01-01').length === 1, "another consultant's tasks are separate");

// --- generated calendar ---------------------------------------------------
const ics = buildIcs(project, picked, consultant, new Date('2026-08-05T09:15:00Z'));
check(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'starts with VCALENDAR');
check(ics.trimEnd().endsWith('END:VCALENDAR'), 'ends with VCALENDAR');
check(ics.split('BEGIN:VEVENT').length - 1 === 2, 'one VEVENT per selected task');
check(!/[^\r]\n/.test(ics), 'every line break is CRLF');
check(ics.includes('DTSTAMP:20260805T091500Z'), 'DTSTAMP is UTC basic format');
check(ics.includes('DTSTART;VALUE=DATE:20260810'), 'DTSTART is the planned start');
check(ics.includes('DTEND;VALUE=DATE:20260813'), 'DTEND is the day after the planned end');
check(ics.includes('SUMMARY:Acme Rollout: Config\\; setup'), 'summary escaped, project prefixed');
check(ics.includes('Client: Acme\\, Ltd'), 'client name escaped in description');
check(ics.includes('UID:mine@pinnacle-flow'), 'UID derives from the task id');
check(ics.includes('X-MICROSOFT-CDO-BUSYSTATUS:BUSY'), 'appointments import as Busy in Outlook');
// A single-day task still needs a valid exclusive DTEND.
check(buildIcs(project, [task({ id: 'one', plannedStartDate: '2026-08-31', plannedEndDate: '2026-08-31' })], consultant)
  .includes('DTEND;VALUE=DATE:20260901'), 'single-day task ends the next day');

// A corrupt row with end before start must not emit DTEND < DTSTART — Outlook
// rejects the entire file, not just the offending event.
const inverted = buildIcs(
  project,
  [task({ id: 'bad', plannedStartDate: '2026-08-12', plannedEndDate: '2026-08-10' })],
  consultant,
);
check(inverted.includes('DTSTART;VALUE=DATE:20260812'), 'inverted range keeps its start');
check(inverted.includes('DTEND;VALUE=DATE:20260813'), 'inverted range is clamped to a one-day event');

console.log('exportToIcs self-check passed');

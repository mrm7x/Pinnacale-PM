/*
 * Self-check for the calendar export. No test framework — run it directly:
 *   node scripts/exportToIcs.selfcheck.ts
 * Lives outside src/ so `tsc -b` (which includes only src) never sees it.
 */
import {
  escapeIcsText, foldIcsLine, dayAfter, halfDayPeriod, daySlots, selectCalendarTasks,
  planAppointments, renderIcs, renderSummaryText, renderSummaryHtml, renderEml, longDate,
  rangeLabel, prepareCalendarExport, consultantSummary, type Appointment, type CustomerTaskMode,
} from '../src/utils/exportToIcs.ts';
import { calculateTaskSchedules } from '../src/utils/scheduler.ts';
import type { Project, Task, Consultant } from '../src/types.ts';

let passed = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
}

/** Splits an .ics into unfolded, unescaped VEVENT property maps. */
function parseEvents(ics: string): Record<string, string>[] {
  const unfolded = ics.replace(/\r\n /g, '');
  return unfolded.split('BEGIN:VEVENT').slice(1).map(block => {
    const props: Record<string, string> = {};
    for (const line of block.split('\r\n')) {
      const m = /^([A-Z-]+)(?:;[^:]*)?:(.*)$/.exec(line);
      if (m && !(m[1] in props)) props[m[1]] = m[2];
    }
    return props;
  });
}
const unescape = (s: string) =>
  s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

// --- escaping -------------------------------------------------------------
check(escapeIcsText('Review A, B; C') === 'Review A\\, B\\; C', 'commas and semicolons escaped');
check(escapeIcsText('line1\nline2') === 'line1\\nline2', 'newline escaped');
check(escapeIcsText('a\r\nb') === 'a\\nb', 'CRLF collapses to one \\n');
check(escapeIcsText('back\\slash') === 'back\\\\slash', 'backslash escaped first');
const ctrl = String.fromCharCode(7) + String.fromCharCode(31) + String.fromCharCode(127);
check(escapeIcsText('a' + ctrl + 'b') === 'ab', 'control characters stripped');
check(escapeIcsText('keep\ttab') === 'keep\ttab', 'tab is legal in TEXT and kept');
check(!escapeIcsText('X\nEND:VEVENT\nBEGIN:VEVENT').includes('\n'), 'newline injection neutralised');

// --- line folding ---------------------------------------------------------
const long = 'DESCRIPTION:' + 'x'.repeat(300);
const physical = foldIcsLine(long).split('\r\n');
check(physical.length > 1, 'long line is folded');
check(physical.every(l => new TextEncoder().encode(l).length <= 75), 'no physical line exceeds 75 octets');
check(physical.slice(1).every(l => l.startsWith(' ')), 'continuation lines start with a space');
check(physical.map((l, i) => (i ? l.slice(1) : l)).join('') === long, 'unfolding restores the original line');
check(foldIcsLine('SUMMARY:short') === 'SUMMARY:short', 'short line left alone');
check(foldIcsLine('SUMMARY:' + 'é'.repeat(60)).split('\r\n').every(l => !l.includes('�')), 'multi-byte chars survive folding');

// --- exclusive DTEND ------------------------------------------------------
check(dayAfter('2026-08-05') === '2026-08-06', 'plain day rollover');
check(dayAfter('2026-08-31') === '2026-09-01', 'month rollover');
check(dayAfter('2026-12-31') === '2027-01-01', 'year rollover');
check(dayAfter('2028-02-28') === '2028-02-29', 'leap day rollover');

// --- fixtures -------------------------------------------------------------
// 2026-08-10 is a Monday, so half-day index 0 of this project is that morning.
const MONDAY = '2026-08-10';
const project = { id: 'p1', name: 'Acme Rollout', clientName: 'Acme, Ltd', startDate: MONDAY } as Project;
const consultant = { id: 'c1', name: 'Sam Reed', email: 'sam@example.com' } as Consultant;
const NOW = new Date('2026-08-05T09:15:00Z');

const task = (over: Partial<Task>): Task => ({
  id: 't', projectId: 'p1', parentId: null, name: 'Task', description: '',
  durationDays: 1, assignedConsultantId: 'c1', predecessorIds: [], status: 'not_started',
  plannedStartDate: '2026-08-10', plannedEndDate: '2026-08-12', ...over,
});
const sel = (tasks: Task[], fromDate: string, toDate = '', customerTasks?: CustomerTaskMode, consultantId = 'c1') =>
  selectCalendarTasks(project, tasks, { consultantId, fromDate, toDate, customerTasks });
const ids = (ts: { id: string }[]) => ts.map(t => t.id).join(',');

const all: Task[] = [
  task({ id: 'early', plannedStartDate: '2026-07-01', plannedEndDate: '2026-07-02' }),
  task({ id: 'mine', name: 'Config; setup', plannedStartDate: '2026-08-10', plannedEndDate: '2026-08-12' }),
  task({ id: 'later', plannedStartDate: '2026-09-01', plannedEndDate: '2026-09-01' }),
  task({ id: 'theirs', assignedConsultantId: 'c2' }),
  task({ id: 'unassigned', assignedConsultantId: null }),
  task({ id: 'otherproject', projectId: 'p2' }),
  task({ id: 'unscheduled', plannedStartDate: undefined, plannedEndDate: undefined }),
];

// --- selection --------------------------------------------------------------
check(ids(sel(all, '2026-08-01')) === 'mine,later', 'filters by project, consultant and from-date');
check(sel(all, '2026-01-01').length === 3, 'earlier from-date widens the set');
check(sel(all, '2027-01-01').length === 0, 'future from-date matches nothing');
check(sel(all, '2026-01-01', '', undefined, 'c2').length === 1, "another consultant's tasks are separate");
check(ids(sel(all, '2026-01-01', '2026-08-31')) === 'early,mine', 'the end date drops later tasks');
check(ids(sel(all, '2026-08-10', '2026-08-10')) === 'mine', 'a single-day range keeps a task starting that day');
check(sel(all, '2026-08-11', '2026-08-31').length === 0, 'an empty window matches nothing');

const owners: Task[] = [
  task({ id: 'pinnacle', taskOwner: 'Pinnacle', plannedStartDate: '2026-08-10' }),
  task({ id: 'customer', taskOwner: 'Customer', plannedStartDate: '2026-08-11' }),
  task({ id: 'shared', taskOwner: 'Pinnacle/Customer', plannedStartDate: '2026-08-12' }),
  task({ id: 'unset', taskOwner: undefined, plannedStartDate: '2026-08-13' }),
];
check(ids(sel(owners, '2026-01-01', '', 'exclude')) === 'pinnacle,shared,unset', 'customer tasks are excluded by default');
check(ids(sel(owners, '2026-01-01')) === 'pinnacle,shared,unset', 'and excluded when no mode is passed');
check(ids(sel(owners, '2026-01-01', '', 'include')) === 'pinnacle,customer,shared,unset', 'include keeps everything');
check(ids(sel(owners, '2026-01-01', '', 'only')) === 'customer', 'only keeps customer-owned tasks alone');

// Parent (phase) tasks are rollups and must never become appointments, even
// when "apply to subtasks" has assigned them to the consultant.
const tree: Task[] = [
  task({ id: 'phase', name: 'Define Stage', description: 'Phase blurb', startHalfDay: 0, endHalfDay: 5, plannedEndDate: '2026-08-12' }),
  task({ id: 'kid1', parentId: 'phase', name: 'Kick-off', description: 'Kick-off notes', startHalfDay: 0, endHalfDay: 1, plannedEndDate: MONDAY }),
  task({ id: 'kid2', parentId: 'phase', name: 'Discovery', description: 'Discovery notes', startHalfDay: 2, endHalfDay: 5, plannedStartDate: '2026-08-11' }),
];
check(ids(sel(tree, '2026-01-01')) === 'kid1,kid2', 'parent tasks are excluded');
const treeIcs = renderIcs(project, consultant, planAppointments(project, tree, sel(tree, '2026-01-01')), NOW);
check(!treeIcs.includes('Define Stage (') && !treeIcs.includes('Phase blurb'), 'no phase appointment, no phase description');
check(treeIcs.includes('Phase: Define Stage'), 'the phase is named as context on its children');
check(parseEvents(treeIcs).length === 3, 'one day of kick-off plus two of discovery — no stacked phase days');

// Equal start dates have a defined, repeatable order.
const ties = [task({ id: 'b', sortOrder: 20 }), task({ id: 'a', sortOrder: 20 }), task({ id: 'c', sortOrder: 10 })];
check(ids(sel(ties, '2026-01-01')) === 'c,a,b', 'ties break by sort order, then id');
check(ids(sel([...ties].reverse(), '2026-01-01')) === 'c,a,b', 'and do not depend on input order');

// --- REGRESSION: every appointment carries its own task's description -------
// A realistic plan, run through the real scheduler, with every description
// unique. Each VEVENT is traced back to its task by UID and must carry that
// task's name and description — and nobody else's.
const plan: Task[] = calculateTaskSchedules(MONDAY, [
  { id: 'ph1', name: 'Phase One', description: 'PHASE-ONE-DESC', durationDays: 0 },
  { id: 'a1', parentId: 'ph1', name: 'Alpha, kick-off', description: 'Alpha: agenda; slides\nsecond line', durationDays: 0.5, startPeriod: 'PM' },
  { id: 'a2', parentId: 'ph1', name: 'Bravo', description: 'Bravo desc', durationDays: 2, predecessorIds: ['a1'] },
  { id: 'a3', parentId: 'ph1', name: 'Charlie', description: 'Charlie desc', durationDays: 1.5, predecessorIds: ['a2'] },
  { id: 'a4', parentId: 'ph1', name: 'Delta', description: '', durationDays: 1, predecessorIds: ['a2'] },
  { id: 'a5', name: 'Echo (customer)', description: 'Echo desc', durationDays: 1, taskOwner: 'Customer', predecessorIds: ['a3'] },
  { id: 'a6', name: 'Foxtrot', description: 'Foxtrot desc', durationDays: 3, predecessorIds: ['a3'], pinkNumber: 'PK-6' },
  { id: 'other', name: 'Not mine', description: 'NOT-MINE-DESC', durationDays: 1, assignedConsultantId: 'c2' },
].map((t, i) => task({ ...t, sortOrder: (i + 1) * 10, plannedStartDate: undefined, plannedEndDate: undefined } as Partial<Task>)));
// Feed the export in a shuffled order: positions must not matter.
const shuffled = [plan[5], plan[2], plan[7], plan[0], plan[4], plan[1], plan[6], plan[3]];
const byId = new Map(plan.map(t => [t.id, t]));

for (const mode of ['exclude', 'include'] as const) {
  const result = prepareCalendarExport(project, shuffled, consultant, '2026-01-01', '', mode, NOW)!;
  const events = parseEvents(result.ics);
  check(events.length === result.appointments.length, `${mode}: one VEVENT per appointment`);
  check(new Set(events.map(e => e.UID)).size === events.length, `${mode}: UIDs are unique`);
  for (const ev of events) {
    const id = ev.UID.replace(/@pinnacle-flow$/, '').replace(/-\d{8}$/, '');
    const t = byId.get(id);
    check(!!t, `${mode}: UID ${ev.UID} traces back to a task`);
    const summary = unescape(ev.SUMMARY);
    const desc = unescape(ev.DESCRIPTION);
    check(summary.startsWith(`Acme Rollout: ${t!.name}`), `${mode}: ${id} summary is its own name`);
    check(desc.includes(`Task: ${t!.name}`), `${mode}: ${id} description names its task`);
    if (t!.description) check(desc.startsWith(t!.description), `${mode}: ${id} description is its own`);
    for (const other of plan) {
      if (other.id !== id && other.description) {
        check(!desc.includes(other.description), `${mode}: ${id} does not carry ${other.id}'s description`);
      }
    }
  }
  check(!result.ics.includes('NOT-MINE-DESC') && !result.ics.includes('PHASE-ONE-DESC'),
    `${mode}: no other consultant's or phase's text leaks in`);
  check(result.ics.includes('Echo desc') === (mode === 'include'), `${mode}: customer task follows the mode`);

  // The email/preview list the same appointments, each with its own description.
  for (const a of result.appointments) {
    check(result.text.includes(`${longDate(a.date)}`), `${mode}: summary lists ${a.taskId} on ${a.date}`);
  }
  const textLines = result.text.split('\n');
  for (const t of plan.filter(x => x.description && x.id !== 'ph1' && x.id !== 'other')) {
    if (mode === 'exclude' && t.id === 'a5') continue;
    const row = textLines.findIndex(l => l.includes(t.name));
    check(row >= 0, `${mode}: ${t.id} has a summary row`);
    check(textLines[row + 1].trim() === t.description.split('\n')[0], `${mode}: ${t.id}'s description sits under its own row`);
  }
}

// Snapshots: editing a task after planning cannot change an appointment.
const snapTask = task({ id: 'snap', description: 'before', startHalfDay: 0, endHalfDay: 1, plannedEndDate: MONDAY });
const snap = planAppointments(project, [snapTask], [snapTask]);
snapTask.description = 'after';
check(snap[0].taskDescription === 'before' && snap[0].details.startsWith('before'), 'appointments are snapshots');
check(Object.isFrozen(snap[0]), 'appointments are frozen');

// --- generated calendar -----------------------------------------------------
const picked = sel(all, '2026-08-01');
const ics = renderIcs(project, consultant, planAppointments(project, all, picked), NOW);
check(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'starts with VCALENDAR');
check(ics.trimEnd().endsWith('END:VCALENDAR'), 'ends with VCALENDAR');
check(parseEvents(ics).length === 2, 'one VEVENT per selected unscheduled task');
check(!/[^\r]\n/.test(ics), 'every line break is CRLF');
check(ics.includes('DTSTAMP:20260805T091500Z'), 'DTSTAMP is UTC basic format');
check(ics.includes('DTSTART;VALUE=DATE:20260810'), 'all-day fallback starts on the planned start');
check(ics.includes('DTEND;VALUE=DATE:20260813'), 'and ends the day after the planned end');
check(ics.includes('SUMMARY:Acme Rollout: Config\\; setup'), 'summary escaped, project prefixed');
check(ics.includes('Client: Acme\\, Ltd'), 'client name escaped in description');
check(ics.includes('UID:mine@pinnacle-flow'), 'UID derives from the task id');
check(ics.includes('X-MICROSOFT-CDO-BUSYSTATUS:BUSY') && ics.includes('TRANSP:OPAQUE'), 'appointments import as Busy');
check(ics.includes('CATEGORIES:Chargable'), 'appointments carry the Chargable category');

const one = (t: Task) => renderIcs(project, consultant, planAppointments(project, [t], [t]), NOW);
check(one(task({ id: 'one', plannedStartDate: '2026-08-31', plannedEndDate: '2026-08-31' }))
  .includes('DTEND;VALUE=DATE:20260901'), 'single-day fallback ends the next day');
const inverted = one(task({ id: 'bad', plannedStartDate: '2026-08-12', plannedEndDate: '2026-08-10' }));
check(inverted.includes('DTSTART;VALUE=DATE:20260812') && inverted.includes('DTEND;VALUE=DATE:20260813'),
  'an inverted range is clamped to a one-day event');

// --- half-day AM/PM ----------------------------------------------------------
check(halfDayPeriod(task({ startHalfDay: 0, endHalfDay: 0 })) === 'AM', 'unset half day defaults to morning');
check(halfDayPeriod(task({ startHalfDay: 3, endHalfDay: 3 })) === 'AM', 'an odd index does not force an afternoon');
check(halfDayPeriod(task({ startHalfDay: 0, endHalfDay: 1 })) === null, 'a full day is not a half day');
check(halfDayPeriod(task({ startHalfDay: undefined, endHalfDay: undefined })) === null, 'missing indices are not a half day');
check(halfDayPeriod(task({ startHalfDay: NaN, endHalfDay: NaN })) === null, 'NaN indices are not a half day');
check(halfDayPeriod(task({ startHalfDay: 0, endHalfDay: 0, startPeriod: 'PM' })) === 'PM', 'an explicit PM is honoured');
check(halfDayPeriod(task({ startHalfDay: 0, endHalfDay: 3, startPeriod: 'PM' })) === null, 'a stale choice cannot force a multi-day task into a slot');

const half = (over: Partial<Task>) => one(task({ plannedStartDate: MONDAY, plannedEndDate: MONDAY, ...over }));
const am = half({ id: 'am', startHalfDay: 4, endHalfDay: 4 });
check(am.includes('DTSTART:20260810T093000') && am.includes('DTEND:20260810T123000'), 'morning runs 09:30-12:30');
check(!am.includes('VALUE=DATE'), 'a timed appointment is not an all-day event');
const pm = half({ id: 'pm', startHalfDay: 7, endHalfDay: 7, startPeriod: 'PM' });
check(pm.includes('DTSTART:20260810T140000') && pm.includes('DTEND:20260810T170000'), 'afternoon runs 14:00-17:00');

// --- one working day per appointment ----------------------------------------
const dayS = daySlots(task({ startHalfDay: 0, endHalfDay: 1 }), MONDAY);
check(dayS.length === 1 && dayS[0].start === '093000' && dayS[0].end === '170000' && dayS[0].days === 1, 'a whole day is 09:30-17:00');

const threeDay = task({ id: 'multi', name: 'Data migration', description: 'Migrate', startHalfDay: 0, endHalfDay: 5, plannedEndDate: '2026-08-12' });
check(daySlots(threeDay, MONDAY).map(s => s.date).join(',') === '2026-08-10,2026-08-11,2026-08-12', 'one slot per working day');
const multiEvents = parseEvents(one(threeDay));
check(multiEvents.length === 3, 'a three-day task is three appointments');
check(multiEvents.map(e => e.UID).join(',') ===
  'multi-20260810@pinnacle-flow,multi-20260811@pinnacle-flow,multi-20260812@pinnacle-flow', 'UIDs are keyed by task and date');
check(unescape(multiEvents[1].SUMMARY) === 'Acme Rollout: Data migration (2/3)', 'days are numbered in the title');
check(unescape(multiEvents[1].DESCRIPTION).includes('Day 2 of 3'), 'and in the description');
check(multiEvents.every(e => unescape(e.DESCRIPTION).startsWith('Migrate')), 'every day carries the task description');

const week = daySlots(task({ startHalfDay: 0, endHalfDay: 13 }), MONDAY);
check(week.length === 7 && !week.some(s => s.date === '2026-08-15' || s.date === '2026-08-16'), 'weekends are skipped');
const split = daySlots(task({ startHalfDay: 1, endHalfDay: 3 }), MONDAY);
check(split.length === 2 && split[0].start === '140000' && split[1].start === '093000', 'PM then a full day');

check(daySlots(task({ startHalfDay: undefined, endHalfDay: undefined }), MONDAY).length === 0, 'no schedule, no slots');
check(daySlots(task({ startHalfDay: 5, endHalfDay: 2 }), MONDAY).length === 0, 'an inverted index pair is rejected');
check(daySlots(task({ startHalfDay: 0, endHalfDay: 5000 }), MONDAY).length === 0, 'an absurd span is refused');
check(daySlots(task({ startHalfDay: 0, endHalfDay: 5 }), '').length === 0, 'a missing project start does not throw');

// --- summary report ----------------------------------------------------------
check(longDate('2026-08-10') === 'Mon 10 Aug 2026', 'dates read as a weekday and month');
check(rangeLabel(MONDAY, '') === 'from Mon 10 Aug 2026', 'no end date reads as an open range');
check(rangeLabel(MONDAY, '2026-08-14') === 'from Mon 10 Aug 2026 to Fri 14 Aug 2026', 'an end date closes the range');

const reportTasks = [
  task({ id: 'r1', name: 'Kick-off', description: 'Agenda & intros', pinkNumber: 'PK-1', startHalfDay: 0, endHalfDay: 0, plannedEndDate: MONDAY }),
  task({ id: 'r2', name: 'Data migration', description: 'Load <COA>', startHalfDay: 2, endHalfDay: 7, plannedStartDate: '2026-08-11', plannedEndDate: '2026-08-13' }),
];
const report: Appointment[] = planAppointments(project, reportTasks, reportTasks);
check(report.length === 4, 'a half day plus three full days is four appointments');

const text = renderSummaryText(project, consultant, report, MONDAY);
check(text.startsWith('Bookings for Acme Rollout') && text.includes('Sam Reed'), 'titled by project and consultant');
check(text.includes('Mon 10 Aug 2026') && text.includes('09:30 - 12:30'), 'a half day shows its morning slot');
check(text.includes('Data migration (2/3)'), 'multi-day rows are numbered');
check(text.split('Agenda & intros').length === 2 && text.split('Load <COA>').length === 2, 'each description is shown once');
check(!text.includes('PK-1'), 'pink numbers stay out of what gets emailed');
check(text.includes('Total: 3.5 days of effort across 4 working days.'), 'the total counts half days as half');
check(text.includes('4 appointments from Mon 10 Aug 2026'), 'the report states the count and start');
check(renderSummaryText(project, consultant, report, MONDAY, '2026-08-14').includes('to Fri 14 Aug 2026'), 'the end date is stated');

const html = renderSummaryHtml(project, consultant, report, MONDAY);
check(html.includes('<table') && html.includes('Data migration'), 'the html summary is a table of tasks');
check(html.includes('Load &lt;COA&gt;') && html.includes('Agenda &amp; intros'), 'descriptions appear, escaped');
check(!html.includes('PK-1'), 'the email has no pink numbers');
check((html.match(/<td style="font-family:/g) ?? []).length === report.length * 3, 'every cell styles its own font for Outlook');
const evil = task({ id: 'x', name: '<script>bad</script>', startHalfDay: 0, endHalfDay: 0, plannedEndDate: MONDAY });
check(!renderSummaryHtml(project, consultant, planAppointments(project, [evil], [evil]), MONDAY).includes('<script>'), 'html in a task name is escaped');

check(consultantSummary(project, all, consultant, '2026-08-01').text.includes('Bookings for Acme Rollout'), 'the preview is filtered like the export');
check(consultantSummary(project, all, consultant, '2027-01-01').text === '', 'nothing to export means nothing to show');
check(consultantSummary(project, all, consultant, '2027-01-01').html === '', 'and no html either');
check(prepareCalendarExport(project, all, consultant, '2027-01-01') === null, 'an empty export is null');

// --- email draft ---------------------------------------------------------------
const prepared = prepareCalendarExport(project, reportTasks, consultant, MONDAY, '', 'exclude', NOW)!;
const eml = renderEml(project, consultant, prepared.html, prepared.ics, prepared.icsFilename, NOW);
check(eml.includes('To: sam@example.com'), 'addressed to the consultant');
check(eml.includes('Subject: Bookings for Acme Rollout'), 'the subject names the project');
check(eml.includes('X-Unsent: 1') && eml.includes('MIME-Version: 1.0'), 'an editable MIME draft');
check(!/[^\r]\n/.test(eml), 'every header line break is CRLF');

const boundary = eml.match(/boundary="([^"]+)"/)?.[1] ?? '';
check(boundary.length > 0 && eml.split(`--${boundary}`).length - 1 === 3, 'two parts and a closing delimiter');
check(eml.includes('filename="Acme Rollout - Sam Reed - Calendar.ics"'), 'the calendar is attached by name');

const parts = eml.split(`--${boundary}`);
const b64 = (part: string) => new TextDecoder().decode(
  Uint8Array.from(atob(part.split('\r\n\r\n')[1].replace(/\r\n/g, '')), ch => ch.charCodeAt(0)));
check(b64(parts[1]) === prepared.html, 'the body is the same summary as the preview');
check(b64(parts[2]) === prepared.ics, 'the attachment decodes to the calendar exactly');
check(parts[2].split('\r\n').every(l => l.length <= 998), 'no line exceeds the SMTP limit');

const injected = renderEml(
  { ...project, name: 'Acme\r\nBcc: everyone@example.com' } as Project,
  { ...consultant, email: 'sam@x.com\r\nBcc: leak@x.com' } as Consultant,
  '<p/>', 'ICS', 'cal\r\nX-Evil: 1.ics',
);
const injectedLines = injected.split('\r\n');
check(!injectedLines.some(l => /^Bcc:/i.test(l)), 'a line break cannot inject a header');
check(!injectedLines.some(l => /^X-Evil/i.test(l)), 'a line break in the attachment name cannot inject a header');
check(!renderEml(project, consultant, '', 'ICS', 'a"; x="b.ics').includes('a"; x='), 'a quote cannot close the filename early');
check(renderEml({ ...project, name: 'Café' } as Project, consultant, '', '', 'x.ics').includes('Subject: =?utf-8?B?'), 'non-ASCII subjects are encoded');

console.log(`exportToIcs self-check passed (${passed} checks)`);

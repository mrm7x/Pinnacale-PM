/*
 * Self-check for the .ics calendar export. No test framework — run it directly:
 *   node scripts/exportToIcs.selfcheck.ts
 * Lives outside src/ so `tsc -b` (which includes only src) never sees it.
 */
import {
  escapeIcsText, foldIcsLine, dayAfter, calendarTasks, buildIcs, halfDayPeriod,
  appointments, bookings, buildSummaryText, buildSummaryHtml, buildEml, longDate,
  consultantSummaryText,
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
// 2026-08-10 is a Monday, so half-day index 0 of this project is that morning.
const MONDAY = '2026-08-10';
const project = { id: 'p1', name: 'Acme Rollout', clientName: 'Acme, Ltd', startDate: MONDAY } as Project;
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

// --- half-day AM/PM appointments ------------------------------------------
// The scheduler alternates AM/PM from index 0, so parity decides the period.
// Tasks saved before the option existed have no stored period and default to AM.
check(halfDayPeriod(task({ startHalfDay: 0, endHalfDay: 0 })) === 'AM', 'unset half day defaults to morning');
check(halfDayPeriod(task({ startHalfDay: 3, endHalfDay: 3 })) === 'AM', 'an odd index does not force an afternoon');
check(halfDayPeriod(task({ startHalfDay: 0, endHalfDay: 1 })) === null, 'a full day is not a half day');
check(halfDayPeriod(task({ startHalfDay: 2, endHalfDay: 5 })) === null, 'a multi-day task is not a half day');
check(halfDayPeriod(task({ startHalfDay: undefined, endHalfDay: undefined })) === null, 'missing indices fall back to all-day');
// A NaN from Number(null) on a legacy row must not become a bogus 09:30 slot.
check(halfDayPeriod(task({ startHalfDay: NaN, endHalfDay: NaN })) === null, 'NaN indices fall back to all-day');

// An explicit choice on the task overrides the derived parity in both directions.
check(halfDayPeriod(task({ startHalfDay: 0, endHalfDay: 0, startPeriod: 'PM' })) === 'PM', 'an explicit PM is honoured');
check(halfDayPeriod(task({ startHalfDay: 3, endHalfDay: 3, startPeriod: 'AM' })) === 'AM', 'an explicit AM is honoured');
check(halfDayPeriod(task({ startHalfDay: 3, endHalfDay: 3, startPeriod: null })) === 'AM', 'null defaults to morning');
// A choice left on a task that is no longer half a day must not create a slot.
check(halfDayPeriod(task({ startHalfDay: 0, endHalfDay: 3, startPeriod: 'PM' })) === null, 'a stale choice cannot force a multi-day task into a slot');

const chosenIcs = buildIcs(project, [task({
  id: 'chosen', startHalfDay: 0, endHalfDay: 0, startPeriod: 'PM',
  plannedStartDate: '2026-08-10', plannedEndDate: '2026-08-10',
})], consultant);
check(chosenIcs.includes('DTSTART:20260810T140000'), 'an explicitly chosen PM exports at 14:00');

const amIcs = buildIcs(project, [task({
  id: 'am', startHalfDay: 4, endHalfDay: 4,
  plannedStartDate: '2026-08-10', plannedEndDate: '2026-08-10',
})], consultant);
check(amIcs.includes('DTSTART:20260810T093000'), 'morning task starts at 09:30');
check(amIcs.includes('DTEND:20260810T123000'), 'morning task ends at 12:30');
check(!amIcs.includes('VALUE=DATE'), 'a timed appointment is not an all-day event');

const pmIcs = buildIcs(project, [task({
  id: 'pm', startHalfDay: 7, endHalfDay: 7, startPeriod: 'PM',
  plannedStartDate: '2026-08-10', plannedEndDate: '2026-08-10',
})], consultant);
check(pmIcs.includes('DTSTART:20260810T140000'), 'afternoon task starts at 14:00');
check(pmIcs.includes('DTEND:20260810T170000'), 'afternoon task ends at 17:00');

// --- one working day per appointment ---------------------------------------
const oneDay = task({
  id: 'day', startHalfDay: 0, endHalfDay: 1,
  plannedStartDate: MONDAY, plannedEndDate: MONDAY,
});
const daySlots = appointments(oneDay, MONDAY);
check(daySlots.length === 1, 'a whole day is a single appointment');
check(daySlots[0].start === '093000' && daySlots[0].end === '170000', 'a whole day runs 09:30 to 17:00');
const dayIcs = buildIcs(project, [oneDay], consultant);
check(dayIcs.includes('DTSTART:20260810T093000') && dayIcs.includes('DTEND:20260810T170000'), 'one-day task is timed');
check(!dayIcs.includes('VALUE=DATE'), 'a one-day task is not an all-day event');

// Three days become three separate 09:30-17:00 appointments.
const threeDay = task({
  id: 'multi', name: 'Data migration', startHalfDay: 0, endHalfDay: 5,
  plannedStartDate: MONDAY, plannedEndDate: '2026-08-12',
});
const multiSlots = appointments(threeDay, MONDAY);
check(multiSlots.length === 3, 'a three-day task splits into three appointments');
check(multiSlots.map(s => s.date).join(',') === '2026-08-10,2026-08-11,2026-08-12', 'one per consecutive working day');
check(multiSlots.every(s => s.start === '093000' && s.end === '170000'), 'every chunk is a full working day');

const multiIcs = buildIcs(project, [threeDay], consultant);
check(multiIcs.split('BEGIN:VEVENT').length - 1 === 3, 'three VEVENTs are emitted');
check(!multiIcs.includes('VALUE=DATE'), 'a multi-day task no longer produces an all-day event');
// A repeated UID lets Outlook treat later days as edits of the first.
const uids = [...multiIcs.matchAll(/UID:(.+)/g)].map(m => m[1].trim());
check(new Set(uids).size === uids.length, 'every chunk has a unique UID');
check(multiIcs.includes('(2/3)'), 'chunks are numbered so days can be told apart');
check(multiIcs.includes('CATEGORIES:Chargable'), 'chunks keep the category');

// A week-long task must not book the weekend — getSchedulePoint skips it, and
// walking the half-day indices inherits that for free.
const weekLong = task({
  id: 'week', startHalfDay: 0, endHalfDay: 13,
  plannedStartDate: MONDAY, plannedEndDate: '2026-08-18',
});
const weekSlots = appointments(weekLong, MONDAY);
check(weekSlots.length === 7, 'seven working days, not nine calendar days');
check(!weekSlots.some(s => s.date === '2026-08-15' || s.date === '2026-08-16'), 'the weekend is skipped');

// A day and a half starting in the afternoon: PM on day one, then a full day.
const splitDay = task({
  id: 'split', startHalfDay: 1, endHalfDay: 3,
  plannedStartDate: MONDAY, plannedEndDate: '2026-08-11',
});
const splitSlots = appointments(splitDay, MONDAY);
check(splitSlots.length === 2, 'a day and a half covers two dates');
check(splitSlots[0].start === '140000' && splitSlots[0].end === '170000', 'the first date is an afternoon only');
check(splitSlots[1].start === '093000' && splitSlots[1].end === '170000', 'the second date is a full day');

// Unscheduled or corrupt rows still fall back to an all-day event.
check(appointments(task({ startHalfDay: undefined, endHalfDay: undefined }), MONDAY).length === 0, 'no schedule means no timed slots');
check(appointments(task({ startHalfDay: 5, endHalfDay: 2 }), MONDAY).length === 0, 'an inverted index pair is rejected');
check(appointments(task({ startHalfDay: 0, endHalfDay: 5000 }), MONDAY).length === 0, 'an absurd span is refused rather than spun out');
check(appointments(task({ startHalfDay: 0, endHalfDay: 5 }), '').length === 0, 'a missing project start date does not throw');
check(ics.includes('DTSTART;VALUE=DATE:20260810'), 'a task with no half-day indices stays all-day');

// --- Outlook category and busy status --------------------------------------
check(ics.includes('CATEGORIES:Chargable'), 'appointments carry the Chargable category');
check(amIcs.includes('CATEGORIES:Chargable'), 'timed appointments carry it too');
check(amIcs.includes('X-MICROSOFT-CDO-BUSYSTATUS:BUSY') && amIcs.includes('TRANSP:OPAQUE'), 'timed appointments show as Busy');

// --- summary report --------------------------------------------------------
check(longDate('2026-08-10') === 'Mon 10 Aug 2026', 'dates read as a weekday and month');

const reportTasks = [
  task({ id: 'r1', name: 'Kick-off', pinkNumber: 'PK-1', startHalfDay: 0, endHalfDay: 0, plannedStartDate: MONDAY, plannedEndDate: MONDAY }),
  task({ id: 'r2', name: 'Data migration', startHalfDay: 2, endHalfDay: 7, plannedStartDate: '2026-08-11', plannedEndDate: '2026-08-13' }),
];
const report = bookings(project, reportTasks);
check(report.length === 4, 'a half day plus three full days is four appointments');

const text = buildSummaryText(project, consultant, report, MONDAY);
check(text.startsWith('Bookings for Acme Rollout'), 'the report is titled by project');
check(text.includes('Sam Reed'), 'the report names the consultant');
check(text.includes('Mon 10 Aug 2026') && text.includes('09:30 - 12:30'), 'a half day shows its morning slot');
check(text.includes('Tue 11 Aug 2026') && text.includes('09:30 - 17:00'), 'a full day shows working hours');
check(text.includes('[PK-1]'), 'pink numbers are carried into the report');
check(text.includes('Total: 3.5 days of effort across 4 working days.'), 'the total counts half days as half');
check(text.includes('4 appointments from Mon 10 Aug 2026'), 'the report states the count and start');

// The on-screen copy is built from the same tasks the export would select.
check(consultantSummaryText(project, all, consultant, '2026-08-01').includes('Bookings for Acme Rollout'), 'the on-screen summary is filtered like the export');
check(consultantSummaryText(project, all, consultant, '2027-01-01') === '', 'nothing to export means nothing to show');

const html = buildSummaryHtml(project, consultant, report, MONDAY);
check(html.includes('<table'), 'the html summary is a table');
check(html.includes('Data migration'), 'tasks appear in the html summary');
// The body is user data; a task name must not be able to inject markup.
check(!buildSummaryHtml(project, consultant,
  bookings(project, [task({ id: 'x', name: '<script>bad</script>', startHalfDay: 0, endHalfDay: 0, plannedStartDate: MONDAY, plannedEndDate: MONDAY })]),
  MONDAY).includes('<script>'), 'html in a task name is escaped');

// --- email draft -----------------------------------------------------------
const eml = buildEml(project, consultant, report, buildIcs(project, reportTasks, consultant),
  'Acme Rollout - Sam Reed - Calendar.ics', MONDAY, new Date('2026-08-05T09:15:00Z'));
check(eml.includes('Subject: Bookings for Acme Rollout'), 'the subject names the project');
check(eml.includes('X-Unsent: 1'), 'Outlook opens it as an editable draft, not a received message');
check(eml.includes('MIME-Version: 1.0'), 'it declares MIME');
check(!/[^\r]\n/.test(eml), 'every header line break is CRLF');

const boundary = eml.match(/boundary="([^"]+)"/)?.[1] ?? '';
check(boundary.length > 0, 'a multipart boundary is declared');
check(eml.split(`--${boundary}`).length - 1 === 3, 'two parts and a closing delimiter');
check(eml.includes('Content-Disposition: attachment; filename="Acme Rollout - Sam Reed - Calendar.ics"'), 'the calendar is attached by name');
check(eml.trimEnd().endsWith(`--${boundary}--`), 'the multipart body is closed');

// A line break in any header input must not be able to start a new header.
const injected = buildEml(
  { ...project, name: 'Acme\r\nBcc: everyone@example.com' } as Project,
  { ...consultant, email: 'sam@x.com\r\nBcc: leak@x.com' } as Consultant,
  report, 'ICS', 'cal\r\nX-Evil: 1.ics', MONDAY,
);
// The text may appear inside a value; what matters is that no LINE starts with
// it, because that is what makes it a header.
const injectedLines = injected.split('\r\n');
check(!injectedLines.some(l => /^Bcc:/i.test(l)), 'a line break in a project name or address cannot inject a header');
check(!injectedLines.some(l => /^X-Evil/i.test(l)), 'a line break in the attachment name cannot inject a header');
check(injected.includes('Subject: Bookings for Acme Bcc: everyone@example.com'), 'the text survives, flattened onto one line');
check(injected.includes('filename="cal X-Evil: 1.ics"'), 'the filename stays quoted on one line');
check(!buildEml(project, consultant, report, 'ICS', 'a"; x="b.ics', MONDAY).includes('a"; x='), 'a quote cannot close the filename parameter early');

// The attachment must decode back to the exact calendar that was passed in.
const parts = eml.split(`--${boundary}`);
const attachment = parts[2].split('\r\n\r\n')[1].replace(/\r\n/g, '');
const decoded = new TextDecoder().decode(Uint8Array.from(atob(attachment), ch => ch.charCodeAt(0)));
check(decoded === buildIcs(project, reportTasks, consultant), 'the attachment decodes to the calendar exactly');
check(decoded.startsWith('BEGIN:VCALENDAR'), 'the decoded attachment is a calendar');
// Base64 bodies must be wrapped or some servers reject the message.
check(attachment.length > 0 && parts[2].split('\r\n').every(l => l.length <= 998), 'no line exceeds the SMTP limit');

console.log('exportToIcs self-check passed');

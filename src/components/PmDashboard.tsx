import React, { useMemo, useState } from 'react';
import type { Consultant, Project, Task } from '../types';
import {
  FolderKanban, AlertTriangle, Hourglass, Rocket, Wallet, ListTodo,
  PauseCircle, UserX, CalendarClock, Users, ChevronRight, ShieldAlert
} from 'lucide-react';
import { isAdmin, type ActiveUser } from '../utils/permissions';
import { getProjectAccent, resolvePhase } from '../utils/phases';
import { billableDays, effectiveDurationDays, formatDate, isWeekend, parseDate } from '../utils/scheduler';
import { WinComboBox } from './winui/WinComboBox';
import { formatDateFriendly } from '../utils/dates';
import './PmDashboard.css';

/**
 * PM Overview — what a Project Manager acts on day to day, across the
 * projects they manage: tasks needing attention, go-lives + RAG, budget days
 * and team load over the next two weeks. Read-only; clicking anything opens
 * the project.
 */

interface Props {
  projects: Project[];
  tasks: Task[];
  consultants: Consultant[];
  activeUser: ActiveUser | null;
  onSelectProject: (projectId: string) => void;
}

const WINDOW_WORKDAYS = 10;   // "next 2 weeks"
const ALL_PMS = '__all__';

type AttentionKey = 'overdue' | 'customer' | 'onhold' | 'unassigned' | 'starting';

const RAG_DIMENSIONS: { key: keyof Project; label: string }[] = [
  { key: 'ragScope', label: 'Scope' },
  { key: 'ragSchedule', label: 'Users' },
  { key: 'ragCosts', label: 'Data' },
  { key: 'ragBenefits', label: 'Days' },
  { key: 'ragOverall', label: 'Overall' },
];

const RISK_KEYS = ['ragScopeRisks', 'ragScheduleRisks', 'ragCostsRisks', 'ragBenefitsRisks', 'ragOverallRisks'] as const;

function ragColor(v?: string | null) {
  const r = (v || 'green').toLowerCase();
  if (r === 'red') return 'var(--danger)';
  if (r === 'amber') return 'var(--warning)';
  return 'var(--success)';
}
function ragLabel(v?: string | null) {
  const r = (v || 'green').toLowerCase();
  return r === 'red' ? 'Off track' : r === 'amber' ? 'At risk' : 'On track';
}

/** Working days (Mon–Fri) between two dates inclusive. */
function workdaysBetween(a: Date, b: Date): number {
  if (b < a) return 0;
  let n = 0;
  const d = new Date(a);
  while (d <= b) {
    if (!isWeekend(d)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/** The date `n` working days after `from` (from counts as day 1 if a weekday). */
function addWorkdays(from: Date, n: number): Date {
  const d = new Date(from);
  let left = n;
  while (true) {
    if (!isWeekend(d)) left--;
    if (left <= 0) return d;
    d.setDate(d.getDate() + 1);
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="pmd-pill" style={{
      backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color,
      borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
    }}>{children}</span>
  );
}

export default function PmDashboard({ projects, tasks, consultants, activeUser, onSelectProject }: Props) {
  // Managers/admins can look at any PM; a Project Manager sees their own.
  const canPickPm = !!activeUser && (activeUser.role === 'Manager' || isAdmin(activeUser));
  const pmIds = useMemo(
    () => Array.from(new Set(projects.map(p => p.projectManagerId).filter((x): x is string => !!x))),
    [projects]
  );
  const pmOptions = useMemo(() => [
    { label: 'All project managers', value: ALL_PMS },
    ...pmIds
      .map(id => ({ label: consultants.find(c => c.id === id)?.name ?? 'Unknown user', value: id }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ], [pmIds, consultants]);

  const [pickedPm, setPickedPm] = useState<string>(() => {
    if (!canPickPm) return activeUser?.id ?? '';
    return activeUser && pmIds.includes(activeUser.id) ? activeUser.id : ALL_PMS;
  });
  const pmId = canPickPm ? pickedPm : (activeUser?.id ?? '');
  const [attentionTab, setAttentionTab] = useState<AttentionKey>('overdue');

  const data = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = formatDate(today);
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = formatDate(weekEnd);
    const windowEnd = addWorkdays(today, WINDOW_WORKDAYS);
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);

    const parentIds = new Set(tasks.map(t => t.parentId).filter(Boolean) as string[]);
    const isLeaf = (t: Task) => !parentIds.has(t.id);

    const myProjects = projects
      .filter(p => !p.isTemplate && p.status !== 'completed' && p.status !== 'cancelled')
      .filter(p => pmId === ALL_PMS ? !!p.projectManagerId : p.projectManagerId === pmId);
    const myProjectIds = new Set(myProjects.map(p => p.id));
    const projectById = new Map(myProjects.map(p => [p.id, p]));

    const myLeaves = tasks.filter(t => myProjectIds.has(t.projectId) && isLeaf(t));
    const open = myLeaves.filter(t => t.status !== 'completed');
    const endOf = (t: Task) => t.dueDate || t.plannedEndDate || null;
    const isLate = (t: Task) => { const e = endOf(t); return !!e && e < todayStr; };

    const byDate = (pick: (t: Task) => string | null | undefined) => (a: Task, b: Task) =>
      (pick(a) || '9999').localeCompare(pick(b) || '9999');

    const attention: Record<AttentionKey, Task[]> = {
      overdue: open.filter(t => isLate(t) && t.taskOwner !== 'Customer').sort(byDate(endOf)),
      customer: open.filter(t => isLate(t) && t.taskOwner === 'Customer').sort(byDate(endOf)),
      onhold: open.filter(t => t.status === 'on_hold').sort(byDate(endOf)),
      unassigned: open.filter(t => !t.assignedConsultantId && t.taskOwner !== 'Customer').sort(byDate(t => t.plannedStartDate)),
      starting: open.filter(t => t.status === 'not_started' && !!t.plannedStartDate
        && t.plannedStartDate >= todayStr && t.plannedStartDate <= weekEndStr).sort(byDate(t => t.plannedStartDate)),
    };

    // Per-project rollups
    const projectRows = myProjects.map(p => {
      const leaves = myLeaves.filter(t => t.projectId === p.id);
      const allocated = round1(billableDays(leaves));
      const doneDays = round1(billableDays(leaves.filter(t => t.status === 'completed')));
      const budget = p.budgetDays || 0;
      const usedPct = budget > 0 ? Math.round((allocated / budget) * 100) : 0;
      const goLive = p.targetGoLiveDate ? parseDate(p.targetGoLiveDate) : null;
      const daysToGoLive = goLive ? Math.round((goLive.getTime() - today.getTime()) / 86400000) : null;
      const openRisks = RISK_KEYS.flatMap(k => (p[k] ?? []).filter(r => !r.done).map(r => r.text));
      return {
        project: p, allocated, doneDays, budget, usedPct, daysToGoLive, openRisks,
        overdue: leaves.filter(t => t.status !== 'completed' && isLate(t)).length,
        total: leaves.length,
        completed: leaves.filter(t => t.status === 'completed').length,
      };
    });

    // Workload over the next 10 working days. A task's days are spread evenly
    // over its scheduled working days; only the slice inside the window counts.
    const windowDays = (t: Task): number => {
      if (!t.plannedStartDate || !t.plannedEndDate) return 0;
      const s = parseDate(t.plannedStartDate);
      const e = parseDate(t.plannedEndDate);
      if (e < today || s > windowEnd) return 0;
      const span = Math.max(1, workdaysBetween(s, e));
      const overlap = workdaysBetween(s < today ? today : s, e > windowEnd ? windowEnd : e);
      return effectiveDurationDays(t) * (overlap / span);
    };
    const activeProjectIds = new Set(projects.filter(p => !p.isTemplate && p.status !== 'completed' && p.status !== 'cancelled').map(p => p.id));
    const loadByPerson = new Map<string, { mine: number; total: number; tasks: number }>();
    tasks.forEach(t => {
      if (!t.assignedConsultantId || t.status === 'completed' || !isLeaf(t) || !activeProjectIds.has(t.projectId)) return;
      const d = windowDays(t);
      if (d <= 0) return;
      const cur = loadByPerson.get(t.assignedConsultantId) ?? { mine: 0, total: 0, tasks: 0 };
      cur.total += d;
      if (myProjectIds.has(t.projectId)) { cur.mine += d; cur.tasks++; }
      loadByPerson.set(t.assignedConsultantId, cur);
    });
    const workload = Array.from(loadByPerson.entries())
      .filter(([, v]) => v.mine > 0)
      .map(([id, v]) => ({
        consultant: consultants.find(c => c.id === id),
        id, mine: round1(v.mine), total: round1(v.total), tasks: v.tasks,
      }))
      .sort((a, b) => b.total - a.total);

    const goLivesSoon = projectRows.filter(r => r.daysToGoLive !== null && r.daysToGoLive >= 0 && parseDate(r.project.targetGoLiveDate!) <= in30).length;

    return {
      myProjects, projectById, attention, projectRows, workload,
      goLivesSoon,
      overBudget: projectRows.filter(r => r.budget > 0 && r.allocated > r.budget).length,
      windowEndLabel: formatDateFriendly(formatDate(windowEnd)),
    };
  }, [projects, tasks, consultants, pmId]);

  const consultantName = (id?: string | null) => consultants.find(c => c.id === id)?.name ?? null;
  const pmName = pmId === ALL_PMS ? 'all project managers' : (consultantName(pmId) ?? 'you');

  const attentionTabs: { key: AttentionKey; label: string; icon: React.ReactNode; color: string; empty: string }[] = [
    { key: 'overdue', label: 'Overdue', icon: <AlertTriangle size={14} />, color: 'var(--danger)', empty: 'Nothing overdue.' },
    { key: 'customer', label: 'Waiting on customer', icon: <Hourglass size={14} />, color: '#c2410c', empty: 'No overdue customer tasks.' },
    { key: 'onhold', label: 'On hold', icon: <PauseCircle size={14} />, color: 'var(--warning)', empty: 'No tasks on hold.' },
    { key: 'unassigned', label: 'Unassigned', icon: <UserX size={14} />, color: '#0ea5e9', empty: 'Every open Pinnacle task has an assignee.' },
    { key: 'starting', label: 'Starting this week', icon: <CalendarClock size={14} />, color: 'var(--primary)', empty: 'Nothing scheduled to start in the next 7 days.' },
  ];
  const activeTab = attentionTabs.find(t => t.key === attentionTab)!;
  const attentionList = data.attention[attentionTab];

  const kpis = [
    { icon: <FolderKanban size={20} />, value: data.myProjects.length, label: 'Active projects', color: 'var(--primary)' },
    { icon: <AlertTriangle size={20} />, value: data.attention.overdue.length, label: 'Overdue tasks', color: 'var(--danger)' },
    { icon: <Hourglass size={20} />, value: data.attention.customer.length, label: 'Waiting on customer', color: '#c2410c' },
    { icon: <Rocket size={20} />, value: data.goLivesSoon, label: 'Go-lives in 30 days', color: '#0ea5e9' },
    { icon: <Wallet size={20} />, value: data.overBudget, label: 'Over budget', color: 'var(--warning)' },
  ];

  return (
    <div className="pmd-root">
      <div className="pmd-header">
        <div>
          <h2 className="pmd-title">PM Overview</h2>
          <p className="pmd-subtitle">
            Active projects managed by <b>{pmName}</b>. Click any item to open the project.
          </p>
        </div>
        {canPickPm && (
          <div className="pmd-picker">
            <span className="pmd-picker-label">Project manager</span>
            <WinComboBox value={pmId} onChange={setPickedPm} options={pmOptions} />
          </div>
        )}
      </div>

      {data.myProjects.length === 0 ? (
        <div className="card pmd-empty">
          <FolderKanban size={28} />
          <p>
            {pmId === ALL_PMS
              ? 'No active projects have a Project Manager assigned yet.'
              : `No active projects list ${pmName === 'you' ? 'you' : pmName} as Project Manager.`}
          </p>
          <p className="pmd-muted">Set the Project Manager on a project (Edit project) and it will appear here.</p>
        </div>
      ) : (
        <>
          <div className="pmd-kpis">
            {kpis.map(k => (
              <div key={k.label} className="card pmd-kpi">
                <span className="pmd-kpi-icon" style={{ color: k.color, backgroundColor: `color-mix(in srgb, ${k.color} 15%, transparent)` }}>{k.icon}</span>
                <span className="pmd-kpi-value">{k.value}</span>
                <span className="pmd-kpi-label">{k.label}</span>
              </div>
            ))}
          </div>

          <div className="grid-cols-12">
            {/* Needs attention */}
            <section className="card col-span-8 pmd-card">
              <div className="card-header">
                <h3 className="card-title pmd-card-title"><ListTodo size={18} /> Needs attention</h3>
              </div>
              <div className="pmd-tabs" role="tablist" aria-label="Needs attention">
                {attentionTabs.map(t => (
                  <button key={t.key} type="button" role="tab" aria-selected={attentionTab === t.key}
                    className={`pmd-tab ${attentionTab === t.key ? 'pmd-tab-active' : ''}`}
                    style={attentionTab === t.key ? { borderColor: t.color, color: t.color } : undefined}
                    onClick={() => setAttentionTab(t.key)}
                  >
                    {t.icon} {t.label}
                    <span className="pmd-tab-count" style={data.attention[t.key].length ? { backgroundColor: t.color, color: 'white' } : undefined}>
                      {data.attention[t.key].length}
                    </span>
                  </button>
                ))}
              </div>
              {attentionList.length === 0 ? (
                <p className="pmd-muted pmd-list-empty">{activeTab.empty}</p>
              ) : (
                <ul className="pmd-list">
                  {attentionList.slice(0, 50).map(t => {
                    const p = data.projectById.get(t.projectId);
                    const assignee = consultantName(t.assignedConsultantId);
                    const dateLabel = attentionTab === 'starting' || attentionTab === 'unassigned'
                      ? (t.plannedStartDate ? `Starts ${formatDateFriendly(t.plannedStartDate)}` : 'Not scheduled')
                      : (t.dueDate || t.plannedEndDate) ? `Due ${formatDateFriendly(t.dueDate || t.plannedEndDate)}` : 'No date';
                    return (
                      <li key={t.id}>
                        <button type="button" className="pmd-list-item" onClick={() => onSelectProject(t.projectId)}>
                          <span className="pmd-dot" style={{ backgroundColor: p ? getProjectAccent(p) : 'var(--text-tertiary)' }} />
                          <span className="pmd-list-main">
                            <span className="pmd-list-name">{t.name}</span>
                            <span className="pmd-list-meta">{p?.name}{p?.clientName ? ` · ${p.clientName}` : ''}</span>
                          </span>
                          <span className="pmd-list-side">
                            <span className="pmd-list-date" style={attentionTab === 'overdue' || attentionTab === 'customer' ? { color: activeTab.color } : undefined}>{dateLabel}</span>
                            <span className="pmd-list-meta">{assignee ?? (t.taskOwner === 'Customer' ? 'Customer' : 'Unassigned')}</span>
                          </span>
                          <ChevronRight size={15} className="pmd-chevron" />
                        </button>
                      </li>
                    );
                  })}
                  {attentionList.length > 50 && <li className="pmd-muted pmd-list-more">+ {attentionList.length - 50} more</li>}
                </ul>
              )}
            </section>

            {/* Team workload */}
            <section className="card col-span-4 pmd-card">
              <div className="card-header">
                <h3 className="card-title pmd-card-title"><Users size={18} /> Team workload</h3>
              </div>
              <p className="pmd-muted pmd-small">Days scheduled over the next {WINDOW_WORKDAYS} working days (to {data.windowEndLabel}). Capacity is {WINDOW_WORKDAYS} days.</p>
              {data.workload.length === 0 ? (
                <p className="pmd-muted pmd-list-empty">No scheduled work for your team in this window.</p>
              ) : (
                <ul className="pmd-load">
                  {data.workload.map(w => {
                    const over = w.total > WINDOW_WORKDAYS;
                    const tight = !over && w.total > WINDOW_WORKDAYS * 0.8;
                    const color = over ? 'var(--danger)' : tight ? 'var(--warning)' : 'var(--success)';
                    const scale = Math.max(WINDOW_WORKDAYS, w.total);
                    return (
                      <li key={w.id} className="pmd-load-row">
                        <div className="pmd-load-head">
                          <span className="pmd-avatar" style={{ backgroundColor: w.consultant?.avatarColor || '#1e3449' }}>
                            {(w.consultant?.name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </span>
                          <span className="pmd-load-name">{w.consultant?.name ?? 'Unknown'}</span>
                          {over && <Pill color="var(--danger)">Overloaded</Pill>}
                          <span className="pmd-load-num" style={{ color }}>{w.total}d</span>
                        </div>
                        <div className="pmd-bar" title={`${w.mine}d on these projects, ${round1(w.total - w.mine)}d on other projects`}>
                          <div className="pmd-bar-fill" style={{ width: `${(w.mine / scale) * 100}%`, backgroundColor: color }} />
                          <div className="pmd-bar-fill pmd-bar-other" style={{ width: `${((w.total - w.mine) / scale) * 100}%`, backgroundColor: color }} />
                          <div className="pmd-bar-cap" style={{ left: `${(WINDOW_WORKDAYS / scale) * 100}%` }} />
                        </div>
                        <span className="pmd-muted pmd-small">
                          {w.mine}d on these projects ({w.tasks} task{w.tasks === 1 ? '' : 's'}){w.total > w.mine ? ` · ${round1(w.total - w.mine)}d elsewhere` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Go-lives & RAG */}
            <section className="card col-span-12 pmd-card">
              <div className="card-header">
                <h3 className="card-title pmd-card-title"><Rocket size={18} /> Go-lives &amp; RAG</h3>
              </div>
              <div className="pmd-golive-grid">
                {[...data.projectRows]
                  .sort((a, b) => (a.daysToGoLive ?? 99999) - (b.daysToGoLive ?? 99999))
                  .map(r => {
                    const p = r.project;
                    const dtg = r.daysToGoLive;
                    const goLiveColor = dtg === null ? 'var(--text-tertiary)' : dtg < 0 ? 'var(--danger)' : dtg <= 14 ? 'var(--warning)' : 'var(--success)';
                    return (
                      <button key={p.id} type="button" className="pmd-golive" style={{ borderTopColor: getProjectAccent(p) }} onClick={() => onSelectProject(p.id)}>
                        <div className="pmd-golive-head">
                          <span className="pmd-golive-name">{p.name}</span>
                          <span className="pmd-muted pmd-small">{p.clientName} · {resolvePhase(p)}</span>
                        </div>
                        <div className="pmd-golive-date">
                          <span className="pmd-golive-days" style={{ color: goLiveColor }}>
                            {dtg === null ? 'No go-live date' : dtg < 0 ? `${Math.abs(dtg)} days past go-live` : dtg === 0 ? 'Go-live today' : `${dtg} days to go-live`}
                          </span>
                          {p.targetGoLiveDate && <span className="pmd-muted pmd-small">{formatDateFriendly(p.targetGoLiveDate)}</span>}
                        </div>
                        <div className="pmd-rag">
                          {RAG_DIMENSIONS.map(d => {
                            const v = p[d.key] as string | undefined;
                            return (
                              <span key={d.key} className={`pmd-rag-item ${d.key === 'ragOverall' ? 'pmd-rag-overall' : ''}`} title={`${d.label}: ${ragLabel(v)}`}>
                                <span className="pmd-rag-dot" style={{ backgroundColor: ragColor(v) }} />
                                {d.label}
                              </span>
                            );
                          })}
                        </div>
                        <div className="pmd-golive-foot">
                          <span className="pmd-small">{r.completed}/{r.total} tasks done</span>
                          {r.overdue > 0 && <Pill color="var(--danger)">{r.overdue} overdue</Pill>}
                        </div>
                        {(p.ragOverallReason || r.openRisks.length > 0) && (
                          <div className="pmd-risks">
                            {p.ragOverallReason && <p className="pmd-small pmd-reason">{p.ragOverallReason}</p>}
                            {r.openRisks.length > 0 && (
                              <>
                                <span className="pmd-risks-label"><ShieldAlert size={12} /> {r.openRisks.length} open risk{r.openRisks.length === 1 ? '' : 's'}</span>
                                <ul>
                                  {r.openRisks.slice(0, 3).map((txt, i) => <li key={i}>{txt}</li>)}
                                  {r.openRisks.length > 3 && <li className="pmd-muted">+ {r.openRisks.length - 3} more</li>}
                                </ul>
                              </>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>
            </section>

            {/* Budget days */}
            <section className="card col-span-12 pmd-card">
              <div className="card-header">
                <h3 className="card-title pmd-card-title"><Wallet size={18} /> Budget days</h3>
              </div>
              <p className="pmd-muted pmd-small">Days planned in the task list vs the project's budget days. Customer-owned tasks are excluded.</p>
              <div className="pmd-budget">
                <div className="pmd-budget-row pmd-budget-headrow">
                  <span>Project</span><span>Planned / budget</span><span>Completed</span><span className="pmd-budget-barcol">Planned vs budget</span>
                </div>
                {[...data.projectRows]
                  .sort((a, b) => b.usedPct - a.usedPct)
                  .map(r => {
                    const over = r.budget > 0 && r.allocated > r.budget;
                    const tight = !over && r.usedPct >= 90;
                    const color = over ? 'var(--danger)' : tight ? 'var(--warning)' : 'var(--success)';
                    const scale = Math.max(r.budget, r.allocated, 1);
                    return (
                      <button key={r.project.id} type="button" className="pmd-budget-row" onClick={() => onSelectProject(r.project.id)}>
                        <span className="pmd-budget-name">
                          <span className="pmd-dot" style={{ backgroundColor: getProjectAccent(r.project) }} />
                          {r.project.name}
                        </span>
                        <span className="pmd-budget-num">
                          <b style={{ color: over ? 'var(--danger)' : undefined }}>{r.allocated}d</b> / {r.budget ? `${r.budget}d` : 'no budget'}
                          {over && <Pill color="var(--danger)">+{round1(r.allocated - r.budget)}d over</Pill>}
                        </span>
                        <span className="pmd-budget-num">{r.doneDays}d</span>
                        <span className="pmd-budget-barcol">
                          <span className="pmd-bar">
                            <span className="pmd-bar-fill" style={{ width: `${(r.allocated / scale) * 100}%`, backgroundColor: color }} />
                            {r.budget > 0 && <span className="pmd-bar-cap" style={{ left: `${(r.budget / scale) * 100}%` }} />}
                          </span>
                          <span className="pmd-budget-pct" style={{ color }}>{r.budget > 0 ? `${r.usedPct}%` : '—'}</span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import type { Project, Task, Consultant } from '../types';
import {
  FolderKanban, Clock, CheckSquare, Users, AlertTriangle,
  Calendar, CheckCircle2, Circle, ChevronLeft, ChevronRight,
  BarChart3, Activity, Gauge, Flag, PieChart, Layers, AlertCircle, CalendarClock
} from 'lucide-react';
import { isCustomer as isCustomerUser, isManager as isManagerUser, isAdmin, type ActiveUser } from '../utils/permissions';
import PmDashboard from './PmDashboard';
import { getProjectAccent, resolvePhase, resolvePhaseMeta, PHASE_ORDER } from '../utils/phases';
import { billableDays } from '../utils/scheduler';

// Status metadata shared across analytics/health views
const STATUS_META: Record<Task['status'], { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'var(--text-tertiary)' },
  in_progress: { label: 'In Progress', color: 'var(--primary)' },
  on_hold: { label: 'On Hold', color: 'var(--warning)' },
  completed: { label: 'Completed', color: 'var(--success)' }
};

/** Lightweight SVG donut chart driven by colored segments. */
function DonutChart({ segments, size = 148, thickness = 22 }: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth={thickness} />
        ) : segments.map((s, i) => {
          if (s.value === 0) return null;
          const len = (s.value / total) * circ;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
              strokeWidth={thickness} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </g>
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '1.6rem', fontWeight: 800, fill: 'var(--text-primary)' }}>{total}</text>
      <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '0.7rem', fill: 'var(--text-tertiary)' }}>tasks</text>
    </svg>
  );
}

/** Thin horizontal progress/stat bar. */
function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 8, backgroundColor: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
    </div>
  );
}

/** Small rounded pill used for inline metrics/flags. */
function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.5rem', borderRadius: 'var(--radius-sm)',
      backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`, whiteSpace: 'nowrap'
    }}>{children}</span>
  );
}

export function formatDateFriendly(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const monthIndex = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const getOrdinalSuffix = (d: number) => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
      case 1:  return "st";
      case 2:  return "nd";
      case 3:  return "rd";
      default: return "th";
    }
  };
  
  return `${day}${getOrdinalSuffix(day)} of ${months[monthIndex]}`;
}

/** Format an ISO datetime string as e.g. "1st June 2026 at 2:30 PM" */
export function formatDateTimeFriendly(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const getOrdinalSuffix = (n: number) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return `${day}${getOrdinalSuffix(day)} ${month} ${year} at ${time}`;
}

interface DashboardProps {
  projects: Project[];
  tasks: Task[];
  consultants: Consultant[];
  activeUserId: string;
  activeUser: ActiveUser | null;
  onSelectProject: (projectId: string) => void;
  onUpdateTask: (task: Task) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function Dashboard({
  projects,
  tasks,
  consultants,
  activeUserId,
  activeUser,
  onSelectProject,
  onUpdateTask,
  onAddToast
}: DashboardProps) {
  const isConsultant = activeUserId !== 'admin';
  // PM Overview is for Project Managers, Managers and admins (internal only).
  const canSeePmOverview = !isCustomerUser(activeUser) && (isManagerUser(activeUser) || isAdmin(activeUser));
  const [dashboardMode, setDashboardMode] = useState<'pm' | 'team' | 'personal' | 'projects' | 'calendar' | 'analytics' | 'health' | 'resource' | 'timeline'>(
    () => activeUser?.role === 'Project Manager' ? 'pm' : (isConsultant ? 'personal' : 'team')
  );
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selectedCalendarConsultantId, setSelectedCalendarConsultantId] = useState<string>(activeUserId);

  // My Agenda State
  const [agendaShowAllTasks, setAgendaShowAllTasks] = useState(false);
  const [inlineEditingTaskId, setInlineEditingTaskId] = useState<string | null>(null);
  const [inlineEditField, setInlineEditField] = useState<'pinkNumber' | null>(null);
  const [inlineEditForm, setInlineEditForm] = useState<{ pinkNumber: string }>({ pinkNumber: '' });
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  const userIsCustomer = isCustomerUser(activeUser);

  // Active User Agenda & KPIs.
  // myProjects uses the unified membership predicate so it reflects RBAC: a
  // user sees projects where they're PM, lead, a resource, or the customer.
  const myProjects = projects.filter(p => {
    if (p.projectManagerId === activeUserId) return true;
    if (p.leadConsultantId === activeUserId) return true;
    if ((p.projectResourceIds ?? []).includes(activeUserId)) return true;
    if ((p.consultantIds ?? []).includes(activeUserId)) return true;
    if (p.customerId === activeUserId) return true;
    return false;
  });
  const myTasks = tasks.filter(t => 
    t.assignedConsultantId === activeUserId && 
    !tasks.some(c => c.parentId === t.id) // Only leaf tasks
  );
  
  const completedMyTasks = myTasks.filter(t => t.status === 'completed').length;
  const myTasksCompletion = myTasks.length > 0 ? Math.round((completedMyTasks / myTasks.length) * 100) : 0;
  const myTotalAllocatedDays = myTasks.reduce((acc, t) => acc + t.durationDays, 0);

  // Filter and group agenda tasks
  const filteredMyTasks = agendaShowAllTasks ? myTasks : myTasks.filter(t => t.status !== 'completed');
  
  // Group by project
  const tasksByProject = filteredMyTasks.reduce((acc, task) => {
    if (!acc[task.projectId]) acc[task.projectId] = [];
    acc[task.projectId].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  // Sort each group chronologically
  Object.keys(tasksByProject).forEach(projectId => {
    tasksByProject[projectId].sort((a, b) => (a.plannedStartDate || '').localeCompare(b.plannedStartDate || ''));
  });

  const handleInlineSave = (task: Task) => {
    if (!inlineEditingTaskId) return;
    onUpdateTask({ ...task, pinkNumber: inlineEditForm.pinkNumber });
    setInlineEditingTaskId(null);
    setInlineEditField(null);
  };

  // Team Dashboard calculations
  const totalProjects = projects.length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  const totalBudgetDays = projects.reduce((acc, p) => acc + p.budgetDays, 0);
  const totalAllocatedDays = tasks.reduce((acc, t) => {
    const isParent = tasks.some(c => c.parentId === t.id);
    return isParent ? acc : acc + t.durationDays;
  }, 0);

  const consultantWorkload = consultants.map(c => {
    const assignedTasks = tasks.filter(t => t.assignedConsultantId === c.id);
    const totalDays = assignedTasks.reduce((acc, t) => {
      const isParent = tasks.some(sub => sub.parentId === t.id);
      return isParent ? acc : acc + t.durationDays;
    }, 0);
    return {
      ...c,
      totalDays,
      taskCount: assignedTasks.length
    };
  });

  const getDaysLeft = (targetDateStr?: string) => {
    if (!targetDateStr) return { days: 0, text: 'Not set', status: 'info' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDateStr);
    target.setHours(0, 0, 0, 0);
    
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { days: diffDays, text: `${Math.abs(diffDays)} days overdue`, status: 'danger' };
    } else if (diffDays === 0) {
      return { days: 0, text: 'Go-Live Today!', status: 'warning' };
    } else {
      return { days: diffDays, text: `${diffDays} days left`, status: 'success' };
    }
  };

  // ---- Shared computations for Analytics / Health / Resource / Timeline ----
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const toDateMid = (s?: string | null) => {
    if (!s) return null;
    const d = new Date(s);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  };
  const isLeaf = (t: Task) => !tasks.some(c => c.parentId === t.id);
  const leafTasks = tasks.filter(isLeaf);

  const statusCounts: Record<Task['status'], number> = { not_started: 0, in_progress: 0, on_hold: 0, completed: 0 };
  leafTasks.forEach(t => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });

  const overdueTasksAll = leafTasks.filter(t => {
    if (t.status === 'completed') return false;
    const d = toDateMid(t.dueDate || t.plannedEndDate);
    return d != null && d < todayMid;
  });

  const computeProjectStats = (project: Project) => {
    const pTasks = tasks.filter(t => t.projectId === project.id);
    const pLeaf = pTasks.filter(isLeaf);
    const allocated = billableDays(pLeaf);
    const completed = pTasks.filter(t => t.status === 'completed').length;
    const pct = pTasks.length ? Math.round((completed / pTasks.length) * 100) : 0;
    const overBudget = allocated > project.budgetDays;
    const overdue = pLeaf.filter(t => {
      if (t.status === 'completed') return false;
      const d = toDateMid(t.dueDate || t.plannedEndDate);
      return d != null && d < todayMid;
    }).length;
    const onHold = pLeaf.filter(t => t.status === 'on_hold').length;
    const goLive = getDaysLeft(project.targetGoLiveDate);
    const isDone = project.status === 'completed';
    const isCancelled = project.status === 'cancelled';

    let score = 100;
    if (overBudget) score -= 25;
    score -= Math.min(30, overdue * 6);
    score -= Math.min(15, onHold * 3);
    if (!isDone && goLive.status === 'danger') score -= 20;
    else if (!isDone && goLive.status === 'warning') score -= 5;
    if (isDone) score = 100;
    score = Math.max(0, Math.min(100, score));

    const band = isCancelled ? { label: 'Cancelled', color: 'var(--text-tertiary)' }
      : isDone ? { label: 'Delivered', color: 'var(--success)' }
      : score >= 80 ? { label: 'On Track', color: 'var(--success)' }
      : score >= 55 ? { label: 'Needs Attention', color: 'var(--warning)' }
      : { label: 'At Risk', color: 'var(--danger)' };

    return { pTasks, pLeaf, allocated, completed, pct, overBudget, overdue, onHold, goLive, score, band, isDone, isCancelled, total: pTasks.length };
  };

  const projectStats = projects.map(p => ({ project: p, stats: computeProjectStats(p) }));

  return (
    <div>
      {/* Dashboard views — underline tabs */}
      <div className="tabbar" style={{ marginBottom: '24px' }}>
      <div className="tabs" role="tablist">
        {([
          ...(canSeePmOverview ? [{ id: 'pm', label: 'PM Overview', internalOnly: true }] : []),
          { id: 'team', label: 'Team Overview', internalOnly: true },
          { id: 'analytics', label: 'Analytics', internalOnly: true },
          { id: 'health', label: 'Health', internalOnly: true },
          { id: 'resource', label: 'Resources', internalOnly: true },
          { id: 'timeline', label: 'Timeline', internalOnly: true },
          { id: 'projects', label: 'Projects' },
          { id: 'calendar', label: 'Calendar', internalOnly: true },
          ...(isConsultant ? [{ id: 'personal', label: 'My Agenda', internalOnly: false }] : [])
        ] as { id: string; label: string; internalOnly?: boolean }[])
        .filter(tab => !userIsCustomer || !tab.internalOnly)
        .map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={dashboardMode === tab.id}
            className={dashboardMode === tab.id ? 'active' : ''}
            onClick={() => setDashboardMode(tab.id as typeof dashboardMode)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      </div>

      {dashboardMode === 'personal' && activeUser && (
        // PERSONAL USER DASHBOARD
        <div>
          <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '60px', height: '60px', borderRadius: 'var(--radius-lg)',
              backgroundColor: activeUser.avatarColor || 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 700, fontSize: '1.25rem', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              {activeUser.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <h2 style={{ fontSize: '1.6rem', letterSpacing: '-0.01em', margin: 0 }}>Welcome back, {activeUser.name.split(' ')[0]}!</h2>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '1rem', marginTop: '0.2rem' }}>
                {activeUser.role} · Here's your project overview
              </p>
            </div>
          </div>

          {/* Personal KPIs */}
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-icon-wrapper" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                <FolderKanban size={24} />
              </div>
              <div className="kpi-details">
                <span className="kpi-value">{myProjects.length}</span>
                <span className="kpi-label">Assigned Projects</span>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon-wrapper" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 18%, transparent)', color: 'var(--warning)' }}>
                <Clock size={24} />
              </div>
              <div className="kpi-details">
                <span className="kpi-value">{myTotalAllocatedDays} days</span>
                <span className="kpi-label">Allocated Workload</span>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon-wrapper" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                <CheckSquare size={24} />
              </div>
              <div className="kpi-details">
                <span className="kpi-value">{myTasksCompletion}%</span>
                <span className="kpi-label">My Tasks Done</span>
              </div>
            </div>
          </div>

          {/* User Agenda Calendar List */}
          <div className="grid-cols-12">
            <div className="card col-span-12">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={18} /> My Agenda & Upcoming Schedules
                </h3>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <input 
                      type="checkbox" 
                      checked={agendaShowAllTasks} 
                      onChange={(e) => setAgendaShowAllTasks(e.target.checked)} 
                    />
                    Show all tasks
                  </label>
                </div>
              </div>

              {Object.keys(tasksByProject).length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '3rem 0' }}>
                  You do not have any tasks assigned in active projects.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {Object.keys(tasksByProject).map(projectId => {
                    const project = projects.find(p => p.id === projectId);
                    return (
                      <div key={projectId}>
                        <h4 style={{ 
                          fontSize: '1rem', 
                          fontWeight: 600, 
                          marginBottom: '0.75rem', 
                          paddingBottom: '0.5rem', 
                          borderBottom: '1px solid var(--border-color)',
                          color: getProjectAccent(project)
                        }}>
                          {project?.name || 'Unknown Project'}
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 'normal', marginLeft: '0.5rem' }}>
                            ({project?.clientName})
                          </span>
                        </h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {tasksByProject[projectId].map(task => (
                            <div 
                              key={task.id}
                              className="task-row"
                              onMouseEnter={() => setHoveredTaskId(task.id)}
                              onMouseLeave={() => setHoveredTaskId(null)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                padding: '0.875rem 1.25rem',
                                backgroundColor: task.status === 'completed' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                                opacity: task.status === 'completed' ? 0.75 : 1,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                {/* Complete status indicator */}
                                <div 
                                  style={{ cursor: 'pointer', color: task.status === 'completed' ? 'var(--success)' : 'var(--text-tertiary)' }}
                                  onClick={() => {
                                    const nextStatus = task.status === 'completed' ? 'not_started' : 'completed';
                                    onUpdateTask({ ...task, status: nextStatus as Task['status'] });
                                    onAddToast(nextStatus === 'completed' ? 'Marked task completed!' : 'Marked task incomplete.', 'success');
                                  }}
                                >
                                  {task.status === 'completed' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span
                                      style={{
                                        fontWeight: 600,
                                        fontSize: '1.05rem',
                                        textDecoration: task.status === 'completed' ? 'line-through' : 'none'
                                      }}
                                    >
                                      {task.name}
                                    </span>
                                    
                                    {/* Pink Number Inline Edit block */}
                                    {inlineEditingTaskId === task.id && inlineEditField === 'pinkNumber' ? (
                                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
                                        <input 
                                          type="text" 
                                          className="form-input" 
                                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', minHeight: 'auto', width: '100px' }}
                                          placeholder="Pink #"
                                          value={inlineEditForm.pinkNumber || ''}
                                          onChange={(e) => setInlineEditForm({ ...inlineEditForm, pinkNumber: e.target.value })}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleInlineSave(task);
                                            if (e.key === 'Escape') { setInlineEditingTaskId(null); setInlineEditField(null); }
                                          }}
                                        />
                                        <button className="btn btn-primary" style={{ padding: '0.1rem 0.4rem', minHeight: 'auto', borderRadius: '4px' }} onClick={() => handleInlineSave(task)}>
                                          <CheckCircle2 size={14} />
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        {task.pinkNumber && (
                                          <span style={{ fontSize: '0.68rem', backgroundColor: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }} title="Pink Number" onClick={(e) => { e.stopPropagation(); setInlineEditingTaskId(task.id); setInlineEditField('pinkNumber'); setInlineEditForm({ pinkNumber: task.pinkNumber || '' }); }}>
                                            {'Pink #: '}{task.pinkNumber}
                                          </span>
                                        )}
                                        {!task.pinkNumber && (
                                          <span
                                            className="add-pink-number-btn"
                                            style={{
                                              fontSize: '0.68rem',
                                              color: 'var(--text-tertiary)',
                                              border: '1px dashed var(--border-color)',
                                              background: 'transparent',
                                              padding: '0.05rem 0.35rem',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              fontWeight: 600,
                                              opacity: hoveredTaskId === task.id ? 1 : 0,
                                              transition: 'opacity 0.2s',
                                              pointerEvents: hoveredTaskId === task.id ? 'auto' : 'none'
                                            }}
                                            onClick={(e) => { e.stopPropagation(); setInlineEditingTaskId(task.id); setInlineEditField('pinkNumber'); setInlineEditForm({ pinkNumber: '' }); }}
                                          >
                                            + Add Pink Number
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.88rem', color: 'var(--text-tertiary)' }}>
                                    <span>Duration: <b>{task.durationDays} days</b></span>
                                    {task.plannedStartDate && (
                                      <>
                                        <span>•</span>
                                        <span>Start: <b>{formatDateFriendly(task.plannedStartDate)}</b></span>
                                        <span>•</span>
                                        <span>End: <b>{formatDateFriendly(task.plannedEndDate)}</b></span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Integration Quick Sync Actions */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className={`badge badge-${
                                  task.status === 'completed' ? 'success' : 
                                  task.status === 'in_progress' ? 'primary' : 
                                  task.status === 'on_hold' ? 'warning' : 'secondary'
                                }`}>
                                  {task.status.replace('_', ' ')}
                                </span>

                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {dashboardMode === 'pm' && canSeePmOverview && (
        <PmDashboard
          projects={projects}
          tasks={tasks}
          consultants={consultants}
          activeUser={activeUser}
          onSelectProject={onSelectProject}
        />
      )}

      {dashboardMode === 'team' && (
        // TEAM DASHBOARD
        <div>
          <div className="kpi-grid">
            {[
              {
                icon: <FolderKanban size={20} />,
                value: totalProjects,
                label: 'Active Projects',
                iconBg: 'color-mix(in srgb, var(--primary) 16%, transparent)',
                iconColor: 'var(--primary)'
              },
              {
                icon: <Clock size={20} />,
                value: `${totalAllocatedDays} / ${totalBudgetDays}d`,
                label: 'Time Budget Used',
                iconBg: 'color-mix(in srgb, var(--warning) 18%, transparent)',
                iconColor: 'var(--warning)'
              },
              {
                icon: <CheckSquare size={20} />,
                value: `${completionPercentage}%`,
                label: 'Task Completion',
                iconBg: 'color-mix(in srgb, var(--success) 16%, transparent)',
                iconColor: 'var(--success)'
              },
              {
                icon: <Users size={20} />,
                value: consultants.length,
                label: 'Consultants',
                iconBg: 'color-mix(in srgb, #0ea5e9 16%, transparent)',
                iconColor: '#0ea5e9'
              }
            ].map((kpi, i) => (
              <div key={i} className="card kpi-card" style={{ padding: '1.5rem 1.75rem' }}>
                <div className="kpi-icon-wrapper" style={{ background: kpi.iconBg, color: kpi.iconColor, width: '44px', height: '44px', borderRadius: 'var(--radius-lg)' }}>
                  {kpi.icon}
                </div>
                <div className="kpi-details">
                  <span className="kpi-value" style={{ fontSize: '1.6rem', letterSpacing: '-0.03em' }}>{kpi.value}</span>
                  <span className="kpi-label" style={{ marginTop: '0.15rem' }}>{kpi.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid-cols-12">
            {/* Project Summaries */}
            <div className="card col-span-8">
              <div className="card-header">
                <h3 className="card-title">Projects Status</h3>
              </div>
              {projects.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>
                  No projects created yet. Go to settings or click 'Create Project' in Project view.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {projects.map(project => {
                    const projectTasks = tasks.filter(t => t.projectId === project.id);
                    const projectLeafTasks = projectTasks.filter(t => !tasks.some(c => c.parentId === t.id));
                    const projectAllocated = billableDays(projectLeafTasks);
                    const projectCompleted = projectTasks.filter(t => t.status === 'completed').length;
                    const pct = projectTasks.length > 0 ? Math.round((projectCompleted / projectTasks.length) * 100) : 0;
                    
                    const isOverBudget = projectAllocated > project.budgetDays;

                    return (
                      <div 
                        key={project.id}
                        onClick={() => onSelectProject(project.id)}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          padding: '1rem',
                          cursor: 'pointer',
                          transition: 'border-color var(--transition-fast)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h4 style={{ fontWeight: 700, fontSize: '1.1rem' }}>{project.name}</h4>
                            <span style={{ fontSize: '0.92rem', color: 'var(--text-tertiary)' }}>Client: {project.clientName}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {isOverBudget && (
                              <span className="badge badge-danger" style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                <AlertTriangle size={13} /> Over Budget
                              </span>
                            )}
                            <span className="badge badge-primary">{pct}% Complete</span>
                          </div>
                        </div>

                        {/* Progress details */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.92rem', marginBottom: '0.35rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Budget Allocation: {projectAllocated} / {project.budgetDays} days</span>
                            <span style={{ fontWeight: 700 }}>{Math.round((projectAllocated / project.budgetDays) * 100)}%</span>
                          </div>
                          <div style={{ height: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                backgroundColor: isOverBudget ? 'var(--danger)' : 'var(--accent)',
                                width: `${Math.min(100, (projectAllocated / project.budgetDays) * 100)}%`,
                                transition: 'width 0.3s ease',
                                borderRadius: '4px'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Consultant Workload */}
            <div className="card col-span-4">
              <div className="card-header">
                <h3 className="card-title">Consultant Workload</h3>
              </div>
              {consultants.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>
                  No consultants created yet. Set up team in Settings.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {consultantWorkload.map(c => {
                    const isOverloaded = c.totalDays > 10;
                    
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.6rem 0' }}>
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            backgroundColor: c.avatarColor || 'var(--primary)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '0.95rem',
                            flexShrink: 0
                          }}
                        >
                          {c.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '1rem' }}>{c.name}</span>
                            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: isOverloaded ? 'var(--danger)' : 'var(--text-secondary)' }}>
                              {c.totalDays} days
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{c.role}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{c.taskCount} tasks</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================ ANALYTICS & REPORTS ============================ */}
      {dashboardMode === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="kpi-grid">
            {[
              { icon: <FolderKanban size={20} />, value: totalProjects, label: 'Total Projects', c: 'var(--primary)' },
              { icon: <CheckSquare size={20} />, value: totalTasks, label: 'Total Tasks', c: '#0ea5e9' },
              { icon: <CheckCircle2 size={20} />, value: `${completionPercentage}%`, label: 'Overall Completion', c: 'var(--success)' },
              { icon: <Clock size={20} />, value: `${totalAllocatedDays}d`, label: 'Allocated Effort', c: 'var(--warning)' }
            ].map((k, i) => (
              <div key={i} className="card kpi-card" style={{ padding: '1.5rem 1.75rem' }}>
                <div className="kpi-icon-wrapper" style={{ background: `color-mix(in srgb, ${k.c} 16%, transparent)`, color: k.c, width: '44px', height: '44px', borderRadius: 'var(--radius-lg)' }}>{k.icon}</div>
                <div className="kpi-details">
                  <span className="kpi-value" style={{ fontSize: '1.6rem', letterSpacing: '-0.03em' }}>{k.value}</span>
                  <span className="kpi-label" style={{ marginTop: '0.15rem' }}>{k.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid-cols-12">
            {/* Task status donut */}
            <div className="card col-span-4">
              <div className="card-header">
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><PieChart size={18} /> Task Status</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <DonutChart segments={(['completed', 'in_progress', 'on_hold', 'not_started'] as Task['status'][]).map(s => ({ label: STATUS_META[s].label, value: statusCounts[s], color: STATUS_META[s].color }))} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', minWidth: '150px' }}>
                  {(['completed', 'in_progress', 'on_hold', 'not_started'] as Task['status'][]).map(s => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: STATUS_META[s].color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{STATUS_META[s].label}</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{statusCounts[s]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Projects by phase */}
            <div className="card col-span-8">
              <div className="card-header">
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Layers size={18} /> Projects by Phase</h3>
              </div>
              {(() => {
                const counts = PHASE_ORDER.map(ph => ({ phase: ph, count: projects.filter(p => resolvePhase(p) === ph).length }));
                const maxC = Math.max(1, ...counts.map(c => c.count));
                if (!counts.some(c => c.count > 0)) return <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '1.5rem 0' }}>No project phase data yet.</p>;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {counts.map(c => (
                      <div key={c.phase} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 32px', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{c.phase}</span>
                        <StatBar value={c.count} max={maxC} color={resolvePhaseMeta({ phase: c.phase }).accent} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.count}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Budget vs allocated */}
            <div className="card col-span-12">
              <div className="card-header">
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BarChart3 size={18} /> Budget vs. Allocated Effort</h3>
              </div>
              {projects.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '1.5rem 0' }}>No projects yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                  {projectStats.map(({ project, stats }) => (
                    <div key={project.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', gap: '1rem' }}>
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                        <span style={{ color: stats.overBudget ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 700, flexShrink: 0 }}>{stats.allocated} / {project.budgetDays}d</span>
                      </div>
                      <StatBar value={stats.allocated} max={project.budgetDays || stats.allocated || 1} color={stats.overBudget ? 'var(--danger)' : 'var(--accent)'} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================ PROJECT HEALTH & RISKS ============================ */}
      {dashboardMode === 'health' && (() => {
        const active = projectStats.filter(ps => !ps.stats.isCancelled);
        const atRisk = active.filter(ps => ps.stats.band.label === 'At Risk').length;
        const overBudgetCount = active.filter(ps => ps.stats.overBudget).length;
        const avgScore = active.length ? Math.round(active.reduce((a, ps) => a + ps.stats.score, 0) / active.length) : 100;
        const sorted = [...projectStats].sort((a, b) => a.stats.score - b.stats.score);
        const avgColor = avgScore >= 80 ? 'var(--success)' : avgScore >= 55 ? 'var(--warning)' : 'var(--danger)';

        const alerts: { text: string; color: string; projectId: string }[] = [];
        projectStats.forEach(({ project, stats }) => {
          if (stats.isCancelled || stats.isDone) return;
          if (stats.goLive.status === 'danger') alerts.push({ text: `${project.name} — go-live ${stats.goLive.text}`, color: 'var(--danger)', projectId: project.id });
          if (stats.overBudget) alerts.push({ text: `${project.name} — over budget (${stats.allocated}/${project.budgetDays}d)`, color: 'var(--danger)', projectId: project.id });
          if (stats.overdue > 0) alerts.push({ text: `${project.name} — ${stats.overdue} overdue task${stats.overdue > 1 ? 's' : ''}`, color: 'var(--warning)', projectId: project.id });
          if (stats.onHold > 0) alerts.push({ text: `${project.name} — ${stats.onHold} task${stats.onHold > 1 ? 's' : ''} on hold`, color: 'var(--warning)', projectId: project.id });
        });

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="kpi-grid">
              {[
                { icon: <AlertTriangle size={20} />, value: atRisk, label: 'At-Risk Projects', c: 'var(--danger)' },
                { icon: <Clock size={20} />, value: overBudgetCount, label: 'Over Budget', c: 'var(--danger)' },
                { icon: <AlertCircle size={20} />, value: overdueTasksAll.length, label: 'Overdue Tasks', c: 'var(--warning)' },
                { icon: <Activity size={20} />, value: `${avgScore}%`, label: 'Avg Health Score', c: avgColor }
              ].map((k, i) => (
                <div key={i} className="card kpi-card" style={{ padding: '1.5rem 1.75rem' }}>
                  <div className="kpi-icon-wrapper" style={{ background: `color-mix(in srgb, ${k.c} 16%, transparent)`, color: k.c, width: '44px', height: '44px', borderRadius: 'var(--radius-lg)' }}>{k.icon}</div>
                  <div className="kpi-details">
                    <span className="kpi-value" style={{ fontSize: '1.6rem', letterSpacing: '-0.03em' }}>{k.value}</span>
                    <span className="kpi-label" style={{ marginTop: '0.15rem' }}>{k.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid-cols-12">
              <div className="card col-span-8">
                <div className="card-header"><h3 className="card-title">Project Health</h3></div>
                {projectStats.length === 0 ? (
                  <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>No projects to assess.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {sorted.map(({ project, stats }) => (
                      <div
                        key={project.id}
                        onClick={() => onSelectProject(project.id)}
                        style={{ border: '1px solid var(--border-color)', borderLeft: `4px solid ${stats.band.color}`, borderRadius: 'var(--radius-md)', padding: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.7rem', transition: 'border-color var(--transition-fast)' }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                          <div style={{ minWidth: 0 }}>
                            <h4 style={{ fontWeight: 700, fontSize: '1.02rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</h4>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>{project.clientName}</span>
                          </div>
                          <Pill color={stats.band.color}>{stats.band.label} · {stats.score}</Pill>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {stats.overBudget && <Pill color="var(--danger)"><AlertTriangle size={12} /> Over budget</Pill>}
                          {stats.overdue > 0 && <Pill color="var(--warning)">{stats.overdue} overdue</Pill>}
                          {stats.onHold > 0 && <Pill color="var(--warning)">{stats.onHold} on hold</Pill>}
                          {!stats.isDone && <Pill color={stats.goLive.status === 'danger' ? 'var(--danger)' : stats.goLive.status === 'warning' ? 'var(--warning)' : 'var(--success)'}><Flag size={12} /> {stats.goLive.text}</Pill>}
                          <Pill color="var(--text-tertiary)">{stats.pct}% complete</Pill>
                        </div>
                        <StatBar value={stats.score} max={100} color={stats.band.color} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card col-span-4">
                <div className="card-header"><h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertCircle size={18} /> Alerts</h3></div>
                {alerts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-tertiary)' }}>
                    <CheckCircle2 size={36} style={{ color: 'var(--success)', marginBottom: '0.5rem' }} />
                    <p>No active risks. Everything looks healthy.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {alerts.map((a, i) => (
                      <div key={i} onClick={() => onSelectProject(a.projectId)} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', fontSize: '0.85rem', cursor: 'pointer', padding: '0.5rem 0.6rem', borderRadius: 'var(--radius-sm)', backgroundColor: `color-mix(in srgb, ${a.color} 8%, transparent)`, borderLeft: `3px solid ${a.color}` }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: a.color, marginTop: '0.35rem', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{a.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================ RESOURCE & WORKLOAD ============================ */}
      {dashboardMode === 'resource' && (() => {
        const data = consultants.map(c => {
          const assigned = leafTasks.filter(t => t.assignedConsultantId === c.id);
          const totalDays = assigned.reduce((a, t) => a + t.durationDays, 0);
          const byProject: Record<string, number> = {};
          assigned.forEach(t => { byProject[t.projectId] = (byProject[t.projectId] || 0) + t.durationDays; });
          return { consultant: c, assigned, totalDays, byProject, taskCount: assigned.length };
        });
        const assignedTotal = data.reduce((a, r) => a + r.totalDays, 0);
        const working = data.filter(r => r.totalDays > 0).length || 1;
        const avg = assignedTotal / working;
        const maxDays = Math.max(1, ...data.map(r => r.totalDays));
        const overCount = data.filter(r => r.totalDays > 0 && r.totalDays > avg * 1.5).length;
        const unassignedDays = leafTasks.filter(t => !t.assignedConsultantId).reduce((a, t) => a + t.durationDays, 0);
        const sorted = [...data].sort((a, b) => b.totalDays - a.totalDays);

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="kpi-grid">
              {[
                { icon: <Users size={20} />, value: consultants.length, label: 'Consultants', c: 'var(--primary)' },
                { icon: <Clock size={20} />, value: `${Math.round(assignedTotal)}d`, label: 'Assigned Effort', c: '#0ea5e9' },
                { icon: <Gauge size={20} />, value: `${avg.toFixed(1)}d`, label: 'Avg / Consultant', c: 'var(--success)' },
                { icon: <AlertTriangle size={20} />, value: overCount, label: 'Over-Allocated', c: overCount > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }
              ].map((k, i) => (
                <div key={i} className="card kpi-card" style={{ padding: '1.5rem 1.75rem' }}>
                  <div className="kpi-icon-wrapper" style={{ background: `color-mix(in srgb, ${k.c} 16%, transparent)`, color: k.c, width: '44px', height: '44px', borderRadius: 'var(--radius-lg)' }}>{k.icon}</div>
                  <div className="kpi-details">
                    <span className="kpi-value" style={{ fontSize: '1.6rem', letterSpacing: '-0.03em' }}>{k.value}</span>
                    <span className="kpi-label" style={{ marginTop: '0.15rem' }}>{k.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Gauge size={18} /> Resource Allocation</h3>
                {unassignedDays > 0 && <Pill color="var(--warning)">{Math.round(unassignedDays)}d unassigned</Pill>}
              </div>
              {consultants.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>No consultants. Add your team in Settings.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {sorted.map(r => {
                    const over = r.totalDays > 0 && r.totalDays > avg * 1.5;
                    const projectEntries = Object.entries(r.byProject).sort((a, b) => b[1] - a[1]);
                    return (
                      <div key={r.consultant.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: r.consultant.avatarColor || 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
                            {r.consultant.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 600 }}>{r.consultant.name}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                {over && <Pill color="var(--danger)">Over-allocated</Pill>}
                                <span style={{ fontWeight: 700, color: over ? 'var(--danger)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{r.totalDays}d</span>
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>
                              <span>{r.consultant.role}</span>
                              <span>{r.taskCount} task{r.taskCount === 1 ? '' : 's'}</span>
                            </div>
                          </div>
                        </div>
                        {/* Allocation split by project */}
                        <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--bg-tertiary)' }}>
                          {r.totalDays === 0 ? null : projectEntries.map(([pid, days]) => {
                            const proj = projects.find(p => p.id === pid);
                            return <div key={pid} title={`${proj?.name || 'Unknown'}: ${days}d`} style={{ width: `${(days / maxDays) * 100}%`, backgroundColor: proj ? getProjectAccent(proj) : 'var(--text-tertiary)' }} />;
                          })}
                        </div>
                        {projectEntries.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {projectEntries.map(([pid, days]) => {
                              const proj = projects.find(p => p.id === pid);
                              return (
                                <span key={pid} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: proj ? getProjectAccent(proj) : 'var(--text-tertiary)' }} />
                                  {proj?.name || 'Unknown'} ({days}d)
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ============================ PORTFOLIO TIMELINE ============================ */}
      {dashboardMode === 'timeline' && (() => {
        const withGoLive = projectStats.filter(ps => ps.project.targetGoLiveDate && !ps.stats.isCancelled);
        const sorted = [...withGoLive].sort((a, b) => (a.project.targetGoLiveDate || '').localeCompare(b.project.targetGoLiveDate || ''));
        const overdue = sorted.filter(ps => !ps.stats.isDone && ps.stats.goLive.status === 'danger');
        const soon = sorted.filter(ps => !ps.stats.isDone && ps.stats.goLive.status !== 'danger' && ps.stats.goLive.days <= 30);
        const later = sorted.filter(ps => !overdue.includes(ps) && !soon.includes(ps));
        const nextLaunch = sorted.find(ps => !ps.stats.isDone && ps.stats.goLive.days >= 0);
        const within90 = sorted.filter(ps => !ps.stats.isDone && ps.stats.goLive.days >= 0 && ps.stats.goLive.days <= 90).length;

        // Rail domain
        const times: number[] = [todayMid.getTime()];
        projects.forEach(p => {
          const s = toDateMid(p.startDate); if (s) times.push(s.getTime());
          const g = toDateMid(p.targetGoLiveDate); if (g) times.push(g.getTime());
        });
        const minT = Math.min(...times);
        const maxT = Math.max(...times);
        const span = Math.max(1, maxT - minT);
        const pos = (t: number) => ((t - minT) / span) * 100;
        const fmtShort = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

        const renderGroup = (title: string, items: typeof sorted, accent: string) => items.length === 0 ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: accent }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: accent }} /> {title} ({items.length})
            </div>
            {items.map(({ project, stats }) => {
              const meta = resolvePhaseMeta(project);
              return (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'border-color var(--transition-fast)' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '54px' }}>
                    <CalendarClock size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.2rem', textAlign: 'center' }}>{formatDateFriendly(project.targetGoLiveDate)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-sm)', backgroundColor: meta.bg, color: meta.text, flexShrink: 0 }}>{meta.label}</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{project.clientName} · {stats.pct}% complete</span>
                  </div>
                  <Pill color={stats.isDone ? 'var(--success)' : stats.goLive.status === 'danger' ? 'var(--danger)' : stats.goLive.status === 'warning' ? 'var(--warning)' : 'var(--success)'}>
                    {stats.isDone ? 'Delivered' : stats.goLive.text}
                  </Pill>
                </div>
              );
            })}
          </div>
        );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="kpi-grid">
              {[
                { icon: <Flag size={20} />, value: nextLaunch ? formatDateFriendly(nextLaunch.project.targetGoLiveDate) : '—', label: 'Next Go-Live', c: 'var(--primary)' },
                { icon: <CalendarClock size={20} />, value: soon.length, label: 'Launching ≤30 days', c: 'var(--warning)' },
                { icon: <Calendar size={20} />, value: within90, label: 'Launching ≤90 days', c: '#0ea5e9' },
                { icon: <AlertTriangle size={20} />, value: overdue.length, label: 'Overdue Go-Lives', c: overdue.length > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }
              ].map((k, i) => (
                <div key={i} className="card kpi-card" style={{ padding: '1.5rem 1.75rem' }}>
                  <div className="kpi-icon-wrapper" style={{ background: `color-mix(in srgb, ${k.c} 16%, transparent)`, color: k.c, width: '44px', height: '44px', borderRadius: 'var(--radius-lg)' }}>{k.icon}</div>
                  <div className="kpi-details">
                    <span className="kpi-value" style={{ fontSize: k.label === 'Next Go-Live' ? '1.1rem' : '1.6rem', letterSpacing: '-0.02em' }}>{k.value}</span>
                    <span className="kpi-label" style={{ marginTop: '0.15rem' }}>{k.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Launch rail */}
            {withGoLive.length > 0 && (
              <div className="card">
                <div className="card-header"><h3 className="card-title">Launch Rail</h3></div>
                <div style={{ position: 'relative', height: '64px', margin: '0.5rem 0.5rem 0' }}>
                  <div style={{ position: 'absolute', top: '28px', left: 0, right: 0, height: '3px', backgroundColor: 'var(--border-strong)', borderRadius: '2px' }} />
                  {/* Today marker */}
                  {todayMid.getTime() >= minT && todayMid.getTime() <= maxT && (
                    <div style={{ position: 'absolute', top: '14px', bottom: '14px', left: `${pos(todayMid.getTime())}%`, width: '2px', backgroundColor: 'var(--danger)' }} title="Today">
                      <span style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.6rem', fontWeight: 700, color: 'var(--danger)' }}>Today</span>
                    </div>
                  )}
                  {withGoLive.map(({ project }) => {
                    const g = toDateMid(project.targetGoLiveDate)!.getTime();
                    return (
                      <div key={project.id} title={`${project.name} — ${formatDateFriendly(project.targetGoLiveDate)}`} onClick={() => onSelectProject(project.id)}
                        style={{ position: 'absolute', top: '21px', left: `${pos(g)}%`, transform: 'translateX(-50%)', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: getProjectAccent(project), border: '2px solid var(--bg-secondary)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', cursor: 'pointer' }} />
                    );
                  })}
                  <span style={{ position: 'absolute', bottom: 0, left: 0, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{fmtShort(minT)}</span>
                  <span style={{ position: 'absolute', bottom: 0, right: 0, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{fmtShort(maxT)}</span>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header"><h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Flag size={18} /> Milestones</h3></div>
              {sorted.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>No projects have a target go-live date set.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {renderGroup('Overdue', overdue, 'var(--danger)')}
                  {renderGroup('Next 30 days', soon, 'var(--warning)')}
                  {renderGroup('Upcoming', later, 'var(--primary)')}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {dashboardMode === 'projects' && (
        // PROJECTS TIMELINE DASHBOARD
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
            <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FolderKanban size={20} /> Projects Timeline & Launch Indicators
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Chronological alignment of active deployments, time allocations, target launch gates, and countdown statuses.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {projects.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <FolderKanban size={40} style={{ color: 'var(--text-tertiary)', marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--text-tertiary)' }}>No active projects. Start an implementation in the Projects tab.</p>
              </div>
            ) : (
              projects.map(project => {
                const projectTasks = tasks.filter(t => t.projectId === project.id);
                const projectLeafTasks = projectTasks.filter(t => !tasks.some(c => c.parentId === t.id));
                const projectAllocated = billableDays(projectLeafTasks);
                const projectCompleted = projectTasks.filter(t => t.status === 'completed').length;
                const pct = projectTasks.length > 0 ? Math.round((projectCompleted / projectTasks.length) * 100) : 0;
                
                const isOverBudget = projectAllocated > project.budgetDays;
                const launchDays = getDaysLeft(project.targetGoLiveDate);

                return (
                  <div 
                    key={project.id} 
                    className="card"
                    style={{
                      border: '1px solid var(--border-color)',
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <h4 style={{ fontWeight: 700, fontSize: '1.15rem' }}>{project.name}</h4>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Client: <b>{project.clientName}</b></span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {isOverBudget && (
                          <span className="badge badge-danger" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                            <AlertTriangle size={12} /> Over Budget
                          </span>
                        )}
                        
                        {/* Countdown Badge */}
                        <span 
                          className="badge"
                          style={{
                            backgroundColor: 
                              launchDays.status === 'danger' ? 'var(--danger-light)' : 
                              launchDays.status === 'warning' ? 'var(--warning-light)' : 'var(--success-light)',
                            color: 
                              launchDays.status === 'danger' ? 'var(--danger)' : 
                              launchDays.status === 'warning' ? 'var(--warning)' : 'var(--success)',
                            fontWeight: 'bold',
                            border: '1px solid currentColor',
                            fontSize: '0.8rem',
                            padding: '0.25rem 0.5rem'
                          }}
                        >
                          {launchDays.text}
                        </span>

                        <button 
                          className="btn btn-secondary btn-icon" 
                          title="Open Task Board" aria-label="Open Task Board"
                          onClick={() => onSelectProject(project.id)}
                          style={{ border: '1px solid var(--border-color)' }}
                        >
                          <FolderKanban size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Timeline Tracker Dates */}
                    <div 
                      style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                        gap: '1rem', 
                        backgroundColor: 'var(--bg-secondary)', 
                        padding: '1rem', 
                        borderRadius: 'var(--radius-md)', 
                        fontSize: '0.85rem' 
                      }}
                    >
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Start Date</span>
                        <span style={{ fontWeight: 500 }}>{formatDateFriendly(project.startDate)}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Target Go-Live</span>
                        <span style={{ fontWeight: 500, color: 'var(--accent)' }}>{project.targetGoLiveDate ? formatDateFriendly(project.targetGoLiveDate) : 'Not specified'}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Allocated / Budget</span>
                        <span style={{ fontWeight: 500, color: isOverBudget ? 'var(--danger)' : 'inherit' }}>{projectAllocated} / {project.budgetDays} days</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Completion</span>
                        <span style={{ fontWeight: 500 }}>{pct}% ({projectCompleted} / {projectTasks.length} tasks)</span>
                      </div>
                    </div>

                    {/* Completion Progress Bar */}
                    <div>
                      <div style={{ height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            height: '100%', 
                            backgroundColor: 'var(--accent)', 
                            width: `${pct}%`,
                            transition: 'width 0.3s ease'
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {dashboardMode === 'calendar' && (() => {
        // Calendar computation helpers
        const { year, month } = calendarMonth;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        
        // Monday-based week: getDay() returns 0=Sun, so shift to Mon=0
        const startWeekDay = (firstDay.getDay() + 6) % 7;
        
        // Build calendar grid cells (leading blanks + days)
        const calendarCells: (number | null)[] = [];
        for (let i = 0; i < startWeekDay; i++) calendarCells.push(null);
        for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);
        // Pad trailing to fill last row
        while (calendarCells.length % 7 !== 0) calendarCells.push(null);
        
        // Map tasks to date strings for quick lookup
        const isManager = activeUser?.tier === 'admin' || activeUser?.tier === 'superuser';
        const allLeafTasks = tasks.filter(t => 
          !tasks.some(c => c.parentId === t.id) &&
          t.assignedConsultantId === selectedCalendarConsultantId
        );
        const tasksByDate: Record<string, { task: Task; project: Project | undefined; consultant: Consultant | undefined }[]> = {};
        
        allLeafTasks.forEach(task => {
          if (!task.plannedStartDate || !task.plannedEndDate) return;
          const proj = projects.find(p => p.id === task.projectId);
          const cons = consultants.find(c => c.id === task.assignedConsultantId);
          
          // Add task to each date it spans
          const start = new Date(task.plannedStartDate);
          const end = new Date(task.plannedEndDate);
          const cursor = new Date(start);
          while (cursor <= end) {
            const dateStr = cursor.toISOString().split('T')[0];
            if (!tasksByDate[dateStr]) tasksByDate[dateStr] = [];
            tasksByDate[dateStr].push({ task, project: proj, consultant: cons });
            cursor.setDate(cursor.getDate() + 1);
          }
        });
        
        const todayStr = new Date().toISOString().split('T')[0];
        
        // Color map for projects
        const projectColors: Record<string, string> = {};
        const palette = ['#2d4a65', '#cc7730', '#6da937', '#6366f1', '#0d9488', '#ef4444', '#f59e0b', '#8b5cf6'];
        projects.forEach((p, i) => {
          projectColors[p.id] = palette[i % palette.length];
        });

        const goToPrevMonth = () => setCalendarMonth(prev => {
          if (prev.month === 0) return { year: prev.year - 1, month: 11 };
          return { year: prev.year, month: prev.month - 1 };
        });
        const goToNextMonth = () => setCalendarMonth(prev => {
          if (prev.month === 11) return { year: prev.year + 1, month: 0 };
          return { year: prev.year, month: prev.month + 1 };
        });
        const goToToday = () => {
          const now = new Date();
          setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
        };

        // Selected date tasks
        const selectedDateTasks = selectedCalendarDate ? (tasksByDate[selectedCalendarDate] || []) : [];

        return (
          <div>
            {/* Calendar Header */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button className="btn btn-secondary btn-icon" onClick={goToPrevMonth} style={{ padding: '0.4rem' }}>
                    <ChevronLeft size={18} />
                  </button>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 700, minWidth: '200px', textAlign: 'center' }}>
                    {monthNames[month]} {year}
                  </h2>
                  <button className="btn btn-secondary btn-icon" onClick={goToNextMonth} style={{ padding: '0.4rem' }}>
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  {isManager && (
                    <select 
                      className="form-input" 
                      style={{ padding: '0.25rem 2rem 0.25rem 0.75rem', minHeight: 'auto', fontSize: '0.85rem' }}
                      value={selectedCalendarConsultantId}
                      onChange={e => setSelectedCalendarConsultantId(e.target.value)}
                    >
                      {consultants.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                  <button className="btn btn-secondary" onClick={goToToday} style={{ fontSize: '0.8rem' }}>
                    Today
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: selectedCalendarDate ? '1fr 340px' : '1fr', gap: '1.5rem' }}>
              {/* Calendar Grid */}
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                {/* Day Name Headers */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderBottom: '2px solid var(--border-color)'
                }}>
                  {dayNames.map(day => (
                    <div key={day} style={{ 
                      padding: '0.65rem 0.5rem', 
                      textAlign: 'center', 
                      fontWeight: 700, 
                      fontSize: '0.75rem', 
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {day}
                    </div>
                  ))}
                </div>

                {/* Day Cells Grid */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gridAutoRows: 'minmax(90px, auto)'
                }}>
                  {calendarCells.map((day, idx) => {
                    if (day === null) {
                      return (
                        <div key={`blank-${idx}`} style={{ 
                          backgroundColor: 'var(--bg-tertiary)',
                          borderBottom: '1px solid var(--border-color)',
                          borderRight: idx % 7 !== 6 ? '1px solid var(--border-color)' : 'none',
                          opacity: 0.4
                        }} />
                      );
                    }

                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayTasks = tasksByDate[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedCalendarDate;
                    const isWeekend = idx % 7 >= 5;

                    return (
                      <div 
                        key={dateStr}
                        onClick={() => setSelectedCalendarDate(isSelected ? null : dateStr)}
                        style={{ 
                          borderBottom: '1px solid var(--border-color)',
                          borderRight: idx % 7 !== 6 ? '1px solid var(--border-color)' : 'none',
                          padding: '0.4rem 0.5rem',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease',
                          backgroundColor: isSelected 
                            ? 'var(--primary-light)' 
                            : isWeekend 
                              ? 'var(--bg-tertiary)' 
                              : 'var(--bg-secondary)',
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.2rem',
                          minHeight: '90px'
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--primary-light)'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = isWeekend ? 'var(--bg-tertiary)' : 'var(--bg-secondary)'; }}
                      >
                        {/* Day Number */}
                        <span style={{ 
                          fontSize: '0.8rem',
                          fontWeight: isToday ? 700 : 500,
                          color: isToday ? 'white' : 'var(--text-primary)',
                          backgroundColor: isToday ? 'var(--primary)' : 'transparent',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          alignSelf: 'flex-start',
                          flexShrink: 0
                        }}>
                          {day}
                        </span>

                        {/* Task chips */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden', flex: 1 }}>
                          {dayTasks.slice(0, 3).map(({ task, project }) => (
                            <div 
                              key={task.id}
                              title={`${task.name}${project ? ` (${project.clientName})` : ''}`}
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 500,
                                lineHeight: 1.2,
                                padding: '2px 4px',
                                borderRadius: '3px',
                                backgroundColor: projectColors[task.projectId] || 'var(--primary)',
                                color: 'white',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                opacity: task.status === 'completed' ? 0.5 : 0.9
                              }}
                            >
                              {task.name}
                            </div>
                          ))}
                          {dayTasks.length > 3 && (
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 600, paddingLeft: '2px' }}>
                              +{dayTasks.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day Detail Panel */}
              {selectedCalendarDate && (
                <div className="card" style={{ alignSelf: 'flex-start', position: 'sticky', top: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
                      {new Date(selectedCalendarDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                    <button className="btn btn-secondary btn-icon" onClick={() => setSelectedCalendarDate(null)} style={{ padding: '0.25rem' }}>
                      ✕
                    </button>
                  </div>

                  {selectedDateTasks.length === 0 ? (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
                      No tasks scheduled for this day.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {selectedDateTasks.map(({ task, project, consultant }) => (
                        <div 
                          key={task.id}
                          style={{ 
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-color)',
                            borderLeft: `3px solid ${projectColors[task.projectId] || 'var(--primary)'}`,
                            backgroundColor: 'var(--bg-secondary)',
                            opacity: task.status === 'completed' ? 0.65 : 1
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.35rem', textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                            {task.name}
                          </div>
                          {project && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.4rem' }}>
                              {project.name} · {project.clientName}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span className={`badge badge-${
                              task.status === 'completed' ? 'success' : 
                              task.status === 'in_progress' ? 'primary' : 
                              task.status === 'on_hold' ? 'warning' : 'secondary'
                            }`} style={{ fontSize: '0.65rem' }}>
                              {task.status.replace('_', ' ')}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                              {task.durationDays}d
                            </span>
                            {consultant && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                <span style={{
                                  width: '16px', height: '16px', borderRadius: '50%',
                                  backgroundColor: consultant.avatarColor,
                                  color: 'white', display: 'inline-flex', alignItems: 'center',
                                  justifyContent: 'center', fontSize: '0.5rem', fontWeight: 'bold'
                                }}>
                                  {consultant.name.split(' ').map(n => n[0]).join('')}
                                </span>
                                {consultant.name.split(' ')[0]}
                              </span>
                            )}
                          </div>
                          {task.plannedStartDate && task.plannedEndDate && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.35rem' }}>
                              {formatDateFriendly(task.plannedStartDate)} → {formatDateFriendly(task.plannedEndDate)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Project Legend */}
                  {selectedDateTasks.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projects</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem' }}>
                        {[...new Set(selectedDateTasks.map(t => t.task.projectId))].map(pid => {
                          const proj = projects.find(p => p.id === pid);
                          return proj ? (
                            <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: projectColors[pid], flexShrink: 0 }} />
                              <span style={{ color: 'var(--text-secondary)' }}>{proj.name}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

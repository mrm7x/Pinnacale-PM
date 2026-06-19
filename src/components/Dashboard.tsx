import React, { useState } from 'react';
import type { Project, Task, Consultant, O365Config } from '../types';
import { 
  FolderKanban, Clock, CheckSquare, Users, AlertTriangle, 
  User, Calendar, RefreshCw, CheckCircle2, Circle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { syncTaskToO365 } from '../utils/o365';
import { getProjectAccent } from '../utils/phases';

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
  o365Config: O365Config;
  onSelectProject: (projectId: string) => void;
  onUpdateTask: (task: Task) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function Dashboard({ 
  projects, 
  tasks, 
  consultants, 
  activeUserId,
  o365Config,
  onSelectProject,
  onUpdateTask,
  onAddToast
}: DashboardProps) {
  const isConsultant = activeUserId !== 'admin';
  const [dashboardMode, setDashboardMode] = useState<'team' | 'personal' | 'projects' | 'calendar'>(isConsultant ? 'personal' : 'team');
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
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

  const activeUser = consultants.find(c => c.id === activeUserId) || null;

  // Active User Agenda & KPIs
  const myProjects = projects.filter(p => p.consultantIds.includes(activeUserId));
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

  // MS To-Do Quick Sync Action for Agenda items
  const handleQuickSync = async (task: Task) => {
    if (!o365Config.isEnabled) {
      onAddToast('O365 Integration is disabled. Simulating To-Do Sync.', 'info');
    }
    setSyncingTaskId(task.id);
    const result = await syncTaskToO365(task, o365Config, !o365Config.isEnabled);
    setSyncingTaskId(null);

    if (result.success) {
      onUpdateTask({ ...task, o365TaskId: result.taskId });
      onAddToast(result.message, 'success');
    } else {
      onAddToast(result.message, 'error');
    }
  };

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

  return (
    <div>
      {/* Dashboard Toggle — pill tab bar */}
      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '2rem', backgroundColor: 'var(--bg-secondary)', padding: '0.35rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', width: 'fit-content' }}>
        {([
          { id: 'team', icon: <Users size={17} />, label: 'Team Overview' },
          { id: 'projects', icon: <FolderKanban size={17} />, label: 'Projects' },
          { id: 'calendar', icon: <Calendar size={17} />, label: 'Calendar' },
          ...(isConsultant ? [{ id: 'personal', icon: <User size={17} />, label: 'My Agenda' }] : [])
        ] as { id: string; icon: React.ReactNode; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setDashboardMode(tab.id as typeof dashboardMode)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              padding: '0.55rem 1.1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.15s ease',
              backgroundColor: dashboardMode === tab.id ? 'var(--primary)' : 'transparent',
              color: dashboardMode === tab.id ? 'white' : 'var(--text-secondary)',
              boxShadow: dashboardMode === tab.id ? '0 1px 4px rgba(45,74,101,0.25)' : 'none'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
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
              <div className="kpi-icon-wrapper" style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}>
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

            <div className="card kpi-card">
              <div className="kpi-icon-wrapper" style={{ backgroundColor: '#e0f2fe', color: '#0284c7' }}>
                <CheckCircle2 size={24} />
              </div>
              <div className="kpi-details">
                <span className="kpi-value">{myTasks.filter(t => t.o365TaskId).length} / {myTasks.length}</span>
                <span className="kpi-label">Tasks Synced to O365</span>
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

                                <button 
                                  className="btn btn-secondary btn-icon"
                                  title="Sync task to Microsoft To-Do" aria-label="Sync task to Microsoft To-Do"
                                  disabled={syncingTaskId === task.id}
                                  onClick={() => handleQuickSync(task)}
                                  style={{ color: task.o365TaskId ? 'var(--success)' : 'inherit' }}
                                >
                                  <RefreshCw size={14} className={syncingTaskId === task.id ? 'animate-spin' : ''} />
                                </button>
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

      {dashboardMode === 'team' && (
        // TEAM DASHBOARD
        <div>
          <div className="kpi-grid">
            {[
              {
                icon: <FolderKanban size={20} />,
                value: totalProjects,
                label: 'Active Projects',
                iconBg: 'linear-gradient(135deg, #edf2f7 0%, #dce7f0 100%)',
                iconColor: 'var(--primary)'
              },
              {
                icon: <Clock size={20} />,
                value: `${totalAllocatedDays} / ${totalBudgetDays}d`,
                label: 'Time Budget Used',
                iconBg: 'linear-gradient(135deg, #fdf5ee 0%, #fae5ce 100%)',
                iconColor: 'var(--accent)'
              },
              {
                icon: <CheckSquare size={20} />,
                value: `${completionPercentage}%`,
                label: 'Task Completion',
                iconBg: 'linear-gradient(135deg, #ecfdf3 0%, #d1fae5 100%)',
                iconColor: 'var(--success)'
              },
              {
                icon: <Users size={20} />,
                value: consultants.length,
                label: 'Consultants',
                iconBg: 'linear-gradient(135deg, #eef3ff 0%, #dde6ff 100%)',
                iconColor: '#6366f1'
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
                    const projectAllocated = projectLeafTasks.reduce((acc, t) => acc + t.durationDays, 0);
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
                const projectAllocated = projectLeafTasks.reduce((acc, t) => acc + t.durationDays, 0);
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

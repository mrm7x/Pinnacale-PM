import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { Project, Task, Consultant } from '../types';
import { getSchedulePoint, parseDate, isWeekend } from '../utils/scheduler';
import { formatDateFriendly } from './Dashboard';
import { getProjectAccent } from '../utils/phases';
import {
  HelpCircle, ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
  Calendar, Clock, User, Link2, X, Move, Maximize2
} from 'lucide-react';

/**
 * Gantt v2 — a cleaner, more interactive project timeline.
 *
 * Improvements over the original:
 *  - Sticky left task column stays visible while you scroll the timeline right.
 *  - Drag-to-scroll (click and drag) pans the timeline horizontally; dedicated
 *    ←/→ buttons and a "Today" jump button are also provided.
 *  - Zoom in/out of the day-column width.
 *  - Weekend columns are shaded; a "Today" vertical line marks the current date.
 *  - Bars show a progress fill and the assignee color; completed bars dim.
 *  - Click a bar for a details popover (assignee, dates, duration, predecessors).
 *  - Drag a bar to reschedule (sets a custom start date); drag the right edge
 *    to resize the duration. Both run through onUpdateTask so the scheduler
 *    re-resolves dependencies exactly as in Tasks v2.
 *
 * Props are backward compatible: onUpdateTask/canEdit default to no-op/false,
 * so drag-rescheduling simply disables itself when those aren't supplied.
 */

interface GanttChartProps {
  activeProject: Project | null;
  tasks: Task[];
  consultants: Consultant[];
  onUpdateTask?: (task: Task) => void;
  canEdit?: boolean;
}

const STATUS_LABEL: Record<Task['status'], string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed'
};

const ZOOM_LEVELS = [48, 64, 80, 100, 120];
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 52;

export default function GanttChart({
  activeProject,
  tasks,
  consultants,
  onUpdateTask,
  canEdit = false
}: GanttChartProps) {
  const [zoomIdx, setZoomIdx] = useState(1); // 64px default
  const colWidth = ZOOM_LEVELS[zoomIdx];
  const halfColWidth = colWidth / 2;

  const [popoverTaskId, setPopoverTaskId] = useState<string | null>(null);

  // Drag state for rescheduling / resizing.
  const [drag, setDrag] = useState<{
    taskId: string;
    mode: 'move' | 'resize';
    startX: number;
    originStartHalf: number;
    originEndHalf: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const projectTasks = useMemo(
    () => activeProject ? tasks.filter(t => t.projectId === activeProject.id) : [],
    [tasks, activeProject]
  );

  const maxEndHalfDay = useMemo(
    () => projectTasks.length ? Math.max(...projectTasks.map(t => t.endHalfDay || 0)) : 0,
    [projectTasks]
  );

  const totalWorkingDays = useMemo(
    () => Math.max(16, Math.ceil((maxEndHalfDay + 4) / 2)),
    [maxEndHalfDay]
  );

  const timelineWidth = totalWorkingDays * colWidth;
  const timelineHeight = projectTasks.length * ROW_HEIGHT;

  const columns = useMemo(() => {
    if (!activeProject) return [];
    const cols = [];
    for (let c = 0; c < totalWorkingDays; c++) {
      const point = getSchedulePoint(activeProject.startDate, c * 2);
      const dateObj = parseDate(point.date);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      cols.push({
        index: c,
        dayName,
        dateLabel,
        dateStr: point.date,
        isWeekend: isWeekend(dateObj),
        isToday: isToday(point.date)
      });
    }
    return cols;
  }, [activeProject, totalWorkingDays]);

  // Today's vertical line position (in half-day units from project start).
  const todayHalf = useMemo(() => {
    if (!activeProject) return null;
    const todayStr = toYMD(new Date());
    let found: number | null = null;
    for (let c = 0; c < totalWorkingDays; c++) {
      const p = getSchedulePoint(activeProject.startDate, c * 2);
      if (p.date === todayStr) { found = c * 2; break; }
      if (p.date > todayStr) break;
    }
    return found;
  }, [activeProject, totalWorkingDays]);

  const accent = activeProject ? getProjectAccent(activeProject) : 'var(--primary)';

  const isParent = useCallback((id: string) => projectTasks.some(t => t.parentId === id), [projectTasks]);

  // ---- Horizontal scroll helpers ------------------------------------------------
  const scrollBy = (dx: number) => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: dx, behavior: 'smooth' });
  };
  const jumpToToday = () => {
    if (scrollRef.current && todayHalf !== null) {
      const x = todayHalf * halfColWidth - scrollRef.current.clientWidth / 2 + halfColWidth;
      scrollRef.current.scrollTo({ left: Math.max(0, x), behavior: 'smooth' });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };
  // ---- Drag-to-scroll (pan) the timeline --------------------------------------
  const panRef = useRef<{ startX: number; scrollLeft: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const onPanStart = (e: React.MouseEvent) => {
    // Only initiate pan with left button, and not when clicking on a bar.
    if (e.button !== 0 || !scrollRef.current) return;
    // If the mousedown originated from a .g2-bar, let bar drag handle it.
    if ((e.target as HTMLElement).closest('.g2-bar')) return;
    panRef.current = { startX: e.clientX, scrollLeft: scrollRef.current.scrollLeft };
    setIsPanning(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      if (!panRef.current || !scrollRef.current) return;
      const dx = e.clientX - panRef.current.startX;
      scrollRef.current.scrollLeft = panRef.current.scrollLeft - dx;
    };
    const onUp = () => {
      panRef.current = null;
      setIsPanning(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning]);

  // ---- Drag-to-reschedule -------------------------------------------------------
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      setDrag(d => {
        if (!d) return d;
        const dx = e.clientX - d.startX;
        const halfDelta = Math.round(dx / halfColWidth) * 2; // snap to whole days
        const task = projectTasks.find(t => t.id === d.taskId);
        if (!task || !onUpdateTask) return d;

        if (d.mode === 'move') {
          const newStart = Math.max(0, d.originStartHalf + halfDelta);
          // Translate half-day index back to a calendar date and persist as customStartDate.
          if (activeProject && newStart !== (task.startHalfDay || 0)) {
            const point = getSchedulePoint(activeProject.startDate, newStart);
            onUpdateTask({ ...task, customStartDate: point.date });
          }
        } else {
          const newEnd = Math.max(d.originStartHalf + 1, d.originEndHalf + halfDelta);
          if (newEnd !== (task.endHalfDay || 0)) {
            const durationDays = (newEnd - d.originStartHalf + 1) / 2;
            onUpdateTask({ ...task, durationDays });
          }
        }
        return d; // keep referencing the same origin; the task object mutates via onUpdateTask
      });
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, halfColWidth, projectTasks, activeProject, onUpdateTask]);

  const startDrag = (e: React.MouseEvent, task: Task, mode: 'move' | 'resize') => {
    if (!canEdit || !onUpdateTask) return;
    e.stopPropagation();
    setPopoverTaskId(null);
    setDrag({
      taskId: task.id,
      mode,
      startX: e.clientX,
      originStartHalf: task.startHalfDay || 0,
      originEndHalf: task.endHalfDay || 0
    });
  };

  const popoverTask = popoverTaskId ? projectTasks.find(t => t.id === popoverTaskId) ?? null : null;

  // ---- Empty / no-project states ------------------------------------------------
  if (!activeProject) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <HelpCircle size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
        <h3>No Project Selected</h3>
        <p style={{ color: 'var(--text-tertiary)' }}>Please select a project to view its Gantt timeline.</p>
      </div>
    );
  }
  if (projectTasks.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <HelpCircle size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
        <h3>Empty Timeline</h3>
        <p style={{ color: 'var(--text-tertiary)' }}>No tasks found for this project. Create some tasks to view the schedule.</p>
      </div>
    );
  }

  return (
    <div className="g2-root">
      {/* Toolbar */}
      <div className="g2-toolbar">
        <div className="g2-legend">
          <span className="g2-legend-item"><span className="g2-swatch g2-swatch-leaf" />Leaf task</span>
          <span className="g2-legend-item"><span className="g2-swatch g2-swatch-parent" />Parent (rollup)</span>
          <span className="g2-legend-item"><span className="g2-swatch g2-swatch-weekend" />Weekend</span>
          <span className="g2-legend-item"><span className="g2-today-dot" />Today</span>
        </div>
        <div className="g2-toolbar-actions">
          <button className="btn btn-ghost g2-icon-btn" onClick={jumpToToday} title="Jump to today"><Calendar size={15} /> Today</button>
          <span className="g2-toolbar-divider" />
          <button className="btn btn-ghost g2-icon-btn-only" onClick={() => scrollBy(-colWidth * 7)} title="Scroll left"><ChevronLeft size={18} /></button>
          <button className="btn btn-ghost g2-icon-btn-only" onClick={() => scrollBy(colWidth * 7)} title="Scroll right"><ChevronRight size={18} /></button>
          <span className="g2-toolbar-divider" />
          <button className="btn btn-ghost g2-icon-btn-only" onClick={() => setZoomIdx(i => Math.max(0, i - 1))} disabled={zoomIdx === 0} title="Zoom out"><ZoomOut size={18} /></button>
          <button className="btn btn-ghost g2-icon-btn-only" onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1} title="Zoom in"><ZoomIn size={18} /></button>
          {canEdit && <span className="g2-hint"><Move size={12} /> Drag bars to reschedule · drag edges to resize</span>}
        </div>
      </div>

      {/* Chart frame */}
      <div className="g2-frame card" style={{ '--g2-accent': accent } as React.CSSProperties}>
        {/* Sticky left task column */}
        <div className="g2-left">
          <div className="g2-left-head" style={{ height: HEADER_HEIGHT }}>
            <span>Task</span>
          </div>
          {projectTasks.map((task, idx) => {
            const parent = isParent(task.id);
            const depth = parentDepth(task, projectTasks);
            return (
              <div key={task.id}
                className={`g2-left-row ${parent ? 'g2-left-parent' : ''} ${idx % 2 ? 'g2-stripe' : ''}`}
                style={{ height: ROW_HEIGHT, paddingLeft: `${0.5 + depth * 0.9}rem` }}
                onClick={() => setPopoverTaskId(task.id)}
              >
                <span className="g2-left-name" title={task.name}>
                  {parent && <span className="g2-left-bracket">▸</span>}
                  {task.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Scrollable timeline */}
        <div className={`g2-scroll ${isPanning ? 'g2-scroll-panning' : ''}`} ref={scrollRef} onMouseDown={onPanStart}>
          <div style={{ width: timelineWidth, position: 'relative' }}>
            {/* Header */}
            <div className="g2-head" style={{ height: HEADER_HEIGHT }}>
              {columns.map(col => (
                <div key={col.index} className={`g2-head-col ${col.isWeekend ? 'g2-weekend-head' : ''} ${col.isToday ? 'g2-today-head' : ''}`} style={{ width: colWidth }}>
                  <span className="g2-head-day">{col.dayName}</span>
                  <span className="g2-head-date">{col.dateLabel}</span>
                </div>
              ))}
            </div>

            {/* Body */}
            <div className="g2-body" style={{ height: timelineHeight }}>
              {/* Column shading + grid */}
              {columns.map(col => (
                <div key={col.index}
                  className={`g2-gridcol ${col.isWeekend ? 'g2-weekend-col' : ''}`}
                  style={{ width: colWidth }}
                />
              ))}
              {/* Row stripes */}
              {projectTasks.map((_, idx) => (
                <div key={idx} className={`g2-gridrow ${idx % 2 ? 'g2-stripe' : ''}`} style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }} />
              ))}

              {/* Today line */}
              {todayHalf !== null && (
                <div className="g2-today-line" style={{ left: todayHalf * halfColWidth }} />
              )}

              {/* Dependency arrows */}
              <svg className="g2-arrows" width={timelineWidth} height={timelineHeight}>
                <defs>
                  <marker id="g2-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill={accent} />
                  </marker>
                </defs>
                {projectTasks.map((task, idx) => {
                  if (!task.predecessorIds || task.predecessorIds.length === 0) return null;
                  const y2 = idx * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const x2 = (task.startHalfDay || 0) * halfColWidth;
                  return task.predecessorIds.map(predId => {
                    const predIdx = projectTasks.findIndex(t => t.id === predId);
                    if (predIdx === -1) return null;
                    const pred = projectTasks[predIdx];
                    const y1 = predIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                    const x1 = ((pred.endHalfDay || 0) + 1) * halfColWidth;
                    const mx = x1 + 10;
                    return (
                      <path key={`${predId}-${task.id}`}
                        d={`M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`}
                        fill="none" stroke={accent} strokeWidth={1.4}
                        strokeDasharray="3 2" markerEnd="url(#g2-arrow)" opacity={0.75}
                      />
                    );
                  });
                })}
              </svg>

              {/* Task bars */}
              {projectTasks.map((task, idx) => {
                const parent = isParent(task.id);
                const startHalf = task.startHalfDay || 0;
                const endHalf = task.endHalfDay || 0;
                const x = startHalf * halfColWidth;
                const w = Math.max(halfColWidth, (endHalf - startHalf + 1) * halfColWidth);
                const y = idx * ROW_HEIGHT + (ROW_HEIGHT - 22) / 2;
                const assigned = consultants.find(c => c.id === task.assignedConsultantId);
                const barColor = parent ? 'var(--text-tertiary)' : (assigned?.avatarColor || accent);
                const prog = clamp(task.progress ?? (task.status === 'completed' ? 100 : 0));
                const completed = task.status === 'completed';
                const dragging = drag?.taskId === task.id;

                if (parent) {
                  // Parent: thin rollup bar with end caps.
                  return (
                    <div key={task.id}
                      className={`g2-bar g2-bar-parent ${dragging ? 'g2-bar-dragging' : ''}`}
                      style={{ left: x, top: y + 6, width: w }}
                      onClick={(e) => { e.stopPropagation(); setPopoverTaskId(task.id); }}
                    >
                      <span className="g2-bar-cap" style={{ backgroundColor: barColor }} />
                      <span className="g2-bar-mid" style={{ backgroundColor: barColor }} />
                      <span className="g2-bar-cap" style={{ backgroundColor: barColor }} />
                    </div>
                  );
                }

                return (
                  <div key={task.id}
                    className={`g2-bar ${completed ? 'g2-bar-done' : ''} ${dragging ? 'g2-bar-dragging' : ''} ${popoverTaskId === task.id ? 'g2-bar-selected' : ''}`}
                    style={{ left: x, top: y, width: w, backgroundColor: barColor, opacity: completed ? 0.55 : 0.95 }}
                    onMouseDown={(e) => startDrag(e, task, 'move')}
                    onClick={(e) => { e.stopPropagation(); if (!drag) setPopoverTaskId(task.id); }}
                    title={`${task.name} — drag to move`}
                  >
                    {/* Progress fill overlay */}
                    <span className="g2-bar-progress" style={{ width: `${prog}%` }} />
                    {/* In-bar label */}
                    {w >= 90 && <span className="g2-bar-label">{task.name}</span>}
                    {/* Resize handle */}
                    {canEdit && <span className="g2-bar-resize" onMouseDown={(e) => startDrag(e, task, 'resize')} title="Drag to resize duration"><Maximize2 size={11} /></span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Details popover */}
        {popoverTask && (
          <GanttPopover
            task={popoverTask}
            consultants={consultants}
            allTasks={projectTasks}
            accent={accent}
            onClose={() => setPopoverTaskId(null)}
            anchorRow={projectTasks.findIndex(t => t.id === popoverTask.id)}
            rowHeight={ROW_HEIGHT}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Details popover
// =============================================================================

interface PopoverProps {
  task: Task;
  consultants: Consultant[];
  allTasks: Task[];
  accent: string;
  anchorRow: number;
  rowHeight: number;
  onClose: () => void;
}

function GanttPopover({ task, consultants, allTasks, accent, anchorRow, rowHeight, onClose }: PopoverProps) {
  const assigned = consultants.find(c => c.id === task.assignedConsultantId);
  const preds = (task.predecessorIds || []).map(id => allTasks.find(t => t.id === id)).filter(Boolean) as Task[];
  const blockers = allTasks.filter(t => (t.predecessorIds || []).includes(task.id));
  const prog = clamp(task.progress ?? (task.status === 'completed' ? 100 : 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Position the popover beside the anchor row, clamped within the frame.
  const top = Math.max(8, anchorRow * rowHeight + rowHeight);

  return (
    <>
      <div className="g2-pop-backdrop" onClick={onClose} />
      <div className="g2-pop" style={{ top, borderColor: accent }}>
        <div className="g2-pop-head" style={{ borderBottomColor: accent }}>
          <span className="g2-pop-title">{task.name}</span>
          <button className="btn btn-secondary btn-icon g2-pop-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="g2-pop-body">
          <div className="g2-pop-row">
            <span className="g2-pop-label"><User size={13} /> Assignee</span>
            <span className="g2-pop-value">
              {assigned ? <><span className="g2-avatar-mini" style={{ backgroundColor: assigned.avatarColor || '#1e3449' }}>{initials(assigned.name)}</span>{assigned.name}</> : <span className="g2-unassigned">Unassigned</span>}
            </span>
          </div>
          <div className="g2-pop-row">
            <span className="g2-pop-label"><Calendar size={13} /> Start → End</span>
            <span className="g2-pop-value">
              {formatDateFriendly(task.plannedStartDate)} → {formatDateFriendly(task.plannedEndDate)}
            </span>
          </div>
          <div className="g2-pop-row">
            <span className="g2-pop-label"><Clock size={13} /> Duration</span>
            <span className="g2-pop-value">{task.durationDays} day{task.durationDays === 1 ? '' : 's'}</span>
          </div>
          <div className="g2-pop-row">
            <span className="g2-pop-label">Status</span>
            <span className={`g2-pop-status g2-pop-status-${task.status}`}>{STATUS_LABEL[task.status]}</span>
          </div>
          <div className="g2-pop-row">
            <span className="g2-pop-label">Progress</span>
            <span className="g2-pop-value">
              <span className="g2-pop-progress"><span className="g2-pop-progress-fill" style={{ width: `${prog}%`, backgroundColor: accent }} /></span>
              {prog}%
            </span>
          </div>
          {task.customStartDate && (
            <div className="g2-pop-row">
              <span className="g2-pop-label">Custom start</span>
              <span className="g2-pop-value">{formatDateFriendly(task.customStartDate)}</span>
            </div>
          )}
          {task.pinkNumber && (
            <div className="g2-pop-row">
              <span className="g2-pop-label">Pink #</span>
              <span className="g2-pop-value">{task.pinkNumber}</span>
            </div>
          )}
          {preds.length > 0 && (
            <div className="g2-pop-row g2-pop-col">
              <span className="g2-pop-label"><Link2 size={13} /> Depends on ({preds.length})</span>
              <span className="g2-pop-list">{preds.map(p => <span key={p.id} className="g2-pop-chip">{p.name}</span>)}</span>
            </div>
          )}
          {blockers.length > 0 && (
            <div className="g2-pop-row g2-pop-col">
              <span className="g2-pop-label">Blocks ({blockers.length})</span>
              <span className="g2-pop-list">{blockers.map(b => <span key={b.id} className="g2-pop-chip">{b.name}</span>)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isToday(ymd: string): boolean {
  return ymd === toYMD(new Date());
}

function parentDepth(task: Task, all: Task[]): number {
  let depth = 0;
  let cur: string | null = task.parentId;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    depth++;
    const p = all.find(t => t.id === cur);
    cur = p?.parentId ?? null;
  }
  return depth;
}

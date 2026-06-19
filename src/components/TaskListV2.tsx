import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Project, Task, Consultant } from '../types';
import { canCreateTask, canEditTask, canDeleteTask } from '../utils/permissions';
import {
  Plus, ChevronDown, ChevronRight, X, Clock, Calendar, Trash2,
  Link2, AlertTriangle, ListChecks, Filter, GripVertical, Check
} from 'lucide-react';
import { WinComboBox } from './winui/WinComboBox';
import { WinDatePicker } from './winui/WinDatePicker';
import { formatDateFriendly } from './Dashboard';
import { getProjectAccent } from '../utils/phases';

/**
 * Tasks v2 — a re-imagined implementation-task tree.
 *
 * Design goals vs. the original "tasks" tab:
 *  - No overlapping/cluttered controls. The row holds only hot cells:
 *    status, assignee, duration (all click-to-edit, sized to their column).
 *  - Everything else (name, dates, dependencies, pink#, description, progress)
 *    lives in a right-side slide-over drawer that opens on task-name click.
 *  - Reorder/reparent via drag-and-drop (drop between rows = reorder among
 *    siblings; drop onto a row = nest under it). No chevron buttons.
 *  - No O365 / Microsoft Graph surface.
 *
 * Enhancements: per-task Progress % (duration-weighted rollup on parents),
 * an overdue badge, dependency-count hints, and a "My Tasks" worklist strip.
 */

interface TaskListV2Props {
  project: Project;
  tasks: Task[];
  consultants: Consultant[];
  activeUserId: string;
  onCreateTask: (task: Omit<Task, 'id'>) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onBulkUpdateTasks: (ids: string[], updates: Partial<Task>) => void;
  onBulkDeleteTasks: (ids: string[]) => void;
  onReorderTasks: (updates: { id: string; sortOrder: number; parentId?: string | null }[]) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'on_hold' | 'completed';
type BilledFilter = 'all' | 'only' | 'hide';

const STATUS_OPTIONS: { label: string; value: Task['status'] }[] = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Completed', value: 'completed' }
];

const statusLabel = (s: Task['status']) =>
  s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const statusBadgeClass = (s: Task['status']) =>
  s === 'completed' ? 'tv2-badge tv2-badge-success'
  : s === 'in_progress' ? 'tv2-badge tv2-badge-primary'
  : s === 'on_hold' ? 'tv2-badge tv2-badge-warning'
  : 'tv2-badge tv2-badge-secondary';

export default function TaskListV2({
  project,
  tasks,
  consultants,
  activeUserId,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  onBulkDeleteTasks,
  onReorderTasks,
  onAddToast
}: TaskListV2Props) {
  const accent = getProjectAccent(project);
  const activeConsultant = consultants.find(c => c.id === activeUserId);
  const activeRole = activeConsultant?.role || 'Read only';

  const projectTasks = useMemo(
    () => tasks.filter(t => t.projectId === project.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [tasks, project.id]
  );

  // ---- Derived tree helpers -------------------------------------------------
  const childIds = useCallback((parentId: string): string[] =>
    projectTasks.filter(t => t.parentId === parentId).map(t => t.id),
    [projectTasks]);

  const isParent = useCallback((id: string) =>
    projectTasks.some(t => t.parentId === id),
    [projectTasks]);

  // Duration-weighted progress rollup for parents (recursive).
  const progressFor = useCallback((task: Task): number => {
    if (!isParent(task.id)) return clampProgress(task.progress);
    const children = projectTasks.filter(t => t.parentId === task.id);
    const totalWeight = children.reduce((acc, c) => acc + Math.max(0.5, c.durationDays), 0);
    if (totalWeight === 0) return 0;
    const weighted = children.reduce((acc, c) => acc + progressFor(c) * Math.max(0.5, c.durationDays), 0);
    return Math.round(weighted / totalWeight);
  }, [projectTasks, isParent]);

  // ---- UI state -------------------------------------------------------------
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: 'duration' | 'status' | 'assignee'; value: string } | null>(null);

  // Filters
  const [hideCompleted, setHideCompleted] = useState(false);
  const [billedFilter, setBilledFilter] = useState<BilledFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [onlyMine, setOnlyMine] = useState(false);

  // Drag-and-drop
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ type: 'before' | 'after' | 'into'; id: string } | null>(null);

  // Reset ephemeral state when the project changes.
  useEffect(() => {
    setSelectedIds([]);
    setDrawerTaskId(null);
    setInlineEdit(null);
    setDragId(null);
    setDropTarget(null);
    setOnlyMine(false);
  }, [project.id]);

  // Close drawer on Escape.
  useEffect(() => {
    if (!drawerTaskId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerTaskId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerTaskId]);

  const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: prev[id] === undefined ? false : !prev[id] }));

  // ---- "My Tasks" worklist --------------------------------------------------
  const myActiveTasks = useMemo(
    () => projectTasks.filter(t =>
      t.assignedConsultantId === activeUserId &&
      (t.status === 'not_started' || t.status === 'in_progress') &&
      !isParent(t.id)
    ),
    [projectTasks, activeUserId, isParent]
  );

  // ---- Budget / progress summary -------------------------------------------
  const leafTasks = useMemo(() => projectTasks.filter(t => !isParent(t.id)), [projectTasks, isParent]);
  const totalAllocated = leafTasks.reduce((acc, t) => acc + t.durationDays, 0);
  const isOverBudget = totalAllocated > project.budgetDays;
  const overallProgress = useMemo(() => {
    const weight = leafTasks.reduce((acc, t) => acc + Math.max(0.5, t.durationDays), 0);
    if (weight === 0) return 0;
    const weighted = leafTasks.reduce((acc, t) => acc + progressFor(t) * Math.max(0.5, t.durationDays), 0);
    return Math.round(weighted / weight);
  }, [leafTasks, progressFor]);

  // ---- Filtering (keep ancestors of matching descendants visible) ----------
  const matchesSelf = useCallback((task: Task): boolean => {
    if (hideCompleted && task.status === 'completed') return false;
    if (billedFilter === 'hide' && task.billed) return false;
    if (billedFilter === 'only' && !task.billed) return false;
    if (assigneeFilter === 'unassigned' && task.assignedConsultantId) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && task.assignedConsultantId !== assigneeFilter) return false;
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (onlyMine && task.assignedConsultantId !== activeUserId) return false;
    return true;
  }, [hideCompleted, billedFilter, assigneeFilter, statusFilter, onlyMine, activeUserId]);

  const matchesTree = useCallback((task: Task): boolean => {
    if (matchesSelf(task)) return true;
    return childIds(task.id).some(cid => {
      const child = projectTasks.find(t => t.id === cid);
      return child ? matchesTree(child) : false;
    });
  }, [matchesSelf, childIds, projectTasks]);

  // ---- Inline editing -------------------------------------------------------
  const commitInline = () => {
    if (!inlineEdit) return;
    const task = projectTasks.find(t => t.id === inlineEdit.id);
    if (!task) { setInlineEdit(null); return; }

    if (inlineEdit.field === 'duration') {
      const days = parseFloat(inlineEdit.value);
      if (isNaN(days) || days < 0) {
        onAddToast('Please enter a valid duration number (>= 0).', 'error');
        setInlineEdit(null);
        return;
      }
      onUpdateTask({ ...task, durationDays: snapHalf(days) });
    } else if (inlineEdit.field === 'status') {
      const next = inlineEdit.value as Task['status'];
      const patch: Partial<Task> = { status: next };
      if (next === 'completed') patch.progress = 100;
      onUpdateTask({ ...task, ...patch });
    } else if (inlineEdit.field === 'assignee') {
      const assignedConsultantId = inlineEdit.value === '' ? null : inlineEdit.value;
      onUpdateTask({ ...task, assignedConsultantId });
    }
    setInlineEdit(null);
  };

  // ---- Drag-and-drop handlers ----------------------------------------------
  const isDescendant = (rootId: string, maybeDescId: string): boolean => {
    const desc = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop()!;
      projectTasks.filter(t => t.parentId === cur).forEach(c => {
        if (!desc.has(c.id)) { desc.add(c.id); stack.push(c.id); }
      });
    }
    return desc.has(maybeDescId);
  };

  const siblingsOf = (parentId: string | null) => projectTasks.filter(t => (t.parentId ?? null) === parentId);

  const applyDrop = () => {
    if (!dragId || !dropTarget || dragId === dropTarget.id) {
      setDragId(null); setDropTarget(null); return;
    }
    const dragged = projectTasks.find(t => t.id === dragId);
    const target = projectTasks.find(t => t.id === dropTarget.id);
    if (!dragged || !target) { setDragId(null); setDropTarget(null); return; }

    // Determine the new parent + sibling list.
    let newParentId: string | null;
    let anchorId: string;
    let insertBefore: boolean;

    if (dropTarget.type === 'into') {
      newParentId = target.id;
      // Append at the end of the target's children.
      const updates = buildReorderUpdates(dragId, target.id, null, false);
      // Only reparent if it's safe (not onto a descendant).
      if (isDescendant(dragId, target.id)) {
        onAddToast('Cannot move a task under one of its own subtasks.', 'warning');
      } else {
        onReorderTasks(updates);
      }
      setDragId(null); setDropTarget(null); return;
    }

    newParentId = target.parentId ?? null;
    anchorId = target.id;
    insertBefore = dropTarget.type === 'before';

    if (isDescendant(dragId, anchorId)) {
      onAddToast('Cannot reorder a task relative to one of its own subtasks.', 'warning');
      setDragId(null); setDropTarget(null); return;
    }

    const updates = buildReorderUpdates(dragId, newParentId, anchorId, insertBefore);
    onReorderTasks(updates);
    setDragId(null); setDropTarget(null);
  };

  // Build a sortOrder rewrite for an entire sibling group, optionally moving
  // `movedId` into that group near `anchorId`.
  const buildReorderUpdates = (
    movedId: string,
    newParentId: string | null,
    anchorId: string | null,
    insertBefore: boolean
  ): { id: string; sortOrder: number; parentId?: string | null }[] => {
    // Start from the destination sibling list (excluding the moved task).
    let group = projectTasks
      .filter(t => (t.parentId ?? null) === newParentId && t.id !== movedId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    if (anchorId) {
      const idx = group.findIndex(t => t.id === anchorId);
      if (idx !== -1) {
        group.splice(insertBefore ? idx : idx + 1, 0, projectTasks.find(t => t.id === movedId)!);
      } else {
        group.push(projectTasks.find(t => t.id === movedId)!);
      }
    } else {
      group.push(projectTasks.find(t => t.id === movedId)!);
    }

    return group.map((t, i) => ({
      id: t.id,
      sortOrder: (i + 1) * 10,
      parentId: t.id === movedId ? newParentId : (t.parentId ?? null)
    }));
  };

  // ---- Render helpers -------------------------------------------------------
  const renderDependencyTree = (
    parentId: string | null,
    depth: number,
    parentNumber: string,
    editingId: string | null,
    selected: string[],
    toggle: (id: string) => void
  ): React.ReactNode[] => {
    const levelTasks = projectTasks.filter(t => t.parentId === parentId);
    if (levelTasks.length === 0) return [];
    return levelTasks.map((task, index) => {
      if (editingId && task.id === editingId) return null;
      const taskNumber = parentNumber ? `${parentNumber}.${index + 1}` : `${index + 1}`;
      const isTaskParent = isParent(task.id);
      return (
        <div key={task.id} style={{ display: 'flex', flexDirection: 'column' }}>
          <label className="tv2-dep-row" style={{ paddingLeft: `${depth * 1.25}rem` }}>
            <input type="checkbox" className="win-checkbox"
              checked={selected.includes(task.id)}
              onChange={() => toggle(task.id)}
            />
            <span className="tv2-wbs-mini">{taskNumber}</span>
            <span>{task.name}</span>
          </label>
          {isTaskParent && renderDependencyTree(task.id, depth + 1, taskNumber, editingId, selected, toggle)}
        </div>
      );
    });
  };

  const renderTree = (
    parentId: string | null,
    depth: number,
    parentNumber: string,
    depthIsLast: boolean[]
  ): React.ReactNode[] => {
    const levelTasks = projectTasks
      .filter(t => (t.parentId ?? null) === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const rows: React.ReactNode[] = [];
    levelTasks.forEach((task, index) => {
      if (!matchesTree(task)) return;

      const taskNumber = parentNumber ? `${parentNumber}.${index + 1}` : `${index + 1}`;
      const taskIsParent = isParent(task.id);
      const isExpanded = expanded[task.id] !== false; // expanded by default
      const assigned = consultants.find(c => c.id === task.assignedConsultantId);
      const siblings = siblingsOf(task.parentId ?? null);
      const sibIndex = siblings.findIndex(s => s.id === task.id);
      const isLastSibling = sibIndex === siblings.length - 1;
      const isSelected = selectedIds.includes(task.id);
      const isOverdue = isTaskOverdue(task);
      const blockedBy = (task.predecessorIds || []).map(id => projectTasks.find(t => t.id === id)).filter(Boolean) as Task[];
      const blockingCount = projectTasks.filter(t => (t.predecessorIds || []).includes(task.id)).length;
      const prog = progressFor(task);

      // Three drop targets around each row.
      const isDropBefore = dropTarget?.type === 'before' && dropTarget.id === task.id;
      const isDropAfter = dropTarget?.type === 'after' && dropTarget.id === task.id;
      const isDropInto = dropTarget?.type === 'into' && dropTarget.id === task.id;
      const isDragging = dragId === task.id;

      rows.push(
        <div key={task.id} className="tv2-row-wrap">
          {/* before drop indicator */}
          <div
            className={`tv2-drop-zone ${isDropBefore ? 'tv2-drop-active' : ''}`}
            onDragOver={(e) => { if (dragId && dragId !== task.id && !isDescendant(task.id, dragId)) { e.preventDefault(); setDropTarget({ type: 'before', id: task.id }); } }}
            onDrop={(e) => { e.preventDefault(); applyDrop(); }}
          />
          <div
            className={`tv2-row ${isSelected ? 'tv2-row-selected' : ''} ${isDragging ? 'tv2-row-dragging' : ''} ${isDropInto ? 'tv2-row-dropinto' : ''} tv2-status-${task.status}`}
            draggable={canEditTask(activeRole)}
            onDragStart={(e) => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', task.id); } catch { /* noop */ } }}
            onDragEnd={() => { setDragId(null); setDropTarget(null); }}
            onDragOver={(e) => {
              if (!dragId || dragId === task.id) return;
              if (isDescendant(task.id, dragId)) return;
              e.preventDefault();
              // "into" when hovering the central body, otherwise leave before/after as set by the zones.
              if (e.currentTarget === e.target) setDropTarget({ type: 'into', id: task.id });
            }}
            onDrop={(e) => { e.preventDefault(); applyDrop(); }}
            style={{ '--tv2-depth': depth } as React.CSSProperties}
          >
            {/* Left: guide lines + grip + checkbox + expand + name */}
            <div className="tv2-cell tv2-cell-name" onClick={() => setDrawerTaskId(task.id)}>
              <div className="tv2-guides" aria-hidden>
                {Array.from({ length: depth }).map((_, i) => (
                  <span key={i} className="tv2-guide-col">
                    {i < depth - 1 && !depthIsLast[i] && <span className="tv2-guide-v" />}
                    {i === depth - 1 && <>
                      <span className={`tv2-guide-v ${isLastSibling ? 'tv2-half' : ''}`} />
                      <span className="tv2-guide-h" />
                    </>}
                  </span>
                ))}
              </div>
              <div className="tv2-name-inner" style={{ paddingLeft: `${depth * 20}px` }}>
                {canEditTask(activeRole) && (
                  <span className="tv2-grip" title="Drag to reorder or nest"><GripVertical size={14} /></span>
                )}
                {canEditTask(activeRole) && (
                  <input type="checkbox" className="win-checkbox tv2-check"
                    checked={isSelected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSelectedIds(prev => e.target.checked ? [...prev, task.id] : prev.filter(id => id !== task.id))}
                  />
                )}
                {taskIsParent ? (
                  <button type="button" className="tv2-toggle" onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                ) : (
                  <span className="tv2-toggle-spacer" />
                )}
                <span className="tv2-wbs">{taskNumber}</span>
                <span className={`tv2-name-text ${taskIsParent ? 'tv2-name-parent' : ''}`}>{task.name}</span>
                <span className="tv2-tags">
                  {task.pinkNumber && <span className="tv2-chip tv2-chip-pink" title="Pink Number">Pink #{task.pinkNumber}</span>}
                  {task.billed && <span className="tv2-chip tv2-chip-billed">Billed</span>}
                  {isOverdue && <span className="tv2-chip tv2-chip-overdue" title={`Was due ${task.plannedEndDate}`}><AlertTriangle size={11} /> Overdue</span>}
                  {blockedBy.length > 0 && <span className="tv2-chip tv2-chip-dep" title={`Depends on: ${blockedBy.map(b => b.name).join(', ')}`}><Link2 size={11} /> {blockedBy.length}</span>}
                  {blockingCount > 0 && <span className="tv2-chip tv2-chip-blocks" title={`Blocks ${blockingCount} other task(s)`}>⛓ {blockingCount}</span>}
                </span>
              </div>
            </div>

            {/* Assignee */}
            <div className="tv2-cell tv2-cell-assignee">
              {inlineEdit?.id === task.id && inlineEdit.field === 'assignee' ? (
                <div className="tv2-inline-edit" onClick={(e) => e.stopPropagation()}>
                  <WinComboBox
                    value={inlineEdit.value}
                    onChange={(val) => setInlineEdit({ ...inlineEdit, value: val })}
                    options={[{ label: 'Unassigned', value: '' }, ...consultants.map(c => ({ label: c.name, value: c.id }))]}
                  />
                  <button className="btn btn-primary tv2-inline-ok" onClick={commitInline}><Check size={13} /></button>
                </div>
              ) : (
                <button type="button" className="tv2-cell-btn"
                  disabled={!canEditTask(activeRole)}
                  onClick={(e) => { e.stopPropagation(); setInlineEdit({ id: task.id, field: 'assignee', value: task.assignedConsultantId || '' }); }}
                >
                  {assigned ? (
                    <>
                      <span className="tv2-avatar" style={{ backgroundColor: assigned.avatarColor || '#1e3449' }}>
                        {initials(assigned.name)}
                      </span>
                      <span className="tv2-assignee-name">{assigned.name.split(' ')[0]}</span>
                    </>
                  ) : (
                    <span className="tv2-unassigned">Unassigned</span>
                  )}
                </button>
              )}
            </div>

            {/* Duration */}
            <div className="tv2-cell tv2-cell-duration">
              {inlineEdit?.id === task.id && inlineEdit.field === 'duration' ? (
                <div className="tv2-inline-edit" onClick={(e) => e.stopPropagation()}>
                  <input type="number" step="0.5" min="0" autoFocus className="form-input tv2-duration-input"
                    value={inlineEdit.value}
                    onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitInline(); if (e.key === 'Escape') setInlineEdit(null); }}
                  />
                  <button className="btn btn-primary tv2-inline-ok" onClick={commitInline}><Check size={13} /></button>
                </div>
              ) : (
                <button type="button" className="tv2-cell-btn tv2-cell-btn-center"
                  disabled={!canEditTask(activeRole) || taskIsParent}
                  title={taskIsParent ? 'Parent duration is computed from children' : 'Edit duration'}
                  onClick={(e) => { e.stopPropagation(); if (!taskIsParent) setInlineEdit({ id: task.id, field: 'duration', value: String(task.durationDays) }); }}
                >
                  <Clock size={12} /> {task.durationDays}d
                </button>
              )}
            </div>

            {/* Start date (read-only in the row; editable in the drawer) */}
            <div className="tv2-cell tv2-cell-start">
              <span className="tv2-readonly">
                <Calendar size={12} />
                {task.plannedStartDate ? formatDateFriendly(task.plannedStartDate) : <span className="tv2-dash">—</span>}
              </span>
            </div>

            {/* Progress (mini bar) */}
            <div className="tv2-cell tv2-cell-progress" title={`${prog}% complete${taskIsParent ? ' (weighted rollup)' : ''}`}>
              <div className="tv2-progress-mini">
                <div className="tv2-progress-fill" style={{ width: `${prog}%`, backgroundColor: accent }} />
              </div>
              <span className="tv2-progress-num">{prog}%</span>
            </div>

            {/* Status */}
            <div className="tv2-cell tv2-cell-status">
              {inlineEdit?.id === task.id && inlineEdit.field === 'status' ? (
                <div className="tv2-inline-edit" onClick={(e) => e.stopPropagation()}>
                  <WinComboBox
                    value={inlineEdit.value}
                    onChange={(val) => setInlineEdit({ ...inlineEdit, value: val })}
                    options={STATUS_OPTIONS}
                  />
                  <button className="btn btn-primary tv2-inline-ok" onClick={commitInline}><Check size={13} /></button>
                </div>
              ) : (
                <button type="button" className={statusBadgeClass(task.status)}
                  disabled={!canEditTask(activeRole)}
                  onClick={(e) => { e.stopPropagation(); setInlineEdit({ id: task.id, field: 'status', value: task.status }); }}
                >
                  {statusLabel(task.status)}
                </button>
              )}
            </div>
          </div>
          {/* after drop indicator */}
          <div
            className={`tv2-drop-zone ${isDropAfter ? 'tv2-drop-active' : ''}`}
            onDragOver={(e) => { if (dragId && dragId !== task.id && !isDescendant(task.id, dragId)) { e.preventDefault(); setDropTarget({ type: 'after', id: task.id }); } }}
            onDrop={(e) => { e.preventDefault(); applyDrop(); }}
          />

          {taskIsParent && isExpanded && (
            <div className="tv2-children">
              {renderTree(task.id, depth + 1, taskNumber, [...depthIsLast, isLastSibling])}
            </div>
          )}
        </div>
      );
    });
    return rows;
  };

  const drawerTask = drawerTaskId && drawerTaskId !== '__new__' ? (projectTasks.find(t => t.id === drawerTaskId) ?? null) : null;
  const hasActiveFilters = hideCompleted || billedFilter !== 'all' || assigneeFilter !== 'all' || statusFilter !== 'all' || onlyMine;

  return (
    <div className="tv2-root">
      {/* Summary strip */}
      <div className="tv2-summary">
        <div className="tv2-summary-item">
          <span className="tv2-summary-label">Allocated</span>
          <span className="tv2-summary-value">
            {totalAllocated.toFixed(1)}d <span className="tv2-summary-sub">/ {project.budgetDays.toFixed(1)}d</span>
          </span>
          {isOverBudget
            ? <span className="tv2-badge tv2-badge-danger">Over by {(totalAllocated - project.budgetDays).toFixed(1)}d</span>
            : <span className="tv2-badge tv2-badge-success">{(project.budgetDays - totalAllocated).toFixed(1)}d left</span>}
        </div>
        <div className="tv2-summary-item">
          <span className="tv2-summary-label">Progress</span>
          <div className="tv2-progress-wide">
            <div className="tv2-progress-fill" style={{ width: `${overallProgress}%`, backgroundColor: accent }} />
          </div>
          <span className="tv2-summary-value">{overallProgress}%</span>
        </div>
        <div className="tv2-summary-item">
          <span className="tv2-summary-label">Tasks</span>
          <span className="tv2-summary-value">{leafTasks.length} <span className="tv2-summary-sub">leaf</span></span>
        </div>
      </div>

      {/* My Tasks strip */}
      {myActiveTasks.length > 0 && (
        <div className="tv2-mytasks">
          <span className="tv2-mytasks-icon"><ListChecks size={15} /></span>
          <span className="tv2-mytasks-text">
            You have <b>{myActiveTasks.length}</b> active task{myActiveTasks.length === 1 ? '' : 's'} assigned on this project.
          </span>
          <button className={`btn ${onlyMine ? 'btn-primary' : 'btn-secondary'} tv2-mytasks-btn`} onClick={() => setOnlyMine(v => !v)}>
            {onlyMine ? 'Showing only mine' : 'Show only mine'}
          </button>
          {onlyMine && <button className="btn btn-ghost tv2-mytasks-clear" onClick={() => setOnlyMine(false)}><X size={14} /></button>}
        </div>
      )}

      {/* Toolbar */}
      <div className="tv2-toolbar">
        <div className="tv2-toolbar-left">
          <h3 className="tv2-title">Implementation Tasks</h3>
          {canCreateTask(activeRole) && (
            <button className="btn btn-primary tv2-add-btn"
              style={{ backgroundColor: accent, color: 'white', border: '1px solid rgba(0,0,0,0.1)' }}
              onClick={() => setDrawerTaskId('__new__')}
            >
              <Plus size={15} /> Add Task
            </button>
          )}
        </div>
        <div className="tv2-filters">
          <span className="tv2-filters-label"><Filter size={13} /> Filters</span>
          <label className="tv2-filter-check">
            <input type="checkbox" className="win-checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
            <span>Hide completed</span>
          </label>
          <span className="tv2-filter-divider" />
          <WinComboBox className="tv2-filter-combo" value={billedFilter}
            onChange={(v) => setBilledFilter(v as BilledFilter)}
            options={[{ label: 'All billing', value: 'all' }, { label: 'Billed only', value: 'only' }, { label: 'Hide billed', value: 'hide' }]}
          />
          <WinComboBox className="tv2-filter-combo" value={assigneeFilter}
            onChange={setAssigneeFilter}
            options={[{ label: 'All assignees', value: 'all' }, { label: 'Unassigned', value: 'unassigned' }, ...consultants.map(c => ({ label: c.name, value: c.id }))]}
          />
          <WinComboBox className="tv2-filter-combo" value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[{ label: 'All statuses', value: 'all' }, ...STATUS_OPTIONS]}
          />
          {hasActiveFilters && (
            <button className="btn btn-ghost tv2-clear-filters" onClick={() => { setHideCompleted(false); setBilledFilter('all'); setAssigneeFilter('all'); setStatusFilter('all'); setOnlyMine(false); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Tree table */}
      <div className="tv2-table card" style={{ borderTop: `4px solid ${accent}` }}>
        {projectTasks.length === 0 ? (
          <div className="tv2-empty">
            <p>No tasks created yet for this project. Click <b>Add Task</b> to build your implementation checklist.</p>
          </div>
        ) : (
          <div className="tv2-table-scroll">
            <div className="tv2-head">
              <div className="tv2-cell tv2-cell-name">
                <span className="tv2-head-check">
                  {canEditTask(activeRole) && (
                    <input type="checkbox" className="win-checkbox"
                      checked={leafTasks.length > 0 && selectedIds.length === leafTasks.length}
                      onChange={(e) => setSelectedIds(e.target.checked ? leafTasks.map(t => t.id) : [])}
                    />
                  )}
                </span>
                Task Name
              </div>
              <div className="tv2-cell tv2-cell-assignee">Assignee</div>
              <div className="tv2-cell tv2-cell-duration">Dur.</div>
              <div className="tv2-cell tv2-cell-start">Start</div>
              <div className="tv2-cell tv2-cell-progress">Progress</div>
              <div className="tv2-cell tv2-cell-status">Status</div>
            </div>
            {renderTree(null, 0, '', [])}
          </div>
        )}
      </div>

      {/* Floating bulk-action bar */}
      {selectedIds.length > 0 && (
        <div className="tv2-bulkbar">
          <span className="tv2-bulkbar-count">{selectedIds.length} selected</span>
          <span className="tv2-bulkbar-divider" />
          <div className="tv2-bulkbar-group">
            <span className="tv2-bulkbar-label">Status:</span>
            <WinComboBox className="tv2-bulkbar-combo" value="" menuPosition="top"
              onChange={(v) => { if (v) { onBulkUpdateTasks(selectedIds, { status: v as Task['status'], ...(v === 'completed' ? { progress: 100 } : {}) }); setSelectedIds([]); } }}
              options={[{ label: 'Change…', value: '' }, ...STATUS_OPTIONS]}
            />
          </div>
          <div className="tv2-bulkbar-group">
            <span className="tv2-bulkbar-label">Assignee:</span>
            <WinComboBox className="tv2-bulkbar-combo" value="" menuPosition="top"
              onChange={(v) => { if (v) { onBulkUpdateTasks(selectedIds, { assignedConsultantId: v === 'unassigned' ? null : v }); setSelectedIds([]); } }}
              options={[{ label: 'Change…', value: '' }, { label: 'Unassigned', value: 'unassigned' }, ...consultants.map(c => ({ label: c.name, value: c.id }))]}
            />
          </div>
          <div className="tv2-bulkbar-group">
            <span className="tv2-bulkbar-label">Billing:</span>
            <WinComboBox className="tv2-bulkbar-combo" value="" menuPosition="top"
              onChange={(v) => { if (v) { onBulkUpdateTasks(selectedIds, { billed: v === 'billed' }); setSelectedIds([]); } }}
              options={[{ label: 'Change…', value: '' }, { label: 'Mark billed', value: 'billed' }, { label: 'Mark unbilled', value: 'unbilled' }]}
            />
          </div>
          {canDeleteTask(activeRole) && (
            <button className="btn btn-danger tv2-bulkbar-delete"
              onClick={() => { if (confirm(`Delete ${selectedIds.length} selected task(s)? Subtasks will also be deleted.`)) { onBulkDeleteTasks(selectedIds); setSelectedIds([]); } }}
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      )}

      {/* Slide-over drawer (edit / create) */}
      {(drawerTaskId || drawerTaskId === '__new__') && (
        <TaskDrawer
          mode={drawerTaskId === '__new__' ? 'create' : 'edit'}
          task={drawerTask}
          project={project}
          tasks={projectTasks}
          consultants={consultants}
          accent={accent}
          canEdit={canEditTask(activeRole)}
          isParent={isParent}
          progressFor={progressFor}
          onClose={() => setDrawerTaskId(null)}
          onSave={(t) => { onCreateTask(t); setDrawerTaskId(null); onAddToast('Task created successfully!', 'success'); }}
          onUpdate={(t) => { onUpdateTask(t); /* keep drawer open for further edits */ }}
          onDelete={(id) => { onDeleteTask(id); setDrawerTaskId(null); onAddToast('Task deleted.', 'warning'); }}
          renderDependencyTree={renderDependencyTree}
        />
      )}
    </div>
  );
}

// =============================================================================
// Slide-over drawer
// =============================================================================

interface TaskDrawerProps {
  mode: 'create' | 'edit';
  task: Task | null;
  project: Project;
  tasks: Task[];
  consultants: Consultant[];
  accent: string;
  canEdit: boolean;
  isParent: (id: string) => boolean;
  progressFor: (t: Task) => number;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id'>) => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  renderDependencyTree: (
    parentId: string | null, depth: number, parentNumber: string,
    editingId: string | null, selected: string[], toggle: (id: string) => void
  ) => React.ReactNode[];
}

function TaskDrawer(props: TaskDrawerProps) {
  const { mode, task, project, tasks, consultants, accent, canEdit, isParent, progressFor, onClose, onSave, onUpdate, onDelete, renderDependencyTree } = props;
  const creating = mode === 'create';

  const [form, setForm] = useState(() => buildForm(task, creating));
  // For edit mode, auto-persist on every change (the parent re-schedules). For
  // create mode we wait for the explicit Save button.
  const update = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    // Snap duration to half-days; auto-set progress on complete.
    if (patch.durationDays !== undefined) next.durationDays = snapHalf(patch.durationDays);
    if (patch.status === 'completed') next.progress = 100;
    setForm(next);
    if (!creating && task) {
      onUpdate({ ...task, ...toTaskPatch(next, task) });
    }
  };

  const toggleDep = (id: string) => {
    const has = form.predecessorIds.includes(id);
    update({ predecessorIds: has ? form.predecessorIds.filter(x => x !== id) : [...form.predecessorIds, id] });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (creating) {
      const siblings = tasks.filter(t => (t.parentId ?? null) === (form.parentId || null));
      const maxSort = siblings.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0);
      onSave({ ...toTaskPatch(form, null), projectId: project.id, sortOrder: maxSort + 10 });
    }
  };

  const isEditingParent = !creating && task ? isParent(task.id) : false;
  const showRollupNote = isEditingParent;

  return (
    <>
      <div className="tv2-drawer-backdrop" onClick={onClose} />
      <aside className="tv2-drawer" role="dialog" aria-modal="true">
        <form onSubmit={handleSubmit} className="tv2-drawer-form">
          <header className="tv2-drawer-header" style={{ borderBottomColor: accent }}>
            <div>
              <span className="tv2-drawer-eyebrow">{creating ? 'New task' : 'Edit task'}</span>
              <h3 className="tv2-drawer-title">{creating ? 'Add Implementation Task' : form.name || 'Task'}</h3>
            </div>
            <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}><X size={18} /></button>
          </header>

          <div className="tv2-drawer-body">
            <div className="tv2-field">
              <label className="form-label">Task name</label>
              <input className="form-input" value={form.name}
                placeholder="e.g. Chart of Accounts Setup"
                onChange={(e) => update({ name: e.target.value })} required />
            </div>

            <div className="tv2-field-row">
              <div className="tv2-field">
                <label className="form-label">Status</label>
                <WinComboBox value={form.status} onChange={(v) => update({ status: v as Task['status'] })} options={STATUS_OPTIONS} />
              </div>
              <div className="tv2-field">
                <label className="form-label">Assignee</label>
                <WinComboBox value={form.assignedConsultantId}
                  onChange={(v) => update({ assignedConsultantId: v })}
                  options={[{ label: 'Unassigned', value: '' }, ...consultants.map(c => ({ label: c.name, value: c.id }))]} />
              </div>
            </div>

            <div className="tv2-field-row">
              <div className="tv2-field">
                <label className="form-label">Duration (days)</label>
                <input type="number" step="0.5" min="0" className="form-input" value={form.durationDays}
                  disabled={isEditingParent}
                  title={isEditingParent ? 'Parent duration is computed from children' : undefined}
                  onChange={(e) => update({ durationDays: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="tv2-field">
                <label className="form-label">Start date</label>
                <WinDatePicker value={form.customStartDate} onChange={(v) => update({ customStartDate: v })} />
              </div>
            </div>

            <div className="tv2-field">
              <label className="form-label">
                Progress {showRollupNote && <span className="tv2-hint">(weighted rollup of children)</span>}
              </label>
              {showRollupNote ? (
                <div className="tv2-progress-wide">
                  <div className="tv2-progress-fill" style={{ width: `${progressFor(task!)}%`, backgroundColor: accent }} />
                </div>
              ) : (
                <div className="tv2-slider-row">
                  <input type="range" min={0} max={100} step={5} className="tv2-slider" value={form.progress}
                    onChange={(e) => update({ progress: parseInt(e.target.value, 10) })} />
                  <span className="tv2-slider-value">{form.progress}%</span>
                </div>
              )}
            </div>

            <div className="tv2-field-row">
              <div className="tv2-field">
                <label className="form-label">Parent task</label>
                <WinComboBox value={form.parentId}
                  onChange={(v) => update({ parentId: v })}
                  options={[{ label: 'None (top-level)', value: '' }, ...tasks.filter(t => t.id !== task?.id && !isParent(t.id)).map(t => ({ label: t.name, value: t.id }))]} />
              </div>
              <div className="tv2-field">
                <label className="form-label">Pink number</label>
                <input className="form-input" value={form.pinkNumber} placeholder="e.g. PN-12345"
                  onChange={(e) => update({ pinkNumber: e.target.value })} />
              </div>
            </div>

            <label className="tv2-check-row">
              <input type="checkbox" className="win-checkbox" checked={form.billed}
                onChange={(e) => update({ billed: e.target.checked })} />
              <span>Billed</span>
            </label>

            <div className="tv2-field">
              <label className="form-label">Dependencies</label>
              <div className="tv2-dep-list">
                {tasks.filter(t => t.id !== task?.id).length === 0
                  ? <span className="tv2-dep-empty">No other tasks available for dependency links.</span>
                  : renderDependencyTree(null, 0, '', task?.id ?? null, form.predecessorIds, toggleDep)}
              </div>
            </div>

            <div className="tv2-field">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" rows={3} value={form.description}
                placeholder="Provide execution steps or details…"
                onChange={(e) => update({ description: e.target.value })} />
            </div>
          </div>

          <footer className="tv2-drawer-footer">
            {!creating && task && canEdit && (
              <button type="button" className="btn btn-ghost tv2-drawer-danger"
                onClick={() => { if (confirm(`Delete "${task.name}"? Subtasks will also be deleted.`)) onDelete(task.id); }}>
                <Trash2 size={14} /> Delete
              </button>
            )}
            <div className="tv2-drawer-spacer" />
            <button type="button" className="btn btn-secondary" onClick={onClose}>{creating ? 'Cancel' : 'Done'}</button>
            {creating && <button type="submit" className="btn btn-primary" style={{ backgroundColor: accent, color: 'white', border: '1px solid rgba(0,0,0,0.1)' }}>Create task</button>}
          </footer>
        </form>
      </aside>
    </>
  );
}

// =============================================================================
// Pure helpers
// =============================================================================

function clampProgress(n?: number): number {
  const v = Math.round(n ?? 0);
  if (isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function snapHalf(n: number): number {
  return Math.max(0.5, Math.round(n * 2) / 2);
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function isTaskOverdue(task: Task): boolean {
  if (task.status === 'completed' || !task.plannedEndDate) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(task.plannedEndDate + 'T00:00:00');
  return end.getTime() < today.getTime();
}

interface DrawerForm {
  name: string;
  description: string;
  status: Task['status'];
  assignedConsultantId: string;
  durationDays: number;
  customStartDate: string;
  parentId: string;
  pinkNumber: string;
  billed: boolean;
  progress: number;
  predecessorIds: string[];
}

function buildForm(task: Task | null, creating: boolean): DrawerForm {
  if (creating || !task) {
    return {
      name: '', description: '', status: 'not_started', assignedConsultantId: '',
      durationDays: 1, customStartDate: '', parentId: '', pinkNumber: '', billed: false,
      progress: 0, predecessorIds: []
    };
  }
  return {
    name: task.name,
    description: task.description,
    status: task.status,
    assignedConsultantId: task.assignedConsultantId || '',
    durationDays: task.durationDays,
    customStartDate: task.customStartDate || '',
    parentId: task.parentId || '',
    pinkNumber: task.pinkNumber || '',
    billed: !!task.billed,
    progress: clampProgress(task.progress),
    predecessorIds: task.predecessorIds || []
  };
}

function toTaskPatch(form: DrawerForm, existing: Task | null): Omit<Task, 'id'> {
  return {
    projectId: existing?.projectId ?? '',
    parentId: form.parentId || null,
    name: form.name,
    description: form.description,
    durationDays: form.durationDays,
    assignedConsultantId: form.assignedConsultantId || null,
    predecessorIds: form.predecessorIds,
    status: form.status,
    pinkNumber: form.pinkNumber,
    billed: form.billed,
    customStartDate: form.customStartDate || null,
    progress: form.progress,
    ...(existing ? {
      o365TaskId: existing.o365TaskId,
      o365CalendarEventId: existing.o365CalendarEventId,
      sortOrder: existing.sortOrder
    } : {})
  };
}

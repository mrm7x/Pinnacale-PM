import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import type {
  Project, Task, Consultant, TaskColumnId, TaskView,
  StatusFilter, OwnerFilter, TaskViewMode, KanbanGroupMode
} from '../types';
import { canCreateTask, canEditTask, canEditAnyTask, type ActiveUser } from '../utils/permissions';
import {
  Plus, ChevronDown, ChevronRight, X, Clock, Calendar, Trash2,
  Link2, AlertTriangle, ListChecks, GripVertical, CornerDownRight,
  Columns3, List, Minus, Save, Copy, Upload
} from 'lucide-react';
import { WinComboBox } from './winui/WinComboBox';
import { WinDatePicker } from './winui/WinDatePicker';
import { formatDateFriendly } from '../utils/dates';
import { getProjectAccent } from '../utils/phases';
import { getQuickAddMode } from '../utils/preferences';
import TaskImportModal from './TaskImportModal';

/** Where a hover quick-add inserts relative to the hovered task. */
type QuickAddPlacement = 'before' | 'after' | 'firstChild';

/** Client-side task id, same shape App.tsx uses for new tasks. */
const newTaskId = () => `t-${Math.random().toString(36).substring(2, 9)}`;

/**
 * Tasks v2 — a re-imagined implementation-task tree.
 *
 * Design goals vs. the original "tasks" tab:
 *  - No overlapping/cluttered controls. The row holds only hot cells:
 *    status, assignee, duration (all click-to-edit, sized to their column).
 *  - Everything else (name, dates, dependencies, pink#, description, progress)
 *    lives in a centered floating modal that opens on task-name click.
 *  - Reorder/reparent via drag-and-drop (drop between rows = reorder among
 *    siblings; drop onto a row = nest under it). Distinct visual indicators.
 *
 * Enhancements: per-task Progress % (duration-weighted rollup on parents),
 * an overdue badge, dependency-count hints, a "My Tasks" worklist strip,
 * a due date that derives duration when no days are budgeted, and a
 * Task Owner concept (Customer-owned days are excluded from budget).
 */

interface TaskListV2Props {
  project: Project;
  tasks: Task[];
  consultants: Consultant[];
  activeUserId: string;
  activeUser: ActiveUser | null;
  onCreateTask: (task: Omit<Task, 'id'>) => void;
  /** Insert tasks (ids pre-assigned) and shift sibling sortOrders in one write. */
  onInsertTasks: (tasks: Task[], reorder?: { id: string; sortOrder: number }[], replaced?: Task[]) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onBulkUpdateTasks: (ids: string[], updates: Partial<Task>) => void;
  onBulkDeleteTasks: (ids: string[]) => void;
  onReorderTasks: (updates: { id: string; sortOrder: number; parentId?: string | null }[]) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

type TaskOwner = 'Pinnacle' | 'Customer' | 'Pinnacle/Customer';

interface KanbanColumn {
  id: string;
  label: string;
  tasks: Task[];
}

// ---------------------------------------------------------------------------
// Column registry — the single source of truth for table columns.
// Each entry carries its grid track size + header label. Row rendering maps
// over the visible subset and switches on the id to emit the matching cell.
// `name` is the only non-removable column.
// ---------------------------------------------------------------------------
interface ColumnDef {
  id: TaskColumnId;
  label: string;
  /** CSS grid track for this column. */
  size: string;
  /** Whether the user can hide this column (name is always visible). */
  toggleable: boolean;
}

const COLUMN_DEFS: ColumnDef[] = [
  { id: 'name',     label: 'Task Name', size: 'minmax(260px, 1fr)',     toggleable: false },
  { id: 'assignee', label: 'Assignee',  size: 'minmax(96px, 128px)',    toggleable: true },
  { id: 'duration', label: 'Dur.',      size: '58px',                   toggleable: true },
  { id: 'start',    label: 'Start',     size: '72px',                   toggleable: true },
  { id: 'due',      label: 'Due',       size: '72px',                   toggleable: true },
  { id: 'progress', label: 'Progress',  size: '56px',                   toggleable: true },
  { id: 'status',   label: 'Status',    size: '124px',                  toggleable: true },
];

const DEFAULT_COLUMNS: TaskColumnId[] = ['name', 'assignee', 'duration', 'start', 'due', 'progress', 'status'];

/** Default "Default View" seeded on first load for each project/user. */
const BUILTIN_VIEW_ID = '__default__';
const makeDefaultView = (): TaskView => ({
  id: BUILTIN_VIEW_ID,
  name: 'Default View',
  columns: [...DEFAULT_COLUMNS],
  hideCompleted: false,
  ownerFilter: 'all',
  assigneeFilter: 'all',
  statusFilter: 'all',
  onlyMine: false,
  viewMode: 'list',
  kanbanGroupMode: 'status',
  fontScale: 1,
  isBuiltIn: true,
});

const STATUS_OPTIONS: { label: string; value: Task['status'] }[] = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Completed', value: 'completed' }
];

const OWNER_OPTIONS: { label: string; value: TaskOwner }[] = [
  { label: 'Pinnacle', value: 'Pinnacle' },
  { label: 'Customer', value: 'Customer' },
  { label: 'Pinnacle / Customer', value: 'Pinnacle/Customer' }
];

// Compact grid date ("6 Nov", year added when it isn't this year); the full
// friendly date stays in the tooltip.
const formatDateShort = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = '2-digit';
  return d.toLocaleDateString('en-GB', opts);
};

const statusLabel = (s: Task['status']) =>
  s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const statusBadgeClass = (s: Task['status']) =>
  s === 'completed' ? 'tv2-badge tv2-badge-success'
  : s === 'in_progress' ? 'tv2-badge tv2-badge-primary'
  : s === 'on_hold' ? 'tv2-badge tv2-badge-warning'
  : 'tv2-badge tv2-badge-secondary';

// Days owned by the Customer don't count toward the project budget (excluded
// wherever a budget total is computed, e.g. Dashboard / ProjectDetails).
export default function TaskListV2({
  project,
  tasks,
  consultants,
  activeUserId,
  activeUser,
  onCreateTask,
  onInsertTasks,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  onBulkDeleteTasks,
  onReorderTasks,
  onAddToast
}: TaskListV2Props) {
  const accent = getProjectAccent(project);

  // Task-level edit predicate: context-aware (role + project + task ownership).
  // Replaces the old single-arg canEditTask(activeRole) used throughout.
  const canEditThisTask = useCallback((task: Task) => canEditTask(activeUser, task, project), [activeUser, project]);

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

  // Count leaf (sub-)tasks beneath a parent and how many are completed.
  // Leaf tasks have status only — no per-task progress. A parent's progress is
  // simply the share of its sub-tasks that are completed.
  const leafStats = useCallback((taskId: string): { completed: number; total: number } => {
    let completed = 0;
    let total = 0;
    const walk = (id: string) => {
      projectTasks.filter(t => t.parentId === id).forEach(child => {
        if (isParent(child.id)) {
          walk(child.id);
        } else {
          total++;
          if (child.status === 'completed') completed++;
        }
      });
    };
    walk(taskId);
    return { completed, total };
  }, [projectTasks, isParent]);

  // Progress % only exists for parents (derived from completed sub-tasks).
  // For a leaf task it is purely status-driven (completed = 100, otherwise 0).
  const progressFor = useCallback((task: Task): number => {
    if (!isParent(task.id)) return task.status === 'completed' ? 100 : 0;
    const { completed, total } = leafStats(task.id);
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  }, [isParent, leafStats]);

  // ---- UI state -------------------------------------------------------------
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  // When non-null, the create modal is open with this as the preset parent (empty string = top-level).
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: 'duration' | 'status' | 'assignee' | 'start'; value: string } | null>(null);

  // Hover quick-add. `quickAdd` drives the inline name row; `pendingInsert`
  // remembers the target position while the full Add Task form is open.
  const [quickAdd, setQuickAdd] = useState<{ anchorId: string; placement: QuickAddPlacement; name: string } | null>(null);
  const [pendingInsert, setPendingInsert] = useState<{ anchorId: string; placement: QuickAddPlacement } | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Filters
  const [hideCompleted, setHideCompleted] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [viewMode, setViewMode] = useState<TaskViewMode>('list');
  const [kanbanGroupMode, setKanbanGroupMode] = useState<KanbanGroupMode>('status');

  // ---- Saved views (per project, per user) + columns + font scale ---------
  const viewsKey = `pinnacle_user_${activeUserId}_project_${project.id}_task_views`;

  const [views, setViews] = useState<TaskView[]>(() => loadViews(viewsKey));
  const [activeViewId, setActiveViewId] = useState<string>(() => loadViews(viewsKey)[0]?.id ?? BUILTIN_VIEW_ID);
  const [visibleColumns, setVisibleColumns] = useState<TaskColumnId[]>(() => [...DEFAULT_COLUMNS]);
  const [fontScale, setFontScale] = useState<number>(1);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const columnsBtnRef = useRef<HTMLButtonElement>(null);
  const columnsPanelRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ type: 'before' | 'after' | 'into'; id: string } | null>(null);
  const [kanbanDragId, setKanbanDragId] = useState<string | null>(null);

  // Reset ephemeral state when the project (or user) changes. Done during
  // render, as React recommends, rather than in an effect that renders twice.
  const resetKey = `${project.id}|${activeUserId}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setSelectedIds([]);
    setModalTaskId(null);
    setCreateParentId(null);
    setInlineEdit(null);
    setQuickAdd(null);
    setPendingInsert(null);
    setShowImport(false);
    setDragId(null);
    setDropTarget(null);
    setKanbanDragId(null);
    setOnlyMine(false);
    setShowColumnsPanel(false);
    setShowSaveAs(false);
    // Reload saved views for the new project.
    const nextViews = loadViews(viewsKey);
    setViews(nextViews);
    const first = nextViews[0] ?? makeDefaultView();
    applyView(first);
  }

  // Close modal on Escape.
  useEffect(() => {
    if (!modalTaskId && !createParentId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setModalTaskId(null); setCreateParentId(null); setPendingInsert(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalTaskId, createParentId]);

  const toggleExpand = (id: string) => setExpanded(prev => {
    const cur = prev[id];
    return { ...prev, [id]: cur === undefined ? true : !cur };
  });

  const openCreate = (parentId: string | null = null) => {
    setCreateParentId(parentId ?? '');
    setModalTaskId(null);
    setPendingInsert(null);
  };

  // ---- Hover quick-add ------------------------------------------------------
  /** Parent the new task gets for a given anchor + placement. */
  const quickAddParent = (anchor: Task, placement: QuickAddPlacement): string | null =>
    placement === 'firstChild' ? anchor.id : (anchor.parentId ?? null);

  /**
   * Plan an insert: the new task's sortOrder, plus sortOrder rewrites for the
   * existing siblings so the group stays evenly spaced at 10, 20, 30…
   * Only siblings whose value actually changes are returned.
   */
  const planInsert = (anchorId: string, placement: QuickAddPlacement) => {
    const anchor = projectTasks.find(t => t.id === anchorId);
    if (!anchor) return null;
    const parentId = quickAddParent(anchor, placement);
    const group = projectTasks
      .filter(t => (t.parentId ?? null) === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const anchorIdx = group.findIndex(t => t.id === anchorId);
    const insertIdx = placement === 'firstChild' ? 0
      : placement === 'before' ? anchorIdx
      : anchorIdx + 1;
    const reorder: { id: string; sortOrder: number }[] = [];
    group.forEach((t, i) => {
      const next = (i < insertIdx ? i + 1 : i + 2) * 10;
      if (t.sortOrder !== next) reorder.push({ id: t.id, sortOrder: next });
    });
    return { parentId, sortOrder: (insertIdx + 1) * 10, reorder };
  };

  const startQuickAdd = (anchor: Task, placement: QuickAddPlacement) => {
    if (getQuickAddMode(activeUserId) === 'form') {
      setModalTaskId(null);
      setPendingInsert({ anchorId: anchor.id, placement });
      setCreateParentId(quickAddParent(anchor, placement) ?? '');
    } else {
      setInlineEdit(null);
      quickAddDone.current = false;
      setQuickAdd({ anchorId: anchor.id, placement, name: '' });
    }
    if (placement === 'firstChild') setExpanded(prev => ({ ...prev, [anchor.id]: true }));
  };

  /** Insert a task built from `fields` at the planned position. Returns false if the anchor vanished. */
  const insertAt = (anchorId: string, placement: QuickAddPlacement, fields: Omit<Task, 'id'>): boolean => {
    const plan = planInsert(anchorId, placement);
    if (!plan) return false;
    onInsertTasks(
      [{ ...fields, id: newTaskId(), projectId: project.id, parentId: plan.parentId, sortOrder: plan.sortOrder }],
      plan.reorder
    );
    return true;
  };

  // Enter commits and unmounts the input, which can also fire blur with the
  // same (stale) quickAdd — this guard makes the second call a no-op.
  // Reset by startQuickAdd each time a new inline row opens.
  const quickAddDone = useRef(false);

  const commitQuickAdd = () => {
    if (!quickAdd || quickAddDone.current) return;
    quickAddDone.current = true;
    const name = quickAdd.name.trim();
    if (!name) { setQuickAdd(null); return; }
    const ok = insertAt(quickAdd.anchorId, quickAdd.placement, {
      projectId: project.id, parentId: null, name, description: '',
      durationDays: 0, assignedConsultantId: null, predecessorIds: [],
      status: 'not_started', taskOwner: 'Pinnacle', progress: 0,
    });
    if (ok) onAddToast(`Task "${name}" added.`, 'success');
    setQuickAdd(null);
  };

  // ---- Saved views: persistence + management --------------------------------
  // Persist views to localStorage whenever the list changes.
  useEffect(() => {
    try {
      localStorage.setItem(viewsKey, JSON.stringify(views));
    } catch { /* quota / private mode — non-fatal */ }
  }, [views, viewsKey]);

  // Close the columns popover on outside click / Escape.
  useEffect(() => {
    if (!showColumnsPanel) return;
    const onDown = (e: MouseEvent) => {
      if (columnsPanelRef.current && !columnsPanelRef.current.contains(e.target as Node) &&
          columnsBtnRef.current && !columnsBtnRef.current.contains(e.target as Node)) {
        setShowColumnsPanel(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowColumnsPanel(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [showColumnsPanel]);

  /** Load a view's columns/filters/font into the live working state. */
  function applyView(view: TaskView) {
    setActiveViewId(view.id);
    setVisibleColumns(sanitizeColumns(view.columns));
    setHideCompleted(view.hideCompleted);
    setOwnerFilter(view.ownerFilter);
    setAssigneeFilter(view.assigneeFilter);
    setStatusFilter(view.statusFilter);
    setOnlyMine(view.onlyMine);
    setViewMode(view.viewMode);
    setKanbanGroupMode(view.kanbanGroupMode);
    setFontScale(view.fontScale);
  }

  /** The active saved view object (or the built-in default). */
  const activeView = views.find(v => v.id === activeViewId) ?? views[0] ?? makeDefaultView();

  /** Snapshot of the current live state as a TaskView (without persisting). */
  const snapshotLive = (id: string, name: string, isBuiltIn = false): TaskView => ({
    id, name, isBuiltIn,
    columns: visibleColumns,
    hideCompleted, ownerFilter, assigneeFilter, statusFilter,
    onlyMine, viewMode, kanbanGroupMode, fontScale,
  });

  /** Does the live state differ from the active saved view? */
  const isDirty = useMemo(() => {
    if (!activeView) return false;
    const a = activeView;
    return (
      !arrayEqual(a.columns, visibleColumns) ||
      a.hideCompleted !== hideCompleted ||
      a.ownerFilter !== ownerFilter ||
      a.assigneeFilter !== assigneeFilter ||
      a.statusFilter !== statusFilter ||
      a.onlyMine !== onlyMine ||
      a.viewMode !== viewMode ||
      a.kanbanGroupMode !== kanbanGroupMode ||
      a.fontScale !== fontScale
    );
  }, [activeView, visibleColumns, hideCompleted, ownerFilter, assigneeFilter, statusFilter, onlyMine, viewMode, kanbanGroupMode, fontScale]);

  const saveView = () => {
    if (!activeView) return;
    setViews(prev => prev.map(v => v.id === activeView.id ? snapshotLive(v.id, v.name, v.isBuiltIn) : v));
    onAddToast(`View "${activeView.name}" updated.`, 'success');
  };

  const saveAsNewView = () => {
    const name = saveAsName.trim();
    if (!name) return;
    const id = `view_${Date.now()}`;
    const created = snapshotLive(id, name, false);
    setViews(prev => [...prev, created]);
    setActiveViewId(id);
    setShowSaveAs(false);
    setSaveAsName('');
    onAddToast(`View "${name}" created.`, 'success');
  };

  const deleteView = (view: TaskView) => {
    if (view.isBuiltIn) return;
    if (!confirm(`Delete view "${view.name}"?`)) return;
    const next = views.filter(v => v.id !== view.id);
    setViews(next);
    // If we deleted the active view, switch to the first remaining (built-in).
    if (view.id === activeViewId) {
      applyView(next[0] ?? makeDefaultView());
    }
    onAddToast(`View "${view.name}" deleted.`, 'info');
  };

  // ---- Column show/hide helpers --------------------------------------------
  const toggleColumn = (id: TaskColumnId) => {
    setVisibleColumns(prev => {
      const def = COLUMN_DEFS.find(c => c.id === id);
      if (def && !def.toggleable) return prev; // name is locked
      if (prev.includes(id)) {
        // Don't allow hiding the last remaining column.
        if (prev.length <= 1) return prev;
        return prev.filter(c => c !== id);
      }
      // Re-insert in natural registry order so columns stay left-to-right sane.
      const next = [...prev, id];
      return COLUMN_DEFS.map(c => c.id).filter(c => next.includes(c));
    });
  };

  // Grid template string derived from the visible columns.
  const gridTemplateColumns = useMemo(
    () => visibleColumns
      .map(id => COLUMN_DEFS.find(c => c.id === id)?.size)
      .filter(Boolean)
      .join(' '),
    [visibleColumns]
  );

  const adjustFont = (delta: number) => {
    setFontScale(prev => {
      const next = Math.round((prev + delta) * 100) / 100;
      return Math.max(0.8, Math.min(1.5, next));
    });
  };

  // ---- "My Tasks" worklist --------------------------------------------------
  const myActiveTasks = useMemo(
    () => projectTasks.filter(t =>
      t.assignedConsultantId === activeUserId &&
      (t.status === 'not_started' || t.status === 'in_progress') &&
      !isParent(t.id)
    ),
    [projectTasks, activeUserId, isParent]
  );

  // ---- Leaf tasks (used for selection + budget) -----------------------------
  const leafTasks = useMemo(() => projectTasks.filter(t => !isParent(t.id)), [projectTasks, isParent]);

  // ---- Filtering (keep ancestors of matching descendants visible) ----------
  const matchesSelf = useCallback((task: Task): boolean => {
    if (hideCompleted && task.status === 'completed') return false;
    if (ownerFilter === 'customer' && !isParent(task.id) && task.taskOwner !== 'Customer') return false;
    if (ownerFilter === 'pinnacle' && !isParent(task.id) && task.taskOwner !== 'Pinnacle') return false;
    if (ownerFilter === 'shared' && !isParent(task.id) && task.taskOwner !== 'Pinnacle/Customer') return false;
    if (assigneeFilter === 'unassigned' && task.assignedConsultantId) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && task.assignedConsultantId !== assigneeFilter) return false;
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (onlyMine && task.assignedConsultantId !== activeUserId) return false;
    return true;
  }, [hideCompleted, ownerFilter, assigneeFilter, statusFilter, onlyMine, activeUserId, isParent]);

  const matchesTree = useCallback((task: Task): boolean => {
    const walk = (t: Task): boolean => matchesSelf(t) || childIds(t.id).some(cid => {
      const child = projectTasks.find(x => x.id === cid);
      return child ? walk(child) : false;
    });
    return walk(task);
  }, [matchesSelf, childIds, projectTasks]);

  const kanbanTasks = useMemo(
    () => projectTasks.filter(matchesSelf),
    [projectTasks, matchesSelf]
  );

  // ---- Inline editing (autosave on change / commit) ------------------------
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

  // Immediate commit for combobox-driven inline edits (no confirm button).
  const commitInlineSelect = (id: string, field: 'status' | 'assignee', value: string) => {
    const task = projectTasks.find(t => t.id === id);
    if (!task) { setInlineEdit(null); return; }
    if (field === 'status') {
      const next = value as Task['status'];
      const patch: Partial<Task> = { status: next };
      if (next === 'completed') patch.progress = 100;
      onUpdateTask({ ...task, ...patch });
    } else {
      onUpdateTask({ ...task, assignedConsultantId: value === '' ? null : value });
    }
    setInlineEdit(null);
  };

  // Pin (or un-pin with null) a task's start date. The scheduler treats
  // customStartDate as a hard start; clearing it reverts to auto-scheduling.
  const commitInlineStart = (id: string, value: string | null) => {
    const task = projectTasks.find(t => t.id === id);
    setInlineEdit(null);
    if (!task) return;
    const next = value || null;
    if ((task.customStartDate || null) === next) return;
    onUpdateTask({ ...task, customStartDate: next });
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
    if (dropTarget.type === 'into') {
      const updates= buildReorderUpdates(dragId, target.id, null, false);
      if (isDescendant(dragId, target.id)) {
        onAddToast('Cannot move a task under one of its own subtasks.', 'warning');
      } else {
        onReorderTasks(updates);
      }
      setDragId(null); setDropTarget(null); return;
    }

    const newParentId = target.parentId ?? null;
    const anchorId = target.id;
    const insertBefore = dropTarget.type === 'before';

    if (isDescendant(dragId, anchorId)) {
      onAddToast('Cannot reorder a task relative to one of its own subtasks.', 'warning');
      setDragId(null); setDropTarget(null); return;
    }

    const updates = buildReorderUpdates(dragId, newParentId, anchorId, insertBefore);
    onReorderTasks(updates);
    setDragId(null); setDropTarget(null);
  };

  const applyKanbanDrop = (columnId: string) => {
    if (!kanbanDragId) {
      setKanbanDragId(null);
      return;
    }

    const task = projectTasks.find(t => t.id === kanbanDragId);
    if (!task || !canEditThisTask(task)) {
      setKanbanDragId(null);
      return;
    }

    if (kanbanGroupMode === 'status') {
      const nextStatus = columnId as Task['status'];
      if (task.status !== nextStatus) {
        onUpdateTask({ ...task, status: nextStatus, ...(nextStatus === 'completed' ? { progress: 100 } : {}) });
      }
    } else if (kanbanGroupMode === 'assignee') {
      const assignedConsultantId = columnId === '__unassigned' ? null : columnId;
      if ((task.assignedConsultantId ?? null) !== assignedConsultantId) {
        onUpdateTask({ ...task, assignedConsultantId });
      }
    } else {
      const parentId = columnId === '__top' ? null : columnId;
      if (parentId === task.id) {
        onAddToast('Cannot make a task its own parent.', 'warning');
      } else if (parentId && isDescendant(task.id, parentId)) {
        onAddToast('Cannot move a task under one of its own subtasks.', 'warning');
      } else if ((task.parentId ?? null) !== parentId) {
        const siblingCount = projectTasks.filter(t => (t.parentId ?? null) === parentId && t.id !== task.id).length;
        onUpdateTask({ ...task, parentId, sortOrder: (siblingCount + 1) * 10 });
      }
    }

    setKanbanDragId(null);
  };

  // Build a sortOrder rewrite for an entire sibling group, optionally moving
  // `movedId` into that group near `anchorId`.
  const buildReorderUpdates = (
    movedId: string,
    newParentId: string | null,
    anchorId: string | null,
    insertBefore: boolean
  ): { id: string; sortOrder: number; parentId?: string | null }[] => {
    const group = projectTasks
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

  const kanbanColumns = useMemo<KanbanColumn[]>(() => {
    const sortedCards = [...kanbanTasks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    if (kanbanGroupMode === 'status') {
      return STATUS_OPTIONS.map(status => ({
        id: status.value,
        label: status.label,
        tasks: sortedCards.filter(t => t.status === status.value)
      }));
    }

    if (kanbanGroupMode === 'parent') {
      const parents = projectTasks
        .filter(t => isParent(t.id))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      return [
        { id: '__top', label: 'Top level', tasks: sortedCards.filter(t => !t.parentId) },
        ...parents.map(parent => ({
          id: parent.id,
          label: parent.name,
          tasks: sortedCards.filter(t => t.parentId === parent.id)
        }))
      ];
    }

    return [
      { id: '__unassigned', label: 'Unassigned', tasks: sortedCards.filter(t => !t.assignedConsultantId) },
      ...consultants.map(consultant => ({
        id: consultant.id,
        label: consultant.name,
        tasks: sortedCards.filter(t => t.assignedConsultantId === consultant.id)
      }))
    ];
  }, [kanbanTasks, kanbanGroupMode, projectTasks, consultants, isParent]);

  // ---- Render helpers -------------------------------------------------------
  const renderDependencyTree = (
    parentId: string | null,
    depth: number,
    parentNumber: string,
    editingId: string | null,
    selected: string[],
    toggle: (id: string) => void
  ): React.ReactNode[] => {
    const levelTasks = projectTasks.filter(t => (t.parentId ?? null) === parentId);
    if (levelTasks.length === 0) return [];
    return levelTasks.map((task, index) => {
      if (editingId && task.id === editingId) return null;
      const taskNumber = parentNumber ? `${parentNumber}.${index + 1}` : `${index + 1}`;
      const isTaskParent = isParent(task.id);
      // A task's own ancestor can't be its predecessor: the parent's schedule is
      // derived from its children, so the dependency is circular through the
      // hierarchy (and used to crash the scheduler). Shown but not selectable.
      const isAncestorOfEditing = !!editingId && isDescendant(task.id, editingId);
      return (
        <div key={task.id} style={{ display: 'flex', flexDirection: 'column' }}>
          <label className="tv2-dep-row" style={{ paddingLeft: `${depth * 1.25}rem`, ...(isAncestorOfEditing ? { opacity: 0.5 } : {}) }}
            title={isAncestorOfEditing ? 'A task cannot depend on its own parent task' : undefined}>
            <input type="checkbox" className="win-checkbox"
              checked={selected.includes(task.id)}
              disabled={isAncestorOfEditing}
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
      const owner = (task.taskOwner || 'Pinnacle') as TaskOwner;
      const isCustomerOwned = owner === 'Customer';
      const durationDerived = task.durationDays === 0 && !!task.dueDate;

      // Three drop targets around each row.
      const isDropBefore = dropTarget?.type === 'before' && dropTarget.id === task.id;
      const isDropAfter = dropTarget?.type === 'after' && dropTarget.id === task.id;
      const isDropInto = dropTarget?.type === 'into' && dropTarget.id === task.id;
      const isDragging = dragId === task.id;
      const quickAddHere = quickAdd?.anchorId === task.id ? quickAdd.placement : null;
      // Below an expanded parent the gap visually sits above its first child,
      // so "+" there adds a sub-task at the top rather than a sibling after
      // the whole subtree.
      const belowPlacement: QuickAddPlacement = taskIsParent && isExpanded ? 'firstChild' : 'after';

      if (quickAddHere === 'before') rows.push(renderQuickAddRow(depth));
      rows.push(
        <div key={task.id} className="tv2-row-wrap">
          {/* before drop indicator */}
          <div
            className={`tv2-drop-zone ${isDropBefore ? 'tv2-drop-active tv2-drop-reorder' : ''}`}
            onDragOver={(e) => { if (dragId && dragId !== task.id && !isDescendant(task.id, dragId)) { e.preventDefault(); setDropTarget({ type: 'before', id: task.id }); } }}
            onDrop={(e) => { e.preventDefault(); applyDrop(); }}
          >
            {isDropBefore && <span className="tv2-drop-label">Drop here to reorder</span>}
          </div>
          <div
            className={`tv2-row ${isSelected ? 'tv2-row-selected' : ''} ${isDragging ? 'tv2-row-dragging' : ''} ${isDropInto ? 'tv2-row-dropinto' : ''} tv2-status-${task.status}`}
            draggable={canEditThisTask(task)}
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
            style={{ '--tv2-depth': depth, gridTemplateColumns } as React.CSSProperties}
          >
            {canQuickAdd && !dragId && (
              <>
                <button type="button" className="tv2-qa-btn tv2-qa-top"
                  title="Add task above" aria-label={`Add task above ${task.name}`}
                  draggable={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); startQuickAdd(task, 'before'); }}
                >
                  <Plus size={11} strokeWidth={3} />
                </button>
                <button type="button" className="tv2-qa-btn tv2-qa-bottom"
                  title={belowPlacement === 'firstChild' ? 'Add sub-task at the top' : 'Add task below'}
                  aria-label={belowPlacement === 'firstChild' ? `Add sub-task under ${task.name}` : `Add task below ${task.name}`}
                  draggable={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); startQuickAdd(task, belowPlacement); }}
                >
                  <Plus size={11} strokeWidth={3} />
                </button>
              </>
            )}
            {visibleColumns.map(colId => {
              switch (colId) {
                case 'name':
                  return (
                    <div key="name" className="tv2-cell tv2-cell-name" onClick={() => setModalTaskId(task.id)}>
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
                        {canEditThisTask(task) && (
                          <span className="tv2-grip" title="Drag to reorder or nest"><GripVertical size={14} /></span>
                        )}
                        {canEditThisTask(task) && (
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
                          {!taskIsParent && (
                            <span className={`tv2-chip ${isCustomerOwned ? 'tv2-chip-owner-customer' : 'tv2-chip-owner'}`} title="Task owner">
                              {isCustomerOwned ? 'Customer' : owner === 'Pinnacle/Customer' ? 'Pinn/Cust' : 'Pinnacle'}
                            </span>
                          )}
                          {durationDerived && <span className="tv2-chip tv2-chip-dep" title="Duration derived from due date">Due→</span>}
                          {isOverdue && <span className="tv2-chip tv2-chip-overdue" title={`Was due ${task.dueDate}`}><AlertTriangle size={11} /> Overdue</span>}
                          {blockedBy.length > 0 && <span className="tv2-chip tv2-chip-dep" title={`Depends on: ${blockedBy.map(b => b.name).join(', ')}`}><Link2 size={11} /> {blockedBy.length}</span>}
                          {blockingCount > 0 && <span className="tv2-chip tv2-chip-blocks" title={`Blocks ${blockingCount} other task(s)`}>⛓ {blockingCount}</span>}
                        </span>
                      </div>
                    </div>
                  );
                case 'assignee':
                  return (
                    <div key="assignee" className="tv2-cell tv2-cell-assignee" data-label="Assignee">
                      {inlineEdit?.id === task.id && inlineEdit.field === 'assignee' ? (
                        <div className="tv2-inline-edit" onClick={(e) => e.stopPropagation()}>
                          <WinComboBox
                            value={inlineEdit.value}
                            menuPosition="top"
                            onChange={(val) => commitInlineSelect(task.id, 'assignee', val)}
                            options={[{ label: 'Unassigned', value: '' }, ...consultants.map(c => ({ label: c.name, value: c.id }))]}
                          />
                        </div>
                      ) : (
                        <button type="button" className="tv2-cell-btn"
                          disabled={!canEditThisTask(task)}
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
                  );
                case 'duration':
                  return (
                    <div key="duration" className="tv2-cell tv2-cell-duration" data-label="Duration">
                      {inlineEdit?.id === task.id && inlineEdit.field === 'duration' ? (
                        <div className="tv2-inline-edit" onClick={(e) => e.stopPropagation()}>
                          <input type="number" step="0.5" min="0" autoFocus className="form-input tv2-duration-input"
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                            onBlur={commitInline}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitInline(); if (e.key === 'Escape') setInlineEdit(null); }}
                          />
                        </div>
                      ) : (
                        <button type="button" className="tv2-cell-btn tv2-cell-btn-center"
                          disabled={!canEditThisTask(task) || taskIsParent}
                          title={taskIsParent ? 'Parent duration is computed from children' : 'Edit duration (0 = derive from due date)'}
                          onClick={(e) => { e.stopPropagation(); if (!taskIsParent) setInlineEdit({ id: task.id, field: 'duration', value: String(task.durationDays) }); }}
                        >
                          <Clock size={12} /> {durationDerived ? 'Due→' : `${task.durationDays}d`}
                        </button>
                      )}
                    </div>
                  );
                case 'start':
                  return (
                    <div key="start" className="tv2-cell tv2-cell-start" data-label="Start">
                      {inlineEdit?.id === task.id && inlineEdit.field === 'start' ? (
                        <div className="tv2-inline-edit tv2-start-edit" onClick={(e) => e.stopPropagation()}>
                          <WinDatePicker
                            defaultOpen
                            value={inlineEdit.value}
                            onChange={(v) => commitInlineStart(task.id, v)}
                            onClose={() => setInlineEdit(null)}
                            onClear={task.customStartDate ? () => commitInlineStart(task.id, null) : undefined}
                            clearLabel="Clear (auto-schedule)"
                          />
                        </div>
                      ) : (
                        <button type="button" className="tv2-cell-btn tv2-cell-btn-center"
                          disabled={!canEditThisTask(task)}
                          title={task.plannedStartDate
                            ? `${formatDateFriendly(task.plannedStartDate)}${task.customStartDate ? ' · fixed start' : ''} — click to change`
                            : 'Set start date'}
                          onClick={(e) => { e.stopPropagation(); setInlineEdit({ id: task.id, field: 'start', value: task.customStartDate || task.plannedStartDate || '' }); }}
                        >
                          {task.plannedStartDate ? formatDateShort(task.plannedStartDate) : <span className="tv2-dash">—</span>}
                        </button>
                      )}
                    </div>
                  );
                case 'due':
                  return (
                    <div key="due" className="tv2-cell tv2-cell-due" data-label="Due">
                      <span className={`tv2-readonly ${isOverdue ? 'tv2-readonly-overdue' : ''}`} title={task.dueDate ? `${isOverdue ? 'Overdue · ' : ''}${formatDateFriendly(task.dueDate)}` : undefined}>
                        {task.dueDate ? formatDateShort(task.dueDate) : <span className="tv2-dash">—</span>}
                      </span>
                    </div>
                  );
                case 'progress':
                  return (
                    <div key="progress" className={`tv2-cell tv2-cell-progress ${taskIsParent ? '' : 'tv2-cell-progress-empty'}`} data-label="Progress">
                      {taskIsParent ? (
                        <span className="tv2-progress-pct" style={{ color: accent }} title={`${prog}% of sub-tasks completed`}>{prog}%</span>
                      ) : (
                        <span className="tv2-progress-na">—</span>
                      )}
                    </div>
                  );
                case 'status':
                  return (
                    <div key="status" className="tv2-cell tv2-cell-status" data-label="Status">
                      {inlineEdit?.id === task.id && inlineEdit.field === 'status' ? (
                        <div className="tv2-inline-edit" onClick={(e) => e.stopPropagation()}>
                          <WinComboBox
                            value={inlineEdit.value}
                            menuPosition="top"
                            onChange={(val) => commitInlineSelect(task.id, 'status', val)}
                            options={STATUS_OPTIONS}
                          />
                        </div>
                      ) : (
                        <button type="button" className={statusBadgeClass(task.status)}
                          disabled={!canEditThisTask(task)}
                          onClick={(e) => { e.stopPropagation(); setInlineEdit({ id: task.id, field: 'status', value: task.status }); }}
                        >
                          {statusLabel(task.status)}
                        </button>
                      )}
                    </div>
                  );
                default:
                  return null;
              }
            })}
          </div>
          {/* after drop indicator */}
          <div
            className={`tv2-drop-zone ${isDropAfter ? 'tv2-drop-active tv2-drop-reorder' : ''}`}
            onDragOver={(e) => { if (dragId && dragId !== task.id && !isDescendant(task.id, dragId)) { e.preventDefault(); setDropTarget({ type: 'after', id: task.id }); } }}
            onDrop={(e) => { e.preventDefault(); applyDrop(); }}
          >
            {isDropAfter && <span className="tv2-drop-label">Drop here to reorder</span>}
          </div>

          {taskIsParent && isExpanded && (
            <div className="tv2-children">
              {quickAddHere === 'firstChild' && renderQuickAddRow(depth + 1)}
              {renderTree(task.id, depth + 1, taskNumber, [...depthIsLast, isLastSibling])}
            </div>
          )}
        </div>
      );
      if (quickAddHere === 'after') rows.push(renderQuickAddRow(depth));
    });
    return rows;
  };

  const canQuickAdd = canCreateTask(activeUser, project);

  /** The inline "type a name" row shown in place of a hover quick-add. */
  function renderQuickAddRow(depth: number) {
    return (
      <div key="__quickadd" className="tv2-quickadd-row">
        <div className="tv2-quickadd-inner" style={{ paddingLeft: `calc(1rem + ${depth * 20}px)` }}>
          <Plus size={14} className="tv2-quickadd-icon" />
          <input
            autoFocus
            className="form-input tv2-quickadd-input"
            placeholder="New task name — Enter to save, Esc to cancel"
            value={quickAdd?.name ?? ''}
            onChange={(e) => setQuickAdd(q => q ? { ...q, name: e.target.value } : q)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitQuickAdd(); }
              if (e.key === 'Escape') { e.stopPropagation(); setQuickAdd(null); }
            }}
            // Clicking away with a name typed still saves it; empty just closes.
            onBlur={commitQuickAdd}
          />
        </div>
      </div>
    );
  }

  const renderKanbanCard = (task: Task) => {
    const assigned = consultants.find(c => c.id === task.assignedConsultantId);
    const parent = task.parentId ? projectTasks.find(t => t.id === task.parentId) : null;
    const durationDerived = task.durationDays === 0 && !!task.dueDate;
    const taskIsParent = isParent(task.id);
    const prog = taskIsParent ? progressFor(task) : 0;
    const stats = taskIsParent ? leafStats(task.id) : null;
    const isOverdue = isTaskOverdue(task);

    return (
      <div
        key={task.id}
        className={`tv2-kanban-card tv2-status-${task.status}`}
        draggable={canEditThisTask(task)}
        onDragStart={(e) => { setKanbanDragId(task.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => setKanbanDragId(null)}
        onClick={() => setModalTaskId(task.id)}
      >
        <div className="tv2-kanban-card-top">
          <span className={`tv2-kanban-title ${taskIsParent ? 'tv2-kanban-title-parent' : ''}`}>{task.name}</span>
          <span className={`${statusBadgeClass(task.status)} tv2-badge-static`}>{statusLabel(task.status)}</span>
        </div>
        <div className="tv2-kanban-meta">
          {parent && <span title="Parent task"><CornerDownRight size={12} /> {parent.name}</span>}
          <span><Clock size={12} /> {durationDerived ? 'Due derived' : `${task.durationDays}d`}</span>
          <span><Calendar size={12} /> {task.plannedStartDate ? formatDateFriendly(task.plannedStartDate) : 'No start'}</span>
        </div>
        {taskIsParent && stats && (
          <div className="tv2-kanban-progress" title={`${stats.completed} of ${stats.total} sub-task${stats.total === 1 ? '' : 's'} completed`}>
            <div className="tv2-progress-mini">
              <div className="tv2-progress-fill" style={{ width: `${prog}%`, backgroundColor: accent }} />
            </div>
            <span className="tv2-progress-num">{stats.completed}/{stats.total}</span>
          </div>
        )}
        <div className="tv2-kanban-footer">
          {assigned ? (
            <span className="tv2-kanban-assignee">
              <span className="tv2-avatar" style={{ backgroundColor: assigned.avatarColor || '#1e3449' }}>
                {initials(assigned.name)}
              </span>
              {assigned.name}
            </span>
          ) : (
            <span className="tv2-unassigned">Unassigned</span>
          )}
          <span className="tv2-tags">
            {task.pinkNumber && <span className="tv2-chip tv2-chip-pink">Pink #{task.pinkNumber}</span>}
            {isOverdue && <span className="tv2-chip tv2-chip-overdue"><AlertTriangle size={11} /> Overdue</span>}
          </span>
        </div>
      </div>
    );
  };

  const modalTask = modalTaskId && modalTaskId !== '__new__' ? (projectTasks.find(t => t.id === modalTaskId) ?? null) : null;
  const hasActiveFilters = hideCompleted || ownerFilter !== 'all' || assigneeFilter !== 'all' || statusFilter !== 'all' || onlyMine;

  // Active modal mode: editing an existing task, or creating a new one.
  const modalOpen = !!modalTaskId || createParentId !== null;

  return (
    <div className="tv2-root" style={{ '--tv2-font-scale': fontScale } as React.CSSProperties}>
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
          <div className="seg" role="group" aria-label="Task view">
            <button
              type="button"
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              <List size={14} /> List
            </button>
            <button
              type="button"
              className={viewMode === 'kanban' ? 'active' : ''}
              onClick={() => setViewMode('kanban')}
            >
              <Columns3 size={14} /> Kanban
            </button>
          </div>
        {/* View controls: saved views, columns, font zoom */}
          <div className="tv2-view-group">
                        <WinComboBox className="tv2-view-picker" value={activeViewId}
              onChange={(id) => { const v = views.find(x => x.id === id); if (v) applyView(v); }}
              options={views.map(v => ({ label: v.name + (v.isBuiltIn ? '' : ''), value: v.id }))}
            />
            {isDirty && (
              <button type="button" className="btn btn-secondary tv2-view-btn-save" onClick={saveView} title="Update this view">
                <Save size={14} /> Save
              </button>
            )}
            <button type="button" className="btn btn-ghost tv2-view-btn-saveas" onClick={() => { setSaveAsName(activeView?.name ? `${activeView.name} copy` : 'New View'); setShowSaveAs(true); }} title="Save as new view">
              <Copy size={14} />
            </button>
            {!activeView?.isBuiltIn && views.length > 1 && (
              <button type="button" className="btn btn-ghost tv2-view-btn-del" onClick={() => activeView && deleteView(activeView)} title="Delete this view">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Columns popover (list view only) */}
          {viewMode === 'list' && (
            <div className="tv2-view-group tv2-columns-group">
              <button type="button" ref={columnsBtnRef} className={`btn btn-ghost tv2-icon-btn ${showColumnsPanel ? 'tv2-icon-btn-active' : ''}`}
                onClick={() => setShowColumnsPanel(v => !v)} title="Show / hide columns">
                <Columns3 size={15} /> Columns
              </button>
              {showColumnsPanel && (
                <div ref={columnsPanelRef} className="tv2-columns-panel" role="menu">
                  <div className="tv2-columns-panel-head">Columns</div>
                  {COLUMN_DEFS.map(col => (
                    <label key={col.id} className={`tv2-columns-item ${!col.toggleable ? 'tv2-columns-item-locked' : ''}`}>
                      <input type="checkbox" className="win-checkbox"
                        checked={visibleColumns.includes(col.id)}
                        disabled={!col.toggleable}
                        onChange={() => toggleColumn(col.id)}
                      />
                      <span>{col.label}</span>
                      {!col.toggleable && <span className="tv2-columns-lock" title="Always shown">·</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Font zoom stepper */}
          <div className="tv2-view-group tv2-font-group">
            <button type="button" className="btn btn-ghost tv2-icon-btn" onClick={() => adjustFont(-0.1)}
              disabled={fontScale <= 0.8} title="Decrease font size">
              <Minus size={15} />
            </button>
            <button type="button" className="tv2-font-pct" onClick={() => setFontScale(1)} title="Reset to 100%">
              {Math.round(fontScale * 100)}%
            </button>
            <button type="button" className="btn btn-ghost tv2-icon-btn" onClick={() => adjustFont(0.1)}
              disabled={fontScale >= 1.5} title="Increase font size">
              <Plus size={15} />
            </button>
          </div>
          <span className="tv2-spacer" />
          {canCreateTask(activeUser, project) && (
            <button className="btn btn-secondary" onClick={() => setShowImport(true)}
              title="Import tasks from an Excel (.xlsx) or CSV file">
              <Upload size={14} /> Import
            </button>
          )}
          {canCreateTask(activeUser, project) && (
            <button className="btn btn-primary" onClick={() => openCreate(null)}>
              <Plus size={14} /> Add task
            </button>
          )}
        </div>
        <div className="tv2-filters">
          <label className="tv2-filter-check">
            <input type="checkbox" className="win-checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
            <span>Hide completed</span>
          </label>
          <span className="tv2-filter-divider" />
          <WinComboBox className="tv2-filter-combo" value={ownerFilter}
            onChange={(v) => setOwnerFilter(v as OwnerFilter)}
            options={[{ label: 'All owners', value: 'all' }, { label: 'Pinnacle', value: 'pinnacle' }, { label: 'Customer', value: 'customer' }, { label: 'Pinnacle/Customer', value: 'shared' }]}
          />
          <WinComboBox className="tv2-filter-combo" value={assigneeFilter}
            onChange={setAssigneeFilter}
            options={[{ label: 'All assignees', value: 'all' }, { label: 'Unassigned', value: 'unassigned' }, ...consultants.map(c => ({ label: c.name, value: c.id }))]}
          />
          <WinComboBox className="tv2-filter-combo" value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[{ label: 'All statuses', value: 'all' }, ...STATUS_OPTIONS]}
          />
          {viewMode === 'kanban' && (
            <>
              <span className="tv2-filter-divider" />
              <WinComboBox className="tv2-filter-combo" value={kanbanGroupMode}
                onChange={(v) => setKanbanGroupMode(v as KanbanGroupMode)}
                options={[
                  { label: 'Kanban by status', value: 'status' },
                  { label: 'Kanban by parent task', value: 'parent' },
                  { label: 'Kanban by assignee', value: 'assignee' }
                ]}
              />
            </>
          )}
          {hasActiveFilters && (
            <button className="btn btn-ghost tv2-clear-filters" onClick={() => { setHideCompleted(false); setOwnerFilter('all'); setAssigneeFilter('all'); setStatusFilter('all'); setOnlyMine(false); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="tv2-table card">
          {projectTasks.length === 0 ? (
            <div className="tv2-empty">
              <p>No tasks created yet for this project. Click <b>Add Task</b> to build your implementation checklist.</p>
            </div>
          ) : (
            <div className="tv2-table-scroll">
              <div className="tv2-head" style={{ gridTemplateColumns }}>
                {visibleColumns.map(id => (
                  <div key={id} className={`tv2-cell tv2-cell-${id}`}>
                    {id === 'name' ? (
                      <>
                        <span className="tv2-head-check">
                          {canEditAnyTask(activeUser, project) && (
                            <input type="checkbox" className="win-checkbox"
                              checked={leafTasks.length > 0 && selectedIds.length === leafTasks.length}
                              onChange={(e) => setSelectedIds(e.target.checked ? leafTasks.map(t => t.id) : [])}
                            />
                          )}
                        </span>
                        {COLUMN_DEFS.find(c => c.id === id)?.label}
                      </>
                    ) : (
                      COLUMN_DEFS.find(c => c.id === id)?.label
                    )}
                  </div>
                ))}
              </div>
              {renderTree(null, 0, '', [])}
            </div>
          )}
        </div>
      ) : (
        <div className="tv2-kanban card">
          {projectTasks.length === 0 ? (
            <div className="tv2-empty">
              <p>No tasks created yet for this project. Click <b>Add Task</b> to build your implementation checklist.</p>
            </div>
          ) : kanbanTasks.length === 0 ? (
            <div className="tv2-empty">
              <p>No tasks match the current filters.</p>
            </div>
          ) : (
            <div className="tv2-kanban-scroll">
              {kanbanColumns.map(column => (
                <section
                  key={column.id}
                  className={`tv2-kanban-column ${kanbanDragId ? 'tv2-kanban-column-droppable' : ''}`}
                  onDragOver={(e) => { if (kanbanDragId && canEditAnyTask(activeUser, project)) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); applyKanbanDrop(column.id); }}
                >
                  <header className="tv2-kanban-column-head">
                    <span className="tv2-kanban-column-title">{column.label}</span>
                    <span className="tv2-kanban-count">{column.tasks.length}</span>
                  </header>
                  <div className="tv2-kanban-cards">
                    {column.tasks.length > 0 ? column.tasks.map(renderKanbanCard) : (
                      <div className="tv2-kanban-empty">No tasks</div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating bulk-action bar — managers/leads only (bulk operations). */}
      {selectedIds.length > 0 && canEditAnyTask(activeUser, project) && (
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
            <span className="tv2-bulkbar-label">Owner:</span>
            <WinComboBox className="tv2-bulkbar-combo" value="" menuPosition="top"
              onChange={(v) => { if (v) { onBulkUpdateTasks(selectedIds, { taskOwner: v as TaskOwner }); setSelectedIds([]); } }}
              options={[{ label: 'Change…', value: '' }, ...OWNER_OPTIONS]}
            />
          </div>
          <div className="tv2-bulkbar-group">
            <span className="tv2-bulkbar-label">Assignee:</span>
            <WinComboBox className="tv2-bulkbar-combo" value="" menuPosition="top"
              onChange={(v) => { if (v) { onBulkUpdateTasks(selectedIds, { assignedConsultantId: v === 'unassigned' ? null : v }); setSelectedIds([]); } }}
              options={[{ label: 'Change…', value: '' }, { label: 'Unassigned', value: 'unassigned' }, ...consultants.map(c => ({ label: c.name, value: c.id }))]}
            />
          </div>
          {canEditAnyTask(activeUser, project) && (
            <button className="btn btn-danger tv2-bulkbar-delete"
              onClick={() => { if (confirm(`Delete ${selectedIds.length} selected task(s)? Subtasks will also be deleted.`)) { onBulkDeleteTasks(selectedIds); setSelectedIds([]); } }}
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      )}

      {/* Floating centered modal (edit / create) */}
      {modalOpen && (
        <TaskModal
          // Remount when the modal's identity changes (edit ↔ create, or a new
          // preset parent). Without this, "Add Sub Task" from an open edit modal
          // kept the previous form state and ignored presetParentId.
          key={modalTaskId ?? `create-${createParentId ?? 'root'}`}
          mode={createParentId !== null || modalTaskId === '__new__' ? 'create' : 'edit'}
          task={modalTask}
          presetParentId={createParentId}
          project={project}
          tasks={projectTasks}
          consultants={consultants}
          accent={accent}
          canEdit={modalTask ? canEditThisTask(modalTask) : canCreateTask(activeUser, project)}
          isParent={isParent}
          isDescendant={isDescendant}
          progressFor={progressFor}
          onClose={() => { setModalTaskId(null); setCreateParentId(null); setPendingInsert(null); }}
          onSave={(t) => {
            // Opened from a hover "+": insert at that spot, unless the user
            // changed the parent in the form (then fall back to appending).
            const anchor = pendingInsert ? projectTasks.find(x => x.id === pendingInsert.anchorId) : null;
            if (pendingInsert && anchor && (t.parentId ?? null) === quickAddParent(anchor, pendingInsert.placement)) {
              insertAt(pendingInsert.anchorId, pendingInsert.placement, t);
            } else {
              onCreateTask(t);
            }
            setPendingInsert(null);
            setModalTaskId(null);
            setCreateParentId(null);
            onAddToast('Task created successfully!', 'success');
            // Ensure a newly created subtask's parent is expanded.
            if (t.parentId) setExpanded(prev => ({ ...prev, [t.parentId as string]: true }));
          }}
          onUpdate={(t) => { onUpdateTask(t); /* keep modal open for further edits */ }}
          onDelete={(id) => { onDeleteTask(id); setModalTaskId(null); setCreateParentId(null); onAddToast('Task deleted.', 'warning'); }}
          onAddSubTask={(parentId) => {
            // Close this edit modal and open the create modal preset to the parent.
            setModalTaskId(null);
            setCreateParentId(parentId);
            setExpanded(prev => ({ ...prev, [parentId]: true }));
          }}
          renderDependencyTree={renderDependencyTree}
        />
      )}

      {showImport && (
        <TaskImportModal
          project={project}
          existingTasks={projectTasks}
          consultants={consultants}
          accent={accent}
          onClose={() => setShowImport(false)}
          onImport={(created, updated) => {
            onInsertTasks(created, [], updated);
            setShowImport(false);
            const n = (k: number) => `${k} task${k === 1 ? '' : 's'}`;
            const parts = [created.length ? `added ${n(created.length)}` : '', updated.length ? `updated ${n(updated.length)}` : ''].filter(Boolean);
            const msg = parts.join(' and ');
            onAddToast(`${msg.charAt(0).toUpperCase()}${msg.slice(1)}.`, 'success');
          }}
        />
      )}

      {/* Save as new view — inline prompt */}
      {showSaveAs && (
        <div className="tv2-saveas-overlay" onClick={() => setShowSaveAs(false)}>
          <div className="tv2-saveas" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="tv2-saveas-head">
              <h4 className="tv2-saveas-title">Save as new view</h4>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShowSaveAs(false)}><X size={16} /></button>
            </div>
            <input className="form-input tv2-saveas-input" autoFocus
              value={saveAsName}
              placeholder="View name (e.g. My Open Tasks)"
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveAsNewView(); if (e.key === 'Escape') setShowSaveAs(false); }}
            />
            <div className="tv2-saveas-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowSaveAs(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!saveAsName.trim()} onClick={saveAsNewView}>
                <Plus size={14} /> Create view
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Floating centered modal
// =============================================================================

interface TaskModalProps {
  mode: 'create' | 'edit';
  task: Task | null;
  presetParentId: string | null;
  project: Project;
  tasks: Task[];
  consultants: Consultant[];
  accent: string;
  canEdit: boolean;
  isParent: (id: string) => boolean;
  /** Is `maybeDescId` anywhere in the subtree under `rootId`? (cycle guard) */
  isDescendant: (rootId: string, maybeDescId: string) => boolean;
  progressFor: (t: Task) => number;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id'>) => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
  onAddSubTask: (parentId: string) => void;
  renderDependencyTree: (
    parentId: string | null, depth: number, parentNumber: string,
    editingId: string | null, selected: string[], toggle: (id: string) => void
  ) => React.ReactNode[];
}

function TaskModal(props: TaskModalProps) {
  const { mode, task, presetParentId, project, tasks, consultants, accent, canEdit, isParent, isDescendant, progressFor, onClose, onSave, onUpdate, onDelete, onAddSubTask, renderDependencyTree } = props;
  const creating = mode === 'create';

  const [form, setForm] = useState(() => buildForm(task, creating, presetParentId));
  // For edit mode, auto-persist changes (the parent re-schedules). For create
  // mode we wait for the explicit Save button.
  // SECURITY: never persist when canEdit is false (e.g. read-only / customer
  // viewing a Pinnacle-owned task). Previously update() wrote on every keystroke
  // regardless of canEdit, letting users bypass the edit gate.
  //
  // Persistence is debounced: each write triggers a full project reschedule and
  // sequential DB updates, and unserialized per-keystroke saves could land out
  // of order. The pending form is flushed on unmount (modal close).
  const persistTimer = useRef<number | null>(null);
  const pendingForm = useRef<DrawerForm | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const taskRef = useRef(task);
  useLayoutEffect(() => {
    onUpdateRef.current = onUpdate;
    taskRef.current = task;
  });

  const flushPending = () => {
    if (persistTimer.current !== null) { clearTimeout(persistTimer.current); persistTimer.current = null; }
    const cur = taskRef.current;
    if (pendingForm.current && cur) {
      onUpdateRef.current({ ...cur, ...toTaskPatch(pendingForm.current, cur) });
      pendingForm.current = null;
    }
  };
  useEffect(() => flushPending, []);

  const update = (patch: Partial<typeof form>) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      // Snap duration to half-days; auto-set progress on complete.
      if (patch.durationDays !== undefined) next.durationDays = snapHalf(patch.durationDays);
      if (patch.status === 'completed') next.progress = 100;
      if (!creating && task && canEdit) {
        pendingForm.current = next;
        if (persistTimer.current !== null) clearTimeout(persistTimer.current);
        persistTimer.current = window.setTimeout(flushPending, 400);
      }
      return next;
    });
  };

  const toggleDep = (id: string) => {
    if (readOnly) return;
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
  const durationDerived = form.durationDays === 0 && !!form.dueDate;
  // Read-only when viewing an existing task the user cannot edit (e.g. a customer
  // viewing a Pinnacle-owned task). Disables every field so the modal doesn't
  // give the impression of being editable.
  const readOnly = !creating && !canEdit;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="tv2-modal" role="dialog" aria-modal="true">
        <form onSubmit={handleSubmit} className="tv2-modal-form">
          <header className="tv2-modal-header" style={{ borderBottomColor: accent }}>
            <div>
              <span className="tv2-modal-eyebrow">{creating ? 'New task' : readOnly ? 'View task' : 'Edit task'}</span>
              <h3 className="tv2-modal-title">{creating ? (presetParentId ? 'Add Sub Task' : 'Add Implementation Task') : form.name || 'Task'}</h3>
            </div>
            <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}><X size={18} /></button>
          </header>

          <div className="tv2-modal-body">
            <div className="tv2-field">
              <label className="form-label">Task name</label>
              <input className="form-input" value={form.name}
                placeholder="e.g. Chart of Accounts Setup"
                disabled={readOnly}
                onChange={(e) => update({ name: e.target.value })} required />
            </div>

            <div className="tv2-field-row">
              <div className="tv2-field">
                <label className="form-label">Status</label>
                <WinComboBox value={form.status} disabled={readOnly} onChange={(v) => update({ status: v as Task['status'] })} options={STATUS_OPTIONS} />
              </div>
              <div className="tv2-field">
                <label className="form-label">Assignee</label>
                <WinComboBox value={form.assignedConsultantId}
                  disabled={readOnly}
                  onChange={(v) => update({ assignedConsultantId: v })}
                  options={[{ label: 'Unassigned', value: '' }, ...consultants.map(c => ({ label: c.name, value: c.id }))]} />
              </div>
            </div>

            <div className="tv2-field-row">
              <div className="tv2-field">
                <label className="form-label">Start date</label>
                <WinDatePicker value={form.customStartDate} disabled={readOnly} onChange={(v) => update({ customStartDate: v })} />
              </div>
              <div className="tv2-field">
                <label className="form-label">
                  Duration (days)
                  {durationDerived && <span className="tv2-hint"> · derived from due date</span>}
                  {!durationDerived && form.durationDays === 0 && <span className="tv2-hint"> · enter 0 to use due date</span>}
                </label>
                <input type="number" step="0.5" min="0" className="form-input" value={form.durationDays}
                  disabled={readOnly || isEditingParent}
                  title={isEditingParent ? 'Parent duration is computed from children' : undefined}
                  onChange={(e) => update({ durationDays: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            {form.durationDays === 0.5 && (
              <div className="tv2-field-row">
                <div className="tv2-field">
                  <label className="form-label">
                    Half day
                    <span className="tv2-hint"> · time used in calendar exports</span>
                  </label>
                  <WinComboBox value={form.startPeriod} disabled={readOnly}
                    onChange={(v) => update({ startPeriod: v as 'AM' | 'PM' })}
                    options={[
                      { label: 'AM — 09:30 to 12:30', value: 'AM' },
                      { label: 'PM — 14:00 to 17:00', value: 'PM' },
                    ]} />
                </div>
                <div className="tv2-field" />
              </div>
            )}

            <div className="tv2-field-row">
              <div className="tv2-field">
                <label className="form-label">Due date</label>
                <WinDatePicker value={form.dueDate} disabled={readOnly} onChange={(v) => update({ dueDate: v })} />
              </div>
              <div className="tv2-field">
                <label className="form-label">Task owner</label>
                <WinComboBox value={form.taskOwner} disabled={readOnly} onChange={(v) => update({ taskOwner: v as TaskOwner })} options={OWNER_OPTIONS} />
              </div>
            </div>
            {form.taskOwner === 'Customer' && (
              <div className="tv2-owner-note">
                Customer-owned tasks are excluded from the project budget.
              </div>
            )}

            {/* Progress only applies to parent tasks (share of sub-tasks completed).
                Leaf tasks are tracked purely by their Status. */}
            {showRollupNote && (
              <div className="tv2-field">
                <label className="form-label">
                  Progress <span className="tv2-hint">(share of sub-tasks completed)</span>
                </label>
                <div className="tv2-slider-row">
                  <div className="tv2-progress-wide">
                    <div className="tv2-progress-fill" style={{ width: `${progressFor(task!)}%`, backgroundColor: accent }} />
                  </div>
                  <span className="tv2-slider-value">{progressFor(task!)}%</span>
                </div>
              </div>
            )}

            <div className="tv2-field-row">
              <div className="tv2-field">
                <label className="form-label">Parent task</label>
                <WinComboBox value={form.parentId}
                  disabled={readOnly}
                  onChange={(v) => update({ parentId: v })}
                  options={[
                    { label: 'None (top-level)', value: '' },
                    // Any task can be a parent except the task itself and its own
                    // descendants — nesting under a descendant creates a hierarchy
                    // cycle that used to crash the scheduler.
                    ...tasks
                      .filter(t => t.id !== task?.id && (!task || !isDescendant(task.id, t.id)))
                      .map(t => ({ label: t.name, value: t.id }))
                  ]} />
              </div>
              <div className="tv2-field">
                <label className="form-label">Pink number</label>
                <input className="form-input" value={form.pinkNumber} placeholder="e.g. PN-12345"
                  disabled={readOnly}
                  onChange={(e) => update({ pinkNumber: e.target.value })} />
              </div>
            </div>

            <div className="tv2-field">
              <label className="form-label">Dependencies</label>
              <div className="tv2-dep-list" style={readOnly ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
                {tasks.filter(t => t.id !== task?.id).length === 0
                  ? <span className="tv2-dep-empty">No other tasks available for dependency links.</span>
                  : renderDependencyTree(null, 0, '', task?.id ?? null, form.predecessorIds, toggleDep)}
              </div>
            </div>

            <div className="tv2-field">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" rows={3} value={form.description}
                placeholder="Provide execution steps or details…"
                disabled={readOnly}
                onChange={(e) => update({ description: e.target.value })} />
            </div>
          </div>

          <footer className="tv2-modal-footer">
            {!creating && task && canEdit && (
              <>
                <button type="button" className="btn btn-ghost tv2-modal-danger"
                  onClick={() => { if (confirm(`Delete "${task.name}"? Subtasks will also be deleted.`)) onDelete(task.id); }}>
                  <Trash2 size={14} /> Delete
                </button>
                <button type="button" className="btn btn-secondary tv2-modal-addsub"
                  onClick={() => onAddSubTask(task.id)}>
                  <CornerDownRight size={14} /> Add Sub Task
                </button>
              </>
            )}
            <div className="tv2-modal-spacer" />
            <button type="button" className="btn btn-secondary" onClick={onClose}>{creating ? 'Cancel' : 'Done'}</button>
            {creating && <button type="submit" className="btn btn-primary">Create task</button>}
          </footer>
        </form>
      </div>
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
  return Math.max(0, Math.round(n * 2) / 2);
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

/** Equality for two column lists (order-sensitive). */
function arrayEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Ensure a column list is valid: has at least `name`, deduped, registry-ordered. */
function sanitizeColumns(cols: TaskColumnId[]): TaskColumnId[] {
  const order = COLUMN_DEFS.map(c => c.id);
  const valid = Array.from(new Set(cols.filter(c => order.includes(c))));
  const result = order.filter(c => valid.includes(c));
  // `name` must always be present.
  if (!result.includes('name')) result.unshift('name');
  return result;
}

/** Load saved views for a (user, project) key from localStorage, seeding a default. */
function loadViews(key: string): TaskView[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as TaskView[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Guarantee a built-in default exists.
        if (!parsed.some(v => v.isBuiltIn)) parsed.unshift(makeDefaultView());
        return parsed;
      }
    }
  } catch { /* corrupt / missing — fall through to seed */ }
  return [makeDefaultView()];
}

function isTaskOverdue(task: Task): boolean {
  if (task.status === 'completed' || !task.dueDate) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate + 'T00:00:00');
  return due.getTime() < today.getTime();
}

interface DrawerForm {
  name: string;
  description: string;
  status: Task['status'];
  assignedConsultantId: string;
  durationDays: number;
  customStartDate: string;
  startPeriod: 'AM' | 'PM';
  dueDate: string;
  taskOwner: TaskOwner;
  parentId: string;
  pinkNumber: string;
  progress: number;
  predecessorIds: string[];
}

function buildForm(task: Task | null, creating: boolean, presetParentId: string | null = null): DrawerForm {
  if (creating || !task) {
    return {
      name: '', description: '', status: 'not_started', assignedConsultantId: '',
      durationDays: 0, customStartDate: '', startPeriod: 'AM', dueDate: '', taskOwner: 'Pinnacle',
      parentId: presetParentId || '', pinkNumber: '',
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
    startPeriod: task.startPeriod || 'AM',
    dueDate: task.dueDate || '',
    taskOwner: (task.taskOwner || 'Pinnacle') as TaskOwner,
    parentId: task.parentId || '',
    pinkNumber: task.pinkNumber || '',
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
    customStartDate: form.customStartDate || null,
    // Only meaningful for a half-day task. Cleared otherwise so a stale choice
    // can't resurface if the duration is later changed back to 0.5.
    startPeriod: form.durationDays === 0.5 ? form.startPeriod : null,
    dueDate: form.dueDate || null,
    taskOwner: form.taskOwner,
    progress: form.progress,
    ...(existing ? {
      sortOrder: existing.sortOrder
    } : {})
  };
}

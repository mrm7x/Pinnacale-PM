import { useState, useEffect } from 'react';
import type { FormEvent, FC } from 'react';
import type { Project, Task, Consultant, Customer, Communication } from '../types';
import {
  canEditProject, canCreateTask, canEditTask, canDeleteTask, canEditGantt,
  isCustomer as isCustomerUser, type ActiveUser
} from '../utils/permissions';
import {
  Plus, Calendar, Trash2, Edit2, ChevronDown, ChevronRight, ChevronUp,
  RefreshCw, User, X, Clock, FolderKanban, Pencil,
  Folder, Briefcase, Target, Rocket, Star, Layout, Check, Download,
  Pin, AlertTriangle, Lightbulb, Zap, Bell, CheckCircle, Search
} from 'lucide-react';
import { exportProjectToExcel } from '../utils/exportToExcel';
import { exportConsultantCalendar } from '../utils/exportToIcs';
import { billableDays, formatDate } from '../utils/scheduler';
import { safeExternalUrl } from '../utils/url';
import { WinComboBox } from './winui/WinComboBox';
import { WinDatePicker } from './winui/WinDatePicker';
import GanttChart from './GanttChart';
import EditProjectModal from './EditProjectModal';
import TaskListV2 from './TaskListV2';
import { formatDateFriendly, formatDateTimeFriendly } from './Dashboard';
import { resolvePhaseMeta, getProjectAccent } from '../utils/phases';

interface ProjectDetailsProps {
  projects: Project[];
  tasks: Task[];
  consultants: Consultant[];
  communications: Communication[];
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onCreateTask: (task: Omit<Task, 'id'>) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onBulkUpdateTasks: (ids: string[], updates: Partial<Task>) => void;
  onBulkDeleteTasks: (ids: string[]) => void;
  onUpdateTaskAndSubtasks: (task: Task, subtaskIds: string[], subtaskUpdates: Partial<Task>) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onDuplicateProject: (projectId: string, config: { name: string; clientName: string; startDate: string; copyAssignments: boolean }) => void;
  onSaveAsTemplate: (projectId: string, templateName: string) => void;
  activeUserId: string;
  activeUser: ActiveUser | null;
  customers: Customer[];
  onReorderTasks: (updates: { id: string; sortOrder: number; parentId?: string | null }[]) => void;
  onSaveCommunication: (comm: Communication) => Promise<void>;
  onDeleteCommunication: (id: string) => Promise<void>;
  setIsNewProjectModalOpen: (val: boolean) => void;
}


const PROJECT_ICONS = [
  { name: 'Folder', Icon: Folder },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Target', Icon: Target },
  { name: 'Rocket', Icon: Rocket },
  { name: 'Star', Icon: Star },
  { name: 'Layout', Icon: Layout }
];



function getRagStyle(rag?: string | null): { bg: string; text: string; label: string } {
  const r = (rag || 'green').toLowerCase();
  if (r === 'red') return { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444', label: 'Off Track' };
  if (r === 'amber') return { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', label: 'At Risk' };
  return { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', label: 'On Track' };
}

export default function ProjectDetails({
  projects,
  tasks,
  consultants,
  communications,
  selectedProjectId,
  onSelectProject,
  onUpdateProject,
  onDeleteProject,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  onBulkDeleteTasks,
  onUpdateTaskAndSubtasks,
  onAddToast,
  onDuplicateProject,
  onSaveAsTemplate,
  activeUserId,
  activeUser,
  customers,
  onReorderTasks,
  onSaveCommunication,
  onDeleteCommunication,
  setIsNewProjectModalOpen
}: ProjectDetailsProps) {
  // activeUser (unified, customer-aware) is the source of truth for RBAC.
  const userIsCustomer = isCustomerUser(activeUser);

  const [activeProjectTab, setActiveProjectTab] = useState<'overview' | 'tasks' | 'tasks-v2' | 'gantt' | 'rag' | 'communications'>('overview');
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isTemplateSaveModalOpen, setIsTemplateSaveModalOpen] = useState(false);

  const [duplicateForm, setDuplicateForm] = useState({ name: '', clientName: '', startDate: '', copyAssignments: true });
  const [templateForm, setTemplateForm] = useState({ name: '' });

  const [inlineEditingTaskId, setInlineEditingTaskId] = useState<string | null>(null);
  const [inlineEditField, setInlineEditField] = useState<'duration' | 'startDate' | 'assignee' | 'status' | 'pinkNumber' | null>(null);
  const [inlineEditForm, setInlineEditForm] = useState<Partial<Task>>({});
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({
    name: '',
    description: '',
    durationDays: 1.0,
    assignedConsultantId: '',
    parentId: '',
    predecessorIds: [] as string[],
    status: 'not_started' as Task['status'],
    pinkNumber: '',
    customStartDate: ''
  });

  // Bulk Edit States
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkDuration, setBulkDuration] = useState<string>('');

  // Clear selections when project changes
  useEffect(() => {
    setSelectedTaskIds([]);
    setBulkDuration('');
  }, [selectedProjectId]);

  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [editMode, _setEditMode] = useState(true);
  const [applyToSubtasks, setApplyToSubtasks] = useState(false);

  const [hideCompleted, _setHideCompleted] = useState(false);
  const [assigneeFilter, _setAssigneeFilter] = useState<string>('all');
  const [statusFilter, _setStatusFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarForm, setCalendarForm] = useState({ consultantId: '', fromDate: formatDate(new Date()) });
  const [ragRiskInputs, setRagRiskInputs] = useState<Record<string, string>>({});
  const [noteForm, setNoteForm] = useState({ subject: '', description: '', noteType: 'update' as Communication['noteType'] });
  const [noteSearch, setNoteSearch] = useState('');
  const [noteTypeFilter, setNoteTypeFilter] = useState<string>('all');
  const [notesPinFilter, setNotesPinFilter] = useState(false);

  const handleExport = async () => {
    if (!activeProject) return;
    setIsExporting(true);
    try {
      await exportProjectToExcel(activeProject, tasks, consultants);
      onAddToast('Export downloaded successfully.', 'success');
    } catch {
      onAddToast('Export failed. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCalendarExport = (e: React.FormEvent) => {
    e.preventDefault();
    const consultant = consultants.find(c => c.id === calendarForm.consultantId);
    if (!activeProject || !consultant) return;
    try {
      const count = exportConsultantCalendar(activeProject, tasks, consultant, calendarForm.fromDate);
      if (count === 0) {
        onAddToast('No scheduled tasks for that consultant on or after this date.', 'error');
        return;
      }
      setIsCalendarModalOpen(false);
      onAddToast(`${count} appointment${count === 1 ? '' : 's'} exported. In Outlook: File > Open & Export > Import an iCalendar (.ics) file > Import.`, 'success');
    } catch {
      onAddToast('Calendar export failed. Please try again.', 'error');
    }
  };

  // Active Project Data
  const activeProject = projects.find(p => p.id === selectedProjectId) || null;
  const projectTasks = tasks
    .filter(t => t.projectId === selectedProjectId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Calculate Budgets
  // Note: Parent tasks will be excluded from budget totals to avoid double counting.
  const isParent = (taskId: string) => tasks.some(t => t.parentId === taskId);
  const leafTasks = projectTasks.filter(t => !isParent(t.id));
  const totalAllocatedDuration = billableDays(leafTasks);
  const isOverBudget = activeProject ? totalAllocatedDuration > activeProject.budgetDays : false;

  const totalLeafTasks = leafTasks.length;
  const completedLeafTasks = leafTasks.filter(t => t.status === 'completed').length;
  const completedPercentage = totalLeafTasks > 0 ? Math.round((completedLeafTasks / totalLeafTasks) * 100) : 0;

  // Toggle tree expansion
  const toggleExpand = (taskId: string) => {
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };



  const handleDuplicateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activeProject || !duplicateForm.name || !duplicateForm.clientName) return;
    onDuplicateProject(activeProject.id, duplicateForm);
    setIsDuplicateModalOpen(false);
  };

  const handleSaveTemplateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activeProject || !templateForm.name) return;
    onSaveAsTemplate(activeProject.id, templateForm.name);
    setIsTemplateSaveModalOpen(false);
  };

  const handleAddSubtask = (parentTask: Task) => {
    setEditingTask(null);
    setTaskForm({
      name: '',
      description: '',
      durationDays: 1.0,
      assignedConsultantId: consultants[0]?.id || '',
      parentId: parentTask.id,
      predecessorIds: [],
      status: 'not_started',
      pinkNumber: '',
      customStartDate: ''
    });
    setIsTaskModalOpen(true);
  };

  // Open Task Modal for Edit
  const handleOpenEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskForm({
      name: task.name,
      description: task.description,
      durationDays: task.durationDays,
      assignedConsultantId: task.assignedConsultantId || '',
      parentId: task.parentId || '',
      predecessorIds: task.predecessorIds || [],
      status: task.status,
      pinkNumber: task.pinkNumber || '',
      customStartDate: task.customStartDate || ''
    });
    setIsTaskModalOpen(true);
  };

  // Handle Inline Save
  const handleInlineSave = (taskId: string) => {
    const task = projectTasks.find(t => t.id === taskId);
    if (!task) return;
    
    onUpdateTask({ ...task, ...inlineEditForm });
    setInlineEditingTaskId(null);
    setInlineEditField(null);
    setInlineEditForm({});
  };

  // Handle Task Submit
  const handleTaskSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !taskForm.name) return;

    const siblings = projectTasks.filter(t => t.parentId === (taskForm.parentId || null));
    const maxSortOrder = siblings.reduce((max, s) => Math.max(max, s.sortOrder ?? 0), 0);

    const taskData = {
      projectId: selectedProjectId,
      name: taskForm.name,
      description: taskForm.description,
      durationDays: taskForm.durationDays,
      assignedConsultantId: taskForm.assignedConsultantId || null,
      parentId: taskForm.parentId || null,
      predecessorIds: taskForm.predecessorIds,
      status: taskForm.status,
      pinkNumber: taskForm.pinkNumber,
      customStartDate: taskForm.customStartDate || null,
      sortOrder: editingTask ? editingTask.sortOrder : maxSortOrder + 10
    };

    if (editingTask) {
      if (applyToSubtasks) {
        const getSubtaskIds = (parentId: string): string[] => {
          const children = tasks.filter(t => t.parentId === parentId && t.projectId === selectedProjectId);
          let ids: string[] = [];
          for (const child of children) {
            ids.push(child.id);
            ids = ids.concat(getSubtaskIds(child.id));
          }
          return ids;
        };
        const subtaskIds = getSubtaskIds(editingTask.id);

        onUpdateTaskAndSubtasks(
          { ...editingTask, ...taskData },
          subtaskIds,
          { assignedConsultantId: taskData.assignedConsultantId, status: taskData.status }
        );
      } else {
        onUpdateTask({ ...editingTask, ...taskData });
        onAddToast('Task updated successfully!', 'success');
      }
      setApplyToSubtasks(false);
    } else {
      onCreateTask(taskData);
      onAddToast('Task created successfully!', 'success');
    }
    setIsTaskModalOpen(false);
  };

  // Bulk Action Handlers
  const handleBulkStatusChange = (status: Task['status']) => {
    if (status) {
      onBulkUpdateTasks(selectedTaskIds, { status });
      setSelectedTaskIds([]);
    }
  };

  const handleBulkAssigneeChange = (consultantId: string) => {
    if (consultantId) {
      const assignedConsultantId = consultantId === 'unassigned' ? null : consultantId;
      onBulkUpdateTasks(selectedTaskIds, { assignedConsultantId });
      setSelectedTaskIds([]);
    }
  };

  const handleBulkDurationApply = () => {
    const days = parseFloat(bulkDuration);
    if (!isNaN(days) && days >= 0) {
      onBulkUpdateTasks(selectedTaskIds, { durationDays: days });
      setSelectedTaskIds([]);
      setBulkDuration('');
    } else {
      onAddToast('Please enter a valid duration number (>= 0).', 'error');
    }
  };

  const handleBulkDeleteApply = () => {
    if (confirm(`Are you sure you want to delete the ${selectedTaskIds.length} selected tasks? Subtasks of selected tasks will also be deleted.`)) {
      onBulkDeleteTasks(selectedTaskIds);
      setSelectedTaskIds([]);
    }
  };

  const handleMoveTask = (taskId: string, direction: 'up' | 'down') => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const siblings = projectTasks.filter(t => t.parentId === task.parentId);
    const index = siblings.findIndex(s => s.id === taskId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const updates = siblings.map((s, idx) => {
      let nextSortOrder = (idx + 1) * 10;
      if (idx === index) {
        nextSortOrder = (targetIndex + 1) * 10;
      } else if (idx === targetIndex) {
        nextSortOrder = (index + 1) * 10;
      }
      return { id: s.id, sortOrder: nextSortOrder };
    });

    onReorderTasks(updates);
  };

  const matchesFilters = (task: Task): boolean => {
    let selfMatches = true;
    if (hideCompleted && task.status === 'completed') {
      selfMatches = false;
    }
    if (assigneeFilter !== 'all') {
      if (assigneeFilter === 'unassigned') {
        if (task.assignedConsultantId) selfMatches = false;
      } else {
        if (task.assignedConsultantId !== assigneeFilter) selfMatches = false;
      }
    }
    if (statusFilter !== 'all') {
      if (task.status !== statusFilter) selfMatches = false;
    }

    if (selfMatches) return true;

    // Even if this task doesn't match, we still render it if any of its children match
    const children = tasks.filter(t => t.parentId === task.id && t.projectId === selectedProjectId);
    return children.some(c => matchesFilters(c));
  };

  // Recursively render hierarchical tasks with dynamic WBS numbering
  const renderTaskTree = (parentId: string | null, depth = 0, parentNumber = '', depthIsLast: boolean[] = []) => {
    const levelTasks = projectTasks.filter(t => t.parentId === parentId);

    return levelTasks.map((task, index) => {
      const taskNumber = parentNumber ? `${parentNumber}.${index + 1}` : `${index + 1}`;

      if (!matchesFilters(task)) {
        return null;
      }

      const isTaskParent = isParent(task.id);
      const isExpanded = expandedTasks[task.id] !== false; // expanded by default
      const assignedConsultant = consultants.find(c => c.id === task.assignedConsultantId);

      const siblings = projectTasks.filter(t => t.parentId === task.parentId);
      const siblingIndex = siblings.findIndex(s => s.id === task.id);
      const isFirstSibling = siblingIndex === 0;
      const isLastSibling = siblingIndex === siblings.length - 1;

      return (
        <div key={task.id} style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className={`task-node-row task-status-${task.status} ${isTaskParent ? 'task-parent-row' : ''} ${editMode ? 'task-node-editable' : ''}`}
            onMouseEnter={() => setHoveredTaskId(task.id)}
            onMouseLeave={() => setHoveredTaskId(null)}
            style={{
              opacity: task.status === 'completed' ? 0.65 : 1,
              display: 'grid',
              gridTemplateColumns: '1fr 90px 130px 150px 110px 70px',
              alignItems: 'center',
              padding: isTaskParent ? '0.75rem 1.25rem' : '0.6rem 1.25rem',
              gap: '0.75rem',
              cursor: editMode ? 'pointer' : 'default',
              minHeight: isTaskParent ? '50px' : '44px',
              position: 'relative'
            }}
            onClick={() => { if (editMode) handleOpenEditTask(task); }}
          >
            {/* Col 1: Task Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, position: 'relative', height: '100%', flex: 1 }}>
              <div style={{ display: 'flex', height: '100%', position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
                {Array.from({ length: depth }).map((_, i) => (
                  <div key={i} className="tree-guide" style={{ width: '22px', height: '100%', position: 'relative' }}>
                    {i < depth - 1 && !depthIsLast[i] && <div className="tree-line-vertical" />}
                    {i === depth - 1 && (
                      <>
                        <div className={`tree-line-vertical ${isLastSibling ? 'half' : ''}`} />
                        <div className="tree-line-horizontal" />
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ paddingLeft: `${depth * 22}px`, display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, zIndex: 1 }}>
                {editMode && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <input type="checkbox" className="win-checkbox"
                      checked={selectedTaskIds.includes(task.id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedTaskIds(prev =>
                          checked ? [...prev, task.id] : prev.filter(id => id !== task.id)
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginRight: '0.25rem', cursor: 'pointer', width: '15px', height: '15px' }}
                    />
                    <div style={{ display: 'inline-flex', gap: '0.1rem', marginRight: '0.25rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleMoveTask(task.id, 'up'); }}
                        disabled={isFirstSibling}
                        style={{ border: 'none', background: 'none', cursor: isFirstSibling ? 'not-allowed' : 'pointer', opacity: isFirstSibling ? 0.25 : 0.75, color: 'var(--text-secondary)', padding: '1px', display: 'flex', alignItems: 'center' }}
                        title="Move Up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleMoveTask(task.id, 'down'); }}
                        disabled={isLastSibling}
                        style={{ border: 'none', background: 'none', cursor: isLastSibling ? 'not-allowed' : 'pointer', opacity: isLastSibling ? 0.25 : 0.75, color: 'var(--text-secondary)', padding: '1px', display: 'flex', alignItems: 'center' }}
                        title="Move Down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                )}
                {isTaskParent ? (
                  <span className="task-node-toggle" onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }} style={{ padding: '2px' }}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                ) : (
                  <span style={{ width: '16px', flexShrink: 0 }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span
                    style={{
                      textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                      fontWeight: isTaskParent ? 700 : 500,
                      fontSize: isTaskParent ? '1.05rem' : '0.92rem',
                      color: isTaskParent ? 'var(--text-primary)' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.4
                    }}
                    title={task.name}
                  >
                    <span style={{ color: 'var(--text-tertiary)', marginRight: '0.4rem', fontWeight: 600 }}>{taskNumber}</span>
                    {task.name}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.2rem' }}>
                    {inlineEditingTaskId === task.id && inlineEditField === 'pinkNumber' ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                        <input
                          type="text"
                          autoFocus
                          className="form-input"
                          style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem', height: 'auto', minHeight: '24px', width: '100px' }}
                          placeholder="Pink #"
                          value={inlineEditForm.pinkNumber || ''}
                          onChange={(e) => setInlineEditForm({ ...inlineEditForm, pinkNumber: e.target.value })}
                        />
                        <button type="button" className="btn btn-primary" style={{ padding: '0.15rem', borderRadius: '4px' }} onClick={(e) => { e.stopPropagation(); handleInlineSave(task.id); }}>
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        {task.pinkNumber && (
                          <span style={{ fontSize: '0.68rem', backgroundColor: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }} title="Pink Number" onClick={(e) => { e.stopPropagation(); setInlineEditingTaskId(task.id); setInlineEditField('pinkNumber'); setInlineEditForm({ pinkNumber: task.pinkNumber }); }}>
                            Pink #: {task.pinkNumber}
                          </span>
                        )}
                        {!task.pinkNumber && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setInlineEditingTaskId(task.id); setInlineEditField('pinkNumber'); setInlineEditForm({ pinkNumber: '' }); }}
                            style={{ 
                              fontSize: '0.68rem', color: 'var(--text-tertiary)', border: '1px dashed var(--border-color)', background: 'transparent', padding: '0.05rem 0.35rem', borderRadius: '4px', cursor: 'pointer',
                              opacity: hoveredTaskId === task.id ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: hoveredTaskId === task.id ? 'auto' : 'none'
                            }}
                          >
                            + Add Pink Number
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Col 2: Duration */}
            {inlineEditingTaskId === task.id && inlineEditField === 'duration' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }}>
                <input
                  type="number" step="0.5" min="0.5" autoFocus className="form-input"
                  style={{ padding: '0.1rem 0.3rem', fontSize: '0.8rem', height: '24px', width: '50px', textAlign: 'center' }}
                  value={inlineEditForm.durationDays || ''}
                  onChange={(e) => setInlineEditForm({ ...inlineEditForm, durationDays: parseFloat(e.target.value) || 0 })}
                  onClick={(e) => e.stopPropagation()}
                />
                <button type="button" className="btn btn-primary" style={{ padding: '0.15rem' }} onClick={(e) => { e.stopPropagation(); handleInlineSave(task.id); }}><Check size={14} /></button>
              </div>
            ) : (
              <span onClick={(e) => { e.stopPropagation(); setInlineEditingTaskId(task.id); setInlineEditField('duration'); setInlineEditForm({ durationDays: task.durationDays }); }} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', justifyContent: 'center', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>
                <Clock size={12} style={{ color: 'var(--text-tertiary)' }} /> {task.durationDays}d
              </span>
            )}

            {/* Col 3: Start Date */}
            {inlineEditingTaskId === task.id && inlineEditField === 'startDate' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ width: '110px' }}>
                  <WinDatePicker 
                    value={inlineEditForm.customStartDate || ''}
                    onChange={(value) => setInlineEditForm({ ...inlineEditForm, customStartDate: value })}
                  />
                </div>
                <button type="button" className="btn btn-primary" style={{ padding: '0.15rem' }} onClick={(e) => { e.stopPropagation(); handleInlineSave(task.id); }}><Check size={14} /></button>
              </div>
            ) : (
              <span onClick={(e) => { e.stopPropagation(); setInlineEditingTaskId(task.id); setInlineEditField('startDate'); setInlineEditForm({ customStartDate: task.customStartDate || task.plannedStartDate }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <Calendar size={12} style={{ color: 'var(--text-tertiary)' }} />
                {task.plannedStartDate ? formatDateFriendly(task.plannedStartDate) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
              </span>
            )}

            {/* Col 4: Assignee */}
            {inlineEditingTaskId === task.id && inlineEditField === 'assignee' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                <WinComboBox
                  className="form-select"
                  value={inlineEditForm.assignedConsultantId || ''}
                  onChange={(val) => setInlineEditForm({ ...inlineEditForm, assignedConsultantId: val })}
                  options={[
                    { label: 'Unassigned', value: '' },
                    ...consultants.map(c => ({ label: c.name, value: c.id }))
                  ]}
                />
                <button type="button" className="btn btn-primary" style={{ padding: '0.15rem' }} onClick={(e) => { e.stopPropagation(); handleInlineSave(task.id); }}><Check size={14} /></button>
              </div>
            ) : (
              <div onClick={(e) => { e.stopPropagation(); setInlineEditingTaskId(task.id); setInlineEditField('assignee'); setInlineEditForm({ assignedConsultantId: task.assignedConsultantId }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minWidth: 0, cursor: 'pointer' }}>
                {assignedConsultant ? (
                  <>
                    <span
                      style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        backgroundColor: assignedConsultant.avatarColor || '#1e3449',
                        color: 'white', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '0.58rem', fontWeight: 'bold',
                        flexShrink: 0, letterSpacing: '-0.02em',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                      }}
                    >
                      {assignedConsultant.name.split(' ').map(n => n[0]).join('')}
                    </span>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
                      {assignedConsultant.name.split(' ')[0]}
                    </span>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', fontStyle: 'italic' }}>Unassigned</span>
                )}
              </div>
            )}

            {/* Col 5: Status */}
            {inlineEditingTaskId === task.id && inlineEditField === 'status' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                <WinComboBox
                  className="form-select"
                  value={inlineEditForm.status || 'not_started'}
                  onChange={(val) => setInlineEditForm({ ...inlineEditForm, status: val as Task['status'] })}
                  options={[
                    { label: 'Not Started', value: 'not_started' },
                    { label: 'In Progress', value: 'in_progress' },
                    { label: 'On Hold', value: 'on_hold' },
                    { label: 'Completed', value: 'completed' }
                  ]}
                />
                <button type="button" className="btn btn-primary" style={{ padding: '0.15rem' }} onClick={(e) => { e.stopPropagation(); handleInlineSave(task.id); }}><Check size={14} /></button>
              </div>
            ) : (
              <span onClick={(e) => { e.stopPropagation(); setInlineEditingTaskId(task.id); setInlineEditField('status'); setInlineEditForm({ status: task.status }); }} className={`badge badge-${task.status === 'completed' ? 'success' :
                task.status === 'in_progress' ? 'primary' :
                  task.status === 'on_hold' ? 'warning' : 'secondary'
                }`} style={{ justifySelf: 'center', cursor: 'pointer', fontSize: '0.85rem' }}>
                {task.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </span>
            )}

            {/* Col 6: Actions — hidden by default, visible on hover */}
            <div className="task-node-actions" onClick={e => e.stopPropagation()}>
              {activeProject && canEditTask(activeUser, task, activeProject) && (
                <>
                  {activeProject && canCreateTask(activeUser, activeProject) && (
                    <button className="btn btn-secondary btn-icon" onClick={(e) => { e.stopPropagation(); handleAddSubtask(task); }} title="Add Subtask" style={{ padding: '0.25rem' }}>
                      <Plus size={13} />
                    </button>
                  )}
                  {!editMode && (
                    <button className="btn btn-secondary btn-icon" onClick={(e) => { e.stopPropagation(); handleOpenEditTask(task); }} title="Edit Task" style={{ padding: '0.25rem' }}>
                      <Edit2 size={13} />
                    </button>
                  )}
                </>
              )}
              {activeProject && canDeleteTask(activeUser, task, activeProject) && (
                <button
                  className="btn btn-secondary btn-icon"
                  style={{ color: 'var(--danger)', padding: '0.25rem' }}
                  onClick={() => {
                    if (confirm(`Delete task "${task.name}"? Subtasks will also be deleted.`)) {
                      onDeleteTask(task.id);
                      onAddToast('Task deleted.', 'warning');
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Render children recursively */}
          {isTaskParent && isExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {renderTaskTree(task.id, depth + 1, taskNumber, [...depthIsLast, isLastSibling])}
            </div>
          )}
        </div>
      );
    });
  };

  // Recursively render dependency checkboxes for the Task Modal
  const renderDependencyTree = (parentId: string | null, depth = 0, parentNumber = '') => {
    const levelTasks = projectTasks.filter(t => t.parentId === parentId);
    if (levelTasks.length === 0) return null;

    return levelTasks.map((task, index) => {
      // Prevent circular dependencies by not rendering the editing task
      if (editingTask && task.id === editingTask.id) return null;

      const taskNumber = parentNumber ? `${parentNumber}.${index + 1}` : `${index + 1}`;
      const isTaskParent = projectTasks.some(t => t.parentId === task.id);

      return (
        <div key={task.id} style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ 
            display: 'flex', alignItems: 'center', gap: '0.5rem', 
            padding: '0.2rem 0', paddingLeft: `${depth * 1.5}rem`,
            fontSize: '0.825rem', cursor: 'pointer', color: 'var(--text-secondary)' 
          }}>
            <input type="checkbox" className="win-checkbox"
              checked={taskForm.predecessorIds.includes(task.id)}
              onChange={(e) => {
                const checked = e.target.checked;
                setTaskForm(prev => ({
                  ...prev,
                  predecessorIds: checked 
                    ? [...prev.predecessorIds, task.id]
                    : prev.predecessorIds.filter(id => id !== task.id)
                }));
              }}
            />
            <span style={{ fontWeight: 600, color: 'var(--text-tertiary)', minWidth: '1.5rem', textAlign: 'right' }}>{taskNumber}</span>
            <span>{task.name}</span>
          </label>
          
          {isTaskParent && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {renderDependencyTree(task.id, depth + 1, taskNumber)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div>


      {activeProject ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

          {/* Tabs Navigation & Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.3rem', backgroundColor: 'var(--bg-secondary)', padding: '0.35rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', width: 'fit-content', flexWrap: 'wrap' }}>
              {([
                { id: 'overview', label: 'Overview' },
                { id: 'tasks-v2', label: 'Tasks' },
                { id: 'gantt', label: 'Gantt' },
                { id: 'rag', label: 'RAG', customerHidden: true },
                { id: 'communications', label: 'Project Notes', customerHidden: true }
              ] as const).filter(tab => !('customerHidden' in tab && tab.customerHidden && userIsCustomer)).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveProjectTab(tab.id as any)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.45rem',
                    padding: '0.5rem 1.05rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s ease',
                    backgroundColor: activeProjectTab === tab.id ? 'var(--primary)' : 'transparent',
                    color: activeProjectTab === tab.id ? 'white' : 'var(--text-secondary)',
                    boxShadow: activeProjectTab === tab.id ? '0 1px 4px rgba(45,74,101,0.25)' : 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', paddingBottom: '0.25rem' }}>
                {!userIsCustomer && (
                <button
                  className="btn btn-ghost"
                  onClick={handleExport}
                  disabled={isExporting}
                  title="Export to Excel"
                  style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}
                >
                  <Download size={15} /> {isExporting ? 'Exporting…' : 'Export'}
                </button>
                )}
                {!userIsCustomer && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setCalendarForm({ consultantId: '', fromDate: formatDate(new Date()) });
                    setIsCalendarModalOpen(true);
                  }}
                  title="Export tasks as Outlook calendar appointments"
                  style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}
                >
                  <Calendar size={15} /> Export Calendar
                </button>
                )}
            {activeProject && canEditProject(activeUser, activeProject) && (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setDuplicateForm({
                      name: `${activeProject.name} (Copy)`,
                      clientName: activeProject.clientName,
                      startDate: activeProject.startDate,
                      copyAssignments: true
                    });
                    setIsDuplicateModalOpen(true);
                  }}
                  title="Duplicate Project"
                  style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}
                >
                  <RefreshCw size={15} /> Duplicate
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setTemplateForm({ name: `${activeProject.name} Template` });
                    setIsTemplateSaveModalOpen(true);
                  }}
                  title="Save as Template"
                  style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}
                >
                  <FolderKanban size={15} /> Template
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setIsEditProjectModalOpen(true);
                  }}
                  title="Amend Project"
                  style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}
                >
                  <Edit2 size={15} /> Amend
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--danger)', padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete project "${activeProject.name}" and all its tasks?`)) {
                      onDeleteProject(activeProject.id);
                      onSelectProject(null);
                      onAddToast('Project deleted successfully.', 'warning');
                    }
                  }}
                  title="Delete Project"
                >
                  <Trash2 size={15} /> Delete
                </button>
              </>
            )}
            </div>
          </div>

          {activeProjectTab === 'overview' && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* HERO: identity + status badges + quick-link icons */}
              <div className="card" style={{ padding: '1.5rem', borderTop: `5px solid ${getProjectAccent(activeProject)}` }}>
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
                  {(() => {
                    const matched = activeProject.icon ? PROJECT_ICONS.find(i => i.name === activeProject.icon) : null;
                    const IconComp = matched?.Icon || Folder;
                    // Resolve to a concrete hex so the gradient/alpha always renders.
                    // var(--primary) can't be used inside a gradient with a hex alpha suffix.
                    const themeHex = getProjectAccent(activeProject);
                    return (
                      <div style={{
                        width: '56px', height: '56px', flexShrink: 0,
                        borderRadius: 'var(--radius-lg)',
                        background: `linear-gradient(135deg, ${themeHex} 0%, ${themeHex}CC 100%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
                      }}>
                        <IconComp size={28} />
                      </div>
                    );
                  })()}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="badge badge-primary" style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem', fontWeight: 700 }}>
                        {activeProject.clientName}
                      </span>
                      {(() => {
                        const ps = resolvePhaseMeta(activeProject);
                        return (
                          <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem', borderRadius: 'var(--radius-sm)', backgroundColor: ps.bg, color: ps.text, fontWeight: 700 }}>
                            {ps.label}
                          </span>
                        );
                      })()}
                      {!userIsCustomer && (() => {
                        const rs = getRagStyle(activeProject.ragOverall);
                        return (
                          <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem', borderRadius: 'var(--radius-sm)', backgroundColor: rs.bg, color: rs.text, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: rs.text }} />
                            {rs.label}
                          </span>
                        );
                      })()}
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                      {activeProject.name}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: '1.45', margin: 0 }}>
                      {activeProject.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Quick-link icon buttons (navigate, not display) */}
                  {(() => {
                    const TrelloIcon = (
                      <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="#0052CC">
                        <title>Trello</title>
                        <path d="M21.147 0H2.853A2.86 2.86 0 000 2.853v18.294A2.86 2.86 0 002.853 24h18.294A2.86 2.86 0 0024 21.147V2.853A2.86 2.86 0 0021.147 0zM10.74 16.326c0 .54-.429.98-1.002.98H4.673a.987.987 0 01-.98-.98V4.674c0-.54.428-.98.98-.98h5.065c.573 0 1.002.44 1.002.98v11.652zm9.567-5.592c0 .54-.429.98-1.002.98h-5.065a.987.987 0 01-.98-.98V4.674c0-.54.428-.98.98-.98h5.065c.573 0 1.002.44 1.002.98v6.06z"/>
                      </svg>
                    );
                    const SharePointIcon = (
                      <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26">
                        <title>Microsoft SharePoint</title>
                        <rect x="2" y="4" width="20" height="16" rx="2.5" fill="#0078D4"/>
                        <path d="M6.5 8.5h7v2h-7zM6.5 12h7v2h-7zM6.5 15.5h4.5v1.5H6.5z" fill="#fff"/>
                        <circle cx="16.5" cy="14.5" r="3" fill="none" stroke="#fff" strokeWidth="1.4"/>
                        <text x="16.5" y="15.8" textAnchor="middle" fontSize="3.2" fontWeight="700" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">S</text>
                      </svg>
                    );
                    // Sage's real favicon (loaded at runtime); falls back to the green "S" badge if it can't load.
                    const SageIcon = (
                      <span style={{ position: 'relative', width: '26px', height: '26px', display: 'inline-block', flexShrink: 0 }}>
                        <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26" style={{ position: 'absolute', inset: 0 }}>
                          <title>Sage</title>
                          <rect x="1" y="1" width="22" height="22" rx="5" fill="#00D639"/>
                          <text x="12" y="16.6" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">S</text>
                        </svg>
                        <img
                          src="https://www.google.com/s2/favicons?domain=sage.com&sz=64"
                          alt="Sage"
                          width={26}
                          height={26}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          style={{ position: 'absolute', inset: 0, width: '26px', height: '26px', borderRadius: '5px', objectFit: 'contain' }}
                        />
                      </span>
                    );
                    // Sanitize to http(s) only — an unsafe/blank value renders
                    // as a disabled ("not set") button rather than a live href.
                    const links = [
                      { key: 'trello', label: 'Trello', url: safeExternalUrl(activeProject.trelloLink), icon: TrelloIcon },
                      { key: 'sharepoint', label: 'SharePoint', url: safeExternalUrl(activeProject.sharepointLink), icon: SharePointIcon },
                      { key: 'sage', label: 'Sage CRM', url: safeExternalUrl(activeProject.sageCrmLink), icon: SageIcon }
                    ];
                    return (
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {links.map(l => (
                          <a
                            key={l.key}
                            href={l.url || undefined}
                            target="_blank"
                            rel="noreferrer"
                            title={l.url ? `Open ${l.label}` : `${l.label} — not set`}
                            onMouseEnter={(e) => { if (l.url) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.12)'; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                            style={{
                              width: '48px', height: '48px', flexShrink: 0,
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-tertiary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              textDecoration: 'none',
                              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                              opacity: l.url ? 1 : 0.35,
                              cursor: l.url ? 'pointer' : 'not-allowed',
                              pointerEvents: l.url ? 'auto' : 'none',
                              filter: l.url ? 'none' : 'grayscale(1)'
                            }}
                          >
                            {l.icon}
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Timeline pills */}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.85rem', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
                    Start: <b style={{ color: 'var(--text-primary)' }}>{formatDateFriendly(activeProject.startDate)}</b>
                  </span>
                  {activeProject.targetGoLiveDate && (
                    <span style={{ fontSize: '0.85rem', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent)' }} />
                      Target Go-Live: <b style={{ color: 'var(--text-primary)' }}>{formatDateFriendly(activeProject.targetGoLiveDate)}</b>
                    </span>
                  )}
                </div>
              </div>

              {/* KPI CARDS — compact */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
                <div className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time Budget</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{totalAllocatedDuration.toFixed(1)}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>of {activeProject.budgetDays.toFixed(1)}d</span>
                  </div>
                  {isOverBudget ? (
                    <span className="badge badge-danger" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', width: 'fit-content' }}>
                      Over by {(totalAllocatedDuration - activeProject.budgetDays).toFixed(1)}d
                    </span>
                  ) : (
                    <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', width: 'fit-content' }}>
                      {(activeProject.budgetDays - totalAllocatedDuration).toFixed(1)}d remaining
                    </span>
                  )}
                </div>

                <div className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Task Completion</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{completedPercentage}%</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>{completedLeafTasks}/{totalLeafTasks}</span>
                  </div>
                  <div style={{ height: '7px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', marginTop: '0.2rem' }}>
                    <div style={{ height: '100%', width: `${completedPercentage}%`, backgroundColor: 'var(--primary)', borderRadius: '4px', transition: 'width 0.3s ease' }} />
                  </div>
                </div>

                <div className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Open Tasks</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{totalLeafTasks - completedLeafTasks}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>of {totalLeafTasks} remaining</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {completedLeafTasks} completed
                  </span>
                </div>
              </div>

              {/* BOTTOM: Roles & Resources + Project Health side-by-side */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '1rem', alignItems: 'stretch' }}>

                {/* ROLES & RESOURCES */}
                <div className="card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Roles & Assignments</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem' }}>
                    {([
                      { label: 'Project Manager', id: activeProject.projectManagerId },
                      { label: 'Lead Consultant', id: activeProject.leadConsultantId },
                      { label: 'Customer', id: activeProject.customerId }
                    ] as const).map(role => {
                      const person = role.id ? consultants.find(c => c.id === role.id) : null;
                      return (
                        <div key={role.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--bg-tertiary)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: person?.avatarColor || 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
                            {person ? person.name.split(' ').map(n => n[0]).join('') : <User size={15} />}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>{role.label}</span>
                            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {person ? person.name : 'Unassigned'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resources */}
                  <div style={{ marginTop: '1rem' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resources</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {(activeProject.projectResourceIds || []).map(rid => {
                        const person = consultants.find(c => c.id === rid);
                        return (
                          <span key={rid} style={{ fontSize: '0.88rem', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '0.3rem 0.7rem', borderRadius: '16px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: person?.avatarColor || 'var(--text-tertiary)' }} />
                            {person?.name || rid}
                          </span>
                        );
                      })}
                      {(!activeProject.projectResourceIds || activeProject.projectResourceIds.length === 0) && <span style={{ fontSize: '0.88rem', color: 'var(--text-tertiary)' }}>No resources assigned</span>}
                    </div>
                  </div>
                </div>

                {/* PROJECT HEALTH (RAG) — hidden for customers */}
                {!userIsCustomer && (
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>Project Health</h3>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setActiveProjectTab('rag')}
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                      title="Open RAG Status tab"
                    >
                      Manage RAG →
                    </button>
                  </div>

                  {/* Overall banner */}
                  {(() => {
                    const rs = getRagStyle(activeProject.ragOverall);
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: rs.bg, border: `1px solid ${rs.text}33`, marginBottom: '0.85rem' }}>
                        <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: rs.text, boxShadow: `0 0 8px ${rs.text}`, flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Overall</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: rs.text }}>{rs.label}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Sub-categories */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.55rem' }}>
                    {([
                      { key: 'ragScope', label: 'Scope' },
                      { key: 'ragSchedule', label: 'Schedule' },
                      { key: 'ragCosts', label: 'Costs' },
                      { key: 'ragBenefits', label: 'Benefits' }
                    ] as const).map(cat => {
                      const rs = getRagStyle(activeProject[cat.key as keyof Project] as string);
                      return (
                        <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.55rem 0.7rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: rs.text, flexShrink: 0 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cat.label}</span>
                            <span style={{ fontSize: '0.72rem', color: rs.text, fontWeight: 700 }}>{rs.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

          {activeProjectTab === 'tasks-v2' && activeProject && (
            <TaskListV2
              project={activeProject}
              tasks={tasks}
              consultants={consultants}
              activeUserId={activeUserId}
              activeUser={activeUser}
              onCreateTask={onCreateTask}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
              onBulkUpdateTasks={onBulkUpdateTasks}
              onBulkDeleteTasks={onBulkDeleteTasks}
              onReorderTasks={onReorderTasks}
              onAddToast={onAddToast}
            />
          )}

          {activeProjectTab === 'gantt' && (
        <div style={{ overflow: 'hidden' }}>
          <GanttChart
            activeProject={activeProject}
            tasks={tasks}
            consultants={consultants}
            onUpdateTask={onUpdateTask}
            canEdit={canEditGantt(activeUser)}
          />
        </div>
      )}

      {activeProjectTab === 'rag' && !userIsCustomer && (
        (() => {
          const RAG_META: Record<string, { color: string; label: string }> = {
            green: { color: '#10b981', label: 'On Track' },
            amber: { color: '#f59e0b', label: 'At Risk' },
            red: { color: '#ef4444', label: 'Off Track' }
          };
          const ragValue = (v?: string) => (v || 'green').toLowerCase();
          const overallVal = ragValue(activeProject.ragOverall);
          const overallMeta = RAG_META[overallVal] || RAG_META.green;
          type RagCatDef = {
            key: keyof typeof activeProject;
            reasonKey: keyof typeof activeProject;
            risksKey: keyof typeof activeProject;
            label: string;
            desc: string;
          };
          const categories: RagCatDef[] = [
            { key: 'ragScope',    reasonKey: 'ragScopeReason',    risksKey: 'ragScopeRisks',    label: 'Scope',   desc: 'Are deliverables aligned with agreed requirements?' },
            { key: 'ragSchedule', reasonKey: 'ragScheduleReason', risksKey: 'ragScheduleRisks', label: 'Users',   desc: 'Are end users engaged and adoption on track?' },
            { key: 'ragCosts',    reasonKey: 'ragCostsReason',    risksKey: 'ragCostsRisks',    label: 'Data',    desc: 'Is data migration and quality on course?' },
            { key: 'ragBenefits', reasonKey: 'ragBenefitsReason', risksKey: 'ragBenefitsRisks', label: 'Days',    desc: 'Is the day-count spend within the approved budget?' },
            { key: 'ragOverall',  reasonKey: 'ragOverallReason',  risksKey: 'ragOverallRisks',  label: 'Overall', desc: 'Consolidated health rating for this project.' }
          ];

          const handleAddRisk = (risksKey: string, catKey: string) => {
            const text = (ragRiskInputs[catKey] || '').trim();
            if (!text) return;
            const existing = (activeProject[risksKey as keyof typeof activeProject] as { id: string; text: string; done: boolean }[] | undefined) || [];
            const updated = [...existing, { id: `r-${Date.now()}`, text, done: false }];
            onUpdateProject({ ...activeProject, [risksKey]: updated });
            setRagRiskInputs(prev => ({ ...prev, [catKey]: '' }));
          };

          const handleToggleRisk = (risksKey: string, riskId: string) => {
            const existing = (activeProject[risksKey as keyof typeof activeProject] as { id: string; text: string; done: boolean }[] | undefined) || [];
            const updated = existing.map(r => r.id === riskId ? { ...r, done: !r.done } : r);
            onUpdateProject({ ...activeProject, [risksKey]: updated });
          };

          const handleDeleteRisk = (risksKey: string, riskId: string) => {
            const existing = (activeProject[risksKey as keyof typeof activeProject] as { id: string; text: string; done: boolean }[] | undefined) || [];
            onUpdateProject({ ...activeProject, [risksKey]: existing.filter(r => r.id !== riskId) });
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Summary hero */}
              <div className="card" style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1.75rem', borderTop: `5px solid ${overallMeta.color}`, flexWrap: 'wrap' }}>
                <div style={{ width: '76px', height: '76px', borderRadius: '50%', backgroundColor: `${overallMeta.color}20`, border: `3px solid ${overallMeta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: overallMeta.color, boxShadow: `0 0 12px ${overallMeta.color}` }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, minWidth: '240px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overall Project Health</span>
                  <span style={{ fontSize: '1.85rem', fontWeight: 800, color: overallMeta.color, letterSpacing: '-0.01em' }}>{overallMeta.label}</span>
                  <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                    {overallVal === 'green' && 'This project is progressing well and meeting its targets.'}
                    {overallVal === 'amber' && 'This project has some risks that require attention.'}
                    {overallVal === 'red' && 'This project is off track and needs immediate intervention.'}
                  </span>
                </div>
              </div>

              {/* Category cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {categories.map(cat => {
                  const current = ragValue(activeProject[cat.key] as string);
                  const meta = RAG_META[current] || RAG_META.green;
                  const risks = (activeProject[cat.risksKey] as { id: string; text: string; done: boolean }[] | undefined) || [];
                  const reason = (activeProject[cat.reasonKey] as string | undefined) || '';
                  return (
                    <div key={cat.key as string} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: `3px solid ${meta.color}` }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{cat.label}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.25rem 0.7rem', borderRadius: 'var(--radius-sm)', backgroundColor: `${meta.color}1f`, color: meta.color, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: meta.color }} />
                          {meta.label}
                        </span>
                      </div>

                      <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{cat.desc}</span>

                      {/* Traffic-light selector */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {(['green', 'amber', 'red'] as const).map(status => {
                          const sm = RAG_META[status];
                          const isSel = current === status;
                          return (
                            <button key={status} onClick={() => onUpdateProject({ ...activeProject, [cat.key]: status })} title={sm.label} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: isSel ? 'none' : '1px solid var(--border-color)', backgroundColor: isSel ? sm.color : 'transparent', color: isSel ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s ease', textTransform: 'capitalize' }}>
                              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: isSel ? 'white' : sm.color, border: isSel ? 'none' : `1px solid ${sm.color}`, flexShrink: 0 }} />
                              {status}
                            </button>
                          );
                        })}
                      </div>

                      {/* Reason */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reason</span>
                        <textarea
                          rows={2}
                          className="form-textarea"
                          placeholder="Why is this category at this status?"
                          defaultValue={reason}
                          onBlur={e => onUpdateProject({ ...activeProject, [cat.reasonKey]: e.target.value })}
                          style={{ fontSize: '0.88rem', resize: 'vertical' }}
                        />
                      </div>

                      {/* Risks */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Risks</span>
                        {risks.length > 0 && (
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {risks.map(risk => (
                              <li key={risk.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', borderRadius: 'var(--radius-sm)', backgroundColor: risk.done ? 'var(--bg-secondary)' : `${meta.color}0d` }}>
                                <button
                                  onClick={() => handleToggleRisk(cat.risksKey as string, risk.id)}
                                  style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${risk.done ? 'var(--text-tertiary)' : meta.color}`, backgroundColor: risk.done ? 'var(--text-tertiary)' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                >
                                  {risk.done && <Check size={11} color="white" />}
                                </button>
                                <span style={{ flex: 1, fontSize: '0.87rem', color: risk.done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: risk.done ? 'line-through' : 'none', lineHeight: 1.35 }}>{risk.text}</span>
                                <button onClick={() => handleDeleteRisk(cat.risksKey as string, risk.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0 2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                  <X size={13} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <input
                            className="form-input"
                            placeholder="Add a risk…"
                            value={ragRiskInputs[cat.key as string] || ''}
                            onChange={e => setRagRiskInputs(prev => ({ ...prev, [cat.key as string]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRisk(cat.risksKey as string, cat.key as string); } }}
                            style={{ flex: 1, fontSize: '0.87rem' }}
                          />
                          <button
                            onClick={() => handleAddRisk(cat.risksKey as string, cat.key as string)}
                            className="btn btn-primary"
                            style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()
      )}

      {activeProjectTab === 'communications' && !userIsCustomer && (() => {
        const NOTE_TYPES: Record<string, { label: string; color: string; Icon: FC<{ size?: number }> }> = {
          decision: { label: 'Decision',    color: '#6366f1', Icon: CheckCircle },
          risk:     { label: 'Risk',         color: '#ef4444', Icon: AlertTriangle },
          action:   { label: 'Action Item',  color: '#8b5cf6', Icon: Zap },
          update:   { label: 'Update',       color: '#10b981', Icon: Bell },
          idea:     { label: 'Idea',         color: '#f59e0b', Icon: Lightbulb }
        };

        const projectNotes = communications
          .filter(c => c.projectId === activeProject.id)
          .filter(c => noteTypeFilter === 'all' || (c.noteType || 'update') === noteTypeFilter)
          .filter(c => !notesPinFilter || c.pinned)
          .filter(c => !noteSearch || c.subject.toLowerCase().includes(noteSearch.toLowerCase()) || c.description.toLowerCase().includes(noteSearch.toLowerCase()))
          .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

        const handleSaveNote = () => {
          if (!noteForm.subject.trim()) return;
          onSaveCommunication({
            id: `note-${Math.random().toString(36).substring(2, 11)}`,
            projectId: activeProject.id,
            subject: noteForm.subject,
            type: 'Teams call',
            description: noteForm.description,
            creatorId: activeUserId,
            createdAt: new Date().toISOString(),
            noteType: noteForm.noteType,
            pinned: false
          });
          setNoteForm({ subject: '', description: '', noteType: 'update' });
          onAddToast('Note saved', 'success');
        };

        const handleTogglePin = (note: Communication) => {
          onSaveCommunication({ ...note, pinned: !note.pinned });
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Capture bar — hidden for customers (they may not post notes) */}
            {!userIsCustomer && (
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {Object.entries(NOTE_TYPES).map(([key, nt]) => {
                  const NtIcon = nt.Icon;
                  const isSel = noteForm.noteType === key;
                  return (
                    <button key={key} onClick={() => setNoteForm(f => ({ ...f, noteType: key as Communication['noteType'] }))} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', borderRadius: '20px', border: `2px solid ${isSel ? nt.color : 'var(--border-color)'}`, backgroundColor: isSel ? `${nt.color}18` : 'transparent', color: isSel ? nt.color : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600, transition: 'all 0.15s ease' }}>
                      <NtIcon size={13} />
                      {nt.label}
                    </button>
                  );
                })}
              </div>
              <input className="form-input" placeholder="Note title…" value={noteForm.subject} onChange={e => setNoteForm(f => ({ ...f, subject: e.target.value }))} style={{ fontWeight: 600, fontSize: '0.95rem' }} />
              <textarea className="form-textarea" placeholder="Add details, context, or next steps…" rows={3} value={noteForm.description} onChange={e => setNoteForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleSaveNote} disabled={!noteForm.subject.trim()}>
                  <Plus size={15} /> Add Note
                </button>
              </div>
            </div>
            )}

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                <input className="form-input" placeholder="Search notes…" value={noteSearch} onChange={e => setNoteSearch(e.target.value)} style={{ paddingLeft: '2.1rem', fontSize: '0.88rem' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[{ value: 'all', label: 'All' }, ...Object.entries(NOTE_TYPES).map(([k, v]) => ({ value: k, label: v.label }))].map(opt => (
                  <button key={opt.value} onClick={() => setNoteTypeFilter(opt.value)} style={{ padding: '0.35rem 0.75rem', borderRadius: '20px', border: `1.5px solid ${noteTypeFilter === opt.value ? 'var(--primary)' : 'var(--border-color)'}`, backgroundColor: noteTypeFilter === opt.value ? 'var(--primary-light)' : 'transparent', color: noteTypeFilter === opt.value ? 'var(--primary)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                    {opt.label}
                  </button>
                ))}
                <button onClick={() => setNotesPinFilter(f => !f)} title="Pinned only" style={{ padding: '0.35rem 0.75rem', borderRadius: '20px', border: `1.5px solid ${notesPinFilter ? '#f59e0b' : 'var(--border-color)'}`, backgroundColor: notesPinFilter ? '#f59e0b18' : 'transparent', color: notesPinFilter ? '#f59e0b' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Pin size={12} /> Pinned
                </button>
              </div>
            </div>

            {/* Notes grid */}
            {projectNotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                <Lightbulb size={36} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                <p style={{ margin: 0 }}>No notes yet. Capture a decision, risk, or idea above.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {projectNotes.map(note => {
                  const nt = NOTE_TYPES[note.noteType || 'update'] || NOTE_TYPES.update;
                  const NtIcon = nt.Icon;
                  const author = consultants.find(c => c.id === note.creatorId);
                  return (
                    <div key={note.id} className="card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', borderLeft: `4px solid ${nt.color}`, position: 'relative' }}>
                      {note.pinned && (
                        <div style={{ position: 'absolute', top: '0.6rem', right: '2.2rem', color: '#f59e0b' }}>
                          <Pin size={13} />
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, color: nt.color, textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: `${nt.color}15`, padding: '0.2rem 0.5rem', borderRadius: '20px', flexShrink: 0 }}>
                          <NtIcon size={11} /> {nt.label}
                        </span>
                        <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0, marginLeft: 'auto' }}>
                          <button onClick={() => handleTogglePin(note)} title={note.pinned ? 'Unpin' : 'Pin'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: note.pinned ? '#f59e0b' : 'var(--text-tertiary)', padding: '2px', display: 'flex', alignItems: 'center' }}>
                            <Pin size={13} />
                          </button>
                          <button onClick={() => onDeleteCommunication(note.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '2px', display: 'flex', alignItems: 'center' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{note.subject}</h4>
                      {note.description && (
                        <p style={{ margin: 0, fontSize: '0.87rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{note.description}</p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1px solid var(--border-color)' }}>
                        {author && (
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: author.avatarColor || 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                            {author.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                          {author?.name || 'Unknown'} · {formatDateTimeFriendly(note.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <FolderKanban size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
          <h3>Select or Create a Project</h3>
          <p style={{ color: 'var(--text-tertiary)', maxWidth: '400px', margin: '0.5rem auto 1.5rem' }}>
            To manage your Sage Intacct implementation checklist, select an existing project from the dropdown or build a new client profile.
          </p>
          <button className="btn btn-primary" onClick={() => setIsNewProjectModalOpen(true)}>
            <Plus size={16} /> Create New Project
          </button>
        </div>
      )}


      {/* AMEND PROJECT MODAL */}
      {isEditProjectModalOpen && activeProject && (
        <EditProjectModal
          project={activeProject}
          consultants={consultants}
          customers={customers}
          onUpdateProject={onUpdateProject}
          onClose={() => setIsEditProjectModalOpen(false)}
        />
      )}

      {/* CREATE/EDIT TASK MODAL */}
      {isTaskModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '800px', width: '92%', maxHeight: '90vh' }}>
            <div className="modal-header" style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  backgroundColor: 'var(--primary-light)',
                  color: 'var(--primary)',
                  padding: '0.4rem',
                  borderRadius: '6px',
                  display: 'inline-flex'
                }}>
                  <Pencil size={18} />
                </span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  {editingTask ? 'Edit Implementation Task' : 'Add Implementation Task'}
                </h3>
              </div>
              <button className="btn btn-secondary btn-icon" onClick={() => setIsTaskModalOpen(false)} style={{ padding: '0.35rem' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTaskSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>

                {/* 2-Column Responsive Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1.5rem'
                }}>
                  {/* Left Column: Core Fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Task Settings
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="form-field-9" className="form-label">Task Name</label>
                      <input id="form-field-9"
                        type="text"
                        className="form-input"
                        placeholder="e.g. Chart of Accounts Setup"
                        value={taskForm.name}
                        onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                        required
                      />
                    </div>

                    {/* Start Date & Duration */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="form-field-1" className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Calendar size={12} /> Start Date
                        </label>
                        <WinDatePicker 
                          value={taskForm.customStartDate || ''}
                          onChange={(value) => setTaskForm({ ...taskForm, customStartDate: value })}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={12} /> Duration (Days)
                        </label>
                        <input id="form-field-1"
                          type="number"
                          step="0.5"
                          min="0.5"
                          className="form-input"
                          value={taskForm.durationDays}
                          onChange={(e) => setTaskForm({ ...taskForm, durationDays: parseFloat(e.target.value) || 0.5 })}
                          required
                        />
                      </div>
                    </div>

                    {/* Parent & Status */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Parent Task</label>
                        <WinComboBox
                          className="form-select"
                          value={taskForm.parentId || ''}
                          onChange={(val) => setTaskForm({ ...taskForm, parentId: val })}
                          options={[
                            { label: 'None (Top-Level)', value: '' },
                            ...projectTasks
                              .filter(t => t.id !== editingTask?.id && !isParent(t.id))
                              .map(t => ({ label: t.name, value: t.id }))
                          ]}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Task Status</label>
                        <WinComboBox
                          className="form-select"
                          value={taskForm.status}
                          onChange={(val) => setTaskForm({ ...taskForm, status: val as Task['status'] })}
                          options={[
                            { label: 'Not Started', value: 'not_started' },
                            { label: 'In Progress', value: 'in_progress' },
                            { label: 'On Hold', value: 'on_hold' },
                            { label: 'Completed', value: 'completed' }
                          ]}
                        />
                      </div>
                    </div>

                    {/* Pink Number */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="form-field-10" className="form-label">Pink Number</label>
                      <input id="form-field-10"
                        type="text"
                        className="form-input"
                        placeholder="e.g. PN-12345"
                        value={taskForm.pinkNumber}
                        onChange={(e) => setTaskForm({ ...taskForm, pinkNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Right Column: Execution & Relationships */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Assignments & Dependencies
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Assigned Consultant</label>
                      <WinComboBox
                        className="form-select"
                        value={taskForm.assignedConsultantId || ''}
                        onChange={(val) => setTaskForm({ ...taskForm, assignedConsultantId: val })}
                        options={[
                          { label: 'Unassigned', value: '' },
                          ...consultants.map(c => ({ label: `${c.name} (${c.role})`, value: c.id }))
                        ]}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Dependency</label>
                      <div style={{
                        maxHeight: '140px',
                        overflowY: 'auto',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--bg-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.15rem'
                      }}>
                        {projectTasks.filter(t => t.id !== editingTask?.id).length === 0 ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                            No other tasks available for dependency links.
                          </span>
                        ) : (
                          renderDependencyTree(null, 0, '')
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Full-Width Description field at the bottom */}
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Additional Notes
                    </span>
                  </div>
                  <label htmlFor="form-field-11" className="form-label">Task Description</label>
                  <textarea id="form-field-11"
                    className="form-textarea"
                    placeholder="Provide execution steps or details..."
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Apply to Subtasks Warning */}
                {editingTask && isParent(editingTask.id) && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--primary-light)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    marginTop: '0.25rem'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                      <input type="checkbox" className="win-checkbox"
                        checked={applyToSubtasks}
                        onChange={(e) => setApplyToSubtasks(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Apply assignee & status changes to all sub-tasks</span>
                    </label>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', display: 'block', marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
                      When checked, the selected assignee and status will also be applied to every child task under this parent.
                    </span>
                  </div>
                )}

              </div>

              <div className="modal-footer" style={{ padding: '1rem 1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsTaskModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* DUPLICATE PROJECT MODAL */}
      {isDuplicateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Duplicate Project</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setIsDuplicateModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleDuplicateSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="form-field-16" className="form-label">New Project Name</label>
                  <input id="form-field-16"
                    type="text"
                    className="form-input"
                    value={duplicateForm.name}
                    onChange={(e) => setDuplicateForm({ ...duplicateForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="form-field-17" className="form-label">New Client Name</label>
                  <input id="form-field-17"
                    type="text"
                    className="form-input"
                    value={duplicateForm.clientName}
                    onChange={(e) => setDuplicateForm({ ...duplicateForm, clientName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">New Project Start Date</label>
                  <WinDatePicker 
                    value={duplicateForm.startDate}
                    onChange={(value) => setDuplicateForm({ ...duplicateForm, startDate: value })}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input type="checkbox" className="win-checkbox"
                    checked={duplicateForm.copyAssignments}
                    onChange={(e) => setDuplicateForm({ ...duplicateForm, copyAssignments: e.target.checked })}
                  />
                  <span>Copy consultant task assignments</span>
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsDuplicateModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Duplicate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPORT CALENDAR MODAL */}
      {isCalendarModalOpen && activeProject && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Export Calendar</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setIsCalendarModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCalendarExport}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Consultant</label>
                  <WinComboBox
                    value={calendarForm.consultantId}
                    onChange={(value) => setCalendarForm({ ...calendarForm, consultantId: value })}
                    placeholder="Select a consultant..."
                    options={consultants
                      .filter(c => tasks.some(t => t.projectId === activeProject.id && t.assignedConsultantId === c.id))
                      .map(c => ({ label: c.name, value: c.id }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Export tasks starting from</label>
                  <WinDatePicker
                    value={calendarForm.fromDate}
                    onChange={(value) => setCalendarForm({ ...calendarForm, fromDate: value })}
                  />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Downloads an .ics of this project's tasks for that consultant as all-day appointments.
                  In classic Outlook use <strong>File &gt; Open &amp; Export &gt; Import/Export &gt; Import an iCalendar (.ics) file &gt; Import</strong> —
                  double-clicking the file opens it as a separate calendar instead of adding to the diary.
                  Outlook does not de-duplicate on import, so set the date past anything already in the diary.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCalendarModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!calendarForm.consultantId}>Export</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SAVE PROJECT AS TEMPLATE MODAL */}
      {isTemplateSaveModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Save Project as Template</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setIsTemplateSaveModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveTemplateSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="form-field-18" className="form-label">Template Reference Name</label>
                  <input id="form-field-18"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Sage Intacct Standard Light implementation"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ name: e.target.value })}
                    required
                  />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  This will create a read-only template reference containing the current tasks hierarchy, predecessor dependencies, and durations. You can instantiate this template when creating future projects.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsTemplateSaveModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLOATING BULK ACTIONS TOOLBAR */}
      {editMode && selectedTaskIds.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderTop: '3px solid var(--accent)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            borderRadius: 'var(--radius-lg)',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: 1000,
            animation: 'slideUp 0.2s ease-out',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRight: '1px solid var(--border-color)', paddingRight: '1rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedTaskIds.length} tasks selected
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Status Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Status:</span>
              <WinComboBox
                className="form-select"
                value=""
                onChange={(val) => {
                  if (val) handleBulkStatusChange(val as Task['status']);
                }}
                menuPosition="top"
                options={[
                  { label: 'Change Status...', value: '' },
                  { label: 'Not Started', value: 'not_started' },
                  { label: 'In Progress', value: 'in_progress' },
                  { label: 'Completed', value: 'completed' },
                  { label: 'On Hold', value: 'on_hold' }
                ]}
              />
            </div>

            {/* Assignee Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Assignee:</span>
              <WinComboBox
                className="form-select"
                value=""
                onChange={(val) => {
                  if (val) handleBulkAssigneeChange(val);
                }}
                menuPosition="top"
                options={[
                  { label: 'Change Assignee...', value: '' },
                  { label: 'Unassigned', value: 'unassigned' },
                  ...consultants.map(c => ({ label: c.name, value: c.id }))
                ]}
              />
            </div>

            {/* Set Duration */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Duration:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="form-input"
                  placeholder="days"
                  value={bulkDuration}
                  onChange={(e) => setBulkDuration(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', width: '70px', height: 'auto' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleBulkDurationApply}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                >
                  Set
                </button>
              </div>
            </div>

            <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-color)' }} />

            {/* Delete button */}
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleBulkDeleteApply}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Trash2 size={13} />
              <span>Delete</span>
            </button>

            {/* Deselect All button */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSelectedTaskIds([])}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              Deselect All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Project, Task, Consultant, O365Config } from '../types';
import { canCreateProject, canEditProject, canCreateTask, canEditTask, canDeleteTask } from '../utils/permissions';
import { 
  Plus, Calendar, Trash2, Edit2, ChevronDown, ChevronRight, ChevronUp,
  RefreshCw, MailCheck, User, X, Clock, FolderKanban, Pencil
} from 'lucide-react';
import { syncTaskToO365, createOutlookCalendarEvent } from '../utils/o365';

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

interface ProjectViewProps {
  projects: Project[];
  tasks: Task[];
  consultants: Consultant[];
  o365Config: O365Config;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onCreateProject: (project: Omit<Project, 'id' | 'createdAt' | 'isTemplate'>, templateId?: string) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onCreateTask: (task: Omit<Task, 'id'>) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onBulkUpdateTasks: (ids: string[], updates: Partial<Task>) => void;
  onBulkDeleteTasks: (ids: string[]) => void;
  onUpdateTaskAndSubtasks: (task: Task, subtaskIds: string[], subtaskUpdates: Partial<Task>) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  projectTemplates: Project[];
  onDuplicateProject: (projectId: string, config: { name: string; clientName: string; startDate: string; copyAssignments: boolean }) => void;
  onSaveAsTemplate: (projectId: string, templateName: string) => void;
  activeUserId: string;
  onReorderTasks: (updates: { id: string; sortOrder: number }[]) => void;
}

export default function ProjectView({
  projects,
  tasks,
  consultants,
  o365Config,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onBulkUpdateTasks,
  onBulkDeleteTasks,
  onUpdateTaskAndSubtasks,
  onAddToast,
  projectTemplates,
  onDuplicateProject,
  onSaveAsTemplate,
  activeUserId,
  onReorderTasks
}: ProjectViewProps) {
  const activeConsultant = consultants.find(c => c.id === activeUserId);
  const activeRole = activeConsultant?.role || 'Read only';

  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isTemplateSaveModalOpen, setIsTemplateSaveModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  
  const [duplicateForm, setDuplicateForm] = useState({ name: '', clientName: '', startDate: '', copyAssignments: true });
  const [templateForm, setTemplateForm] = useState({ name: '' });
  
  // Form States
  const [newProject, setNewProject] = useState({ name: '', clientName: '', description: '', budgetDays: 10, startDate: new Date().toISOString().split('T')[0], targetGoLiveDate: '', consultantIds: [] as string[] });
  const [editProjectForm, setEditProjectForm] = useState({ id: '', name: '', clientName: '', description: '', budgetDays: 10, startDate: '', targetGoLiveDate: '', consultantIds: [] as string[] });
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
    billed: false,
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

  // Calendar Event Form State
  const [calendarTask, setCalendarTask] = useState<Task | null>(null);
  const [calendarForm, setCalendarForm] = useState({
    title: '',
    startTime: '09:00',
    endTime: '17:00',
    description: '',
    sendInvites: true
  });

  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
  const [schedulingEvent, setSchedulingEvent] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [applyToSubtasks, setApplyToSubtasks] = useState(false);

  const [hideCompleted, setHideCompleted] = useState(false);
  const [billedFilter, setBilledFilter] = useState<'all' | 'only' | 'hide'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Active Project Data
  const activeProject = projects.find(p => p.id === selectedProjectId) || null;
  const projectTasks = tasks
    .filter(t => t.projectId === selectedProjectId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  
  // Calculate Budgets
  // Note: Parent tasks will be excluded from budget totals to avoid double counting.
  const isParent = (taskId: string) => tasks.some(t => t.parentId === taskId);
  const leafTasks = projectTasks.filter(t => !isParent(t.id));
  const totalAllocatedDuration = leafTasks.reduce((acc, t) => acc + t.durationDays, 0);
  const isOverBudget = activeProject ? totalAllocatedDuration > activeProject.budgetDays : false;

  const totalLeafTasks = leafTasks.length;
  const completedLeafTasks = leafTasks.filter(t => t.status === 'completed').length;
  const completedPercentage = totalLeafTasks > 0 ? Math.round((completedLeafTasks / totalLeafTasks) * 100) : 0;
  const totalBilledTasks = leafTasks.filter(t => t.billed).length;
  const billedPercentage = totalLeafTasks > 0 ? Math.round((totalBilledTasks / totalLeafTasks) * 100) : 0;

  // Toggle tree expansion
  const toggleExpand = (taskId: string) => {
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // Handle Project Submits
  const handleCreateProjectSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newProject.name || !newProject.clientName) return;
    onCreateProject(newProject, selectedTemplateId || undefined);
    setIsNewProjectModalOpen(false);
    setNewProject({ name: '', clientName: '', description: '', budgetDays: 10, startDate: new Date().toISOString().split('T')[0], targetGoLiveDate: '', consultantIds: [] });
    setSelectedTemplateId('');
  };

  const handleEditProjectSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activeProject || !editProjectForm.name || !editProjectForm.clientName) return;

    onUpdateProject({
      ...activeProject,
      name: editProjectForm.name,
      clientName: editProjectForm.clientName,
      description: editProjectForm.description,
      budgetDays: parseFloat(editProjectForm.budgetDays.toString()) || 0,
      startDate: editProjectForm.startDate,
      targetGoLiveDate: editProjectForm.targetGoLiveDate || undefined
    });
    setIsEditProjectModalOpen(false);
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

  // Open Task Modal for Create
  const handleOpenCreateTask = () => {
    setEditingTask(null);
    setTaskForm({
      name: '',
      description: '',
      durationDays: 1.0,
      assignedConsultantId: consultants[0]?.id || '',
      parentId: '',
      predecessorIds: [],
      status: 'not_started',
      pinkNumber: '',
      billed: false,
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
      billed: !!task.billed,
      customStartDate: task.customStartDate || ''
    });
    setIsTaskModalOpen(true);
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
      durationDays: parseFloat(taskForm.durationDays.toString()),
      assignedConsultantId: taskForm.assignedConsultantId || null,
      parentId: taskForm.parentId || null,
      predecessorIds: taskForm.predecessorIds,
      status: taskForm.status,
      pinkNumber: taskForm.pinkNumber,
      billed: taskForm.billed,
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

  // Office 365 Sync Action
  const handleSyncToO365 = async (task: Task) => {
    if (!o365Config.isEnabled) {
      onAddToast('O365 Integration is disabled. Set it up in Settings to sync with a real account. Simulating sync instead.', 'info');
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

  // Open Calendar Appointment Modal
  const handleOpenCalendarModal = (task: Task) => {
    setCalendarTask(task);
    setCalendarForm({
      title: `Sage Intacct: ${task.name}`,
      startTime: '09:00',
      endTime: task.durationDays <= 0.5 ? '13:00' : '17:00',
      description: task.description || `Task implementation scheduled for Sage Intacct project.`,
      sendInvites: true
    });
    setIsCalendarModalOpen(true);
  };

  // Handle Calendar Scheduling Submit
  const handleCalendarSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!calendarTask) return;

    if (!o365Config.isEnabled) {
      onAddToast('Office 365 Integration is disabled. Simulating calendar event creation.', 'info');
    }

    setSchedulingEvent(true);
    const consultant = consultants.find(c => c.id === calendarTask.assignedConsultantId);
    const invitedConsultants = consultant ? [consultant] : [];

    const result = await createOutlookCalendarEvent(
      calendarTask,
      invitedConsultants,
      o365Config,
      calendarForm,
      !o365Config.isEnabled
    );
    setSchedulingEvent(false);
    setIsCalendarModalOpen(false);

    if (result.success) {
      onUpdateTask({ ...calendarTask, o365CalendarEventId: result.eventId });
      onAddToast(result.message, 'success');
    } else {
      onAddToast(result.message, 'error');
    }
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

  const handleBulkBillingChange = (billed: boolean) => {
    onBulkUpdateTasks(selectedTaskIds, { billed });
    setSelectedTaskIds([]);
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
    if (billedFilter === 'hide') {
      if (task.billed) selfMatches = false;
    } else if (billedFilter === 'only') {
      if (!task.billed) selfMatches = false;
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
            style={{ 
              opacity: task.status === 'completed' ? 0.65 : 1,
              display: 'grid',
              gridTemplateColumns: '1fr 90px 140px 150px 120px 100px',
              alignItems: 'center',
              padding: isTaskParent ? '0.85rem 1.5rem' : '0.7rem 1.5rem',
              gap: '1.25rem',
              cursor: editMode ? 'pointer' : 'default',
              minHeight: isTaskParent ? '52px' : '46px',
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
                  <input
                    type="checkbox"
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
                  {task.pinkNumber && (
                    <span style={{ fontSize: '0.68rem', backgroundColor: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 600 }} title="Pink Number">
                      Pink #: {task.pinkNumber}
                    </span>
                  )}
                  {task.billed && (
                    <span style={{ fontSize: '0.68rem', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 600 }} title="Billed Status">
                      Billed
                    </span>
                  )}
                </div>
              </div>
              </div>
            </div>

            {/* Col 2: Duration */}
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.84rem', justifyContent: 'center', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', backgroundColor: 'rgba(30, 52, 73, 0.08)', padding: '0.2rem 0.6rem', borderRadius: '12px', border: '1px solid rgba(30, 52, 73, 0.15)' }}>
              <Clock size={12} style={{ color: '#e58a3e' }} /> {task.durationDays}d
            </span>

            {/* Col 3: Start Date */}
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', backgroundColor: 'rgba(229, 138, 62, 0.08)', padding: '0.2rem 0.6rem', borderRadius: '12px', border: '1px solid rgba(229, 138, 62, 0.2)' }}>
              <Calendar size={12} style={{ color: '#1e3449' }} />
              {task.plannedStartDate ? formatDateFriendly(task.plannedStartDate) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
            </span>

            {/* Col 4: Assignee */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minWidth: 0, backgroundColor: 'var(--bg-tertiary)', padding: '0.2rem 0.6rem 0.2rem 0.2rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
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
                  <span style={{ fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
                    {assignedConsultant.name.split(' ')[0]}
                  </span>
                </>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', fontStyle: 'italic' }}>Unassigned</span>
              )}
            </div>

            {/* Col 5: Status */}
            <span className={`badge badge-${
              task.status === 'completed' ? 'success' : 
              task.status === 'in_progress' ? 'primary' : 
              task.status === 'on_hold' ? 'warning' : 'secondary'
            }`} style={{ fontSize: '0.72rem', textAlign: 'center', whiteSpace: 'nowrap', padding: '0.2rem 0.6rem' }}>
              {task.status.replace('_', ' ')}
            </span>

            {/* Col 6: Actions — hidden by default, visible on hover */}
            <div className="task-node-actions" onClick={e => e.stopPropagation()}>
              {canEditTask(activeRole) && (
                <>
                  {!isTaskParent && (
                    <>
                      <button 
                        className="btn btn-secondary btn-icon"
                        title="Sync to MS To-Do"
                        disabled={syncingTaskId === task.id}
                        onClick={() => handleSyncToO365(task)}
                        style={{ color: task.o365TaskId ? 'var(--success)' : 'inherit', padding: '0.25rem' }}
                      >
                        <RefreshCw size={13} className={syncingTaskId === task.id ? 'animate-spin' : ''} />
                      </button>
                      <button 
                        className="btn btn-secondary btn-icon"
                        title="Schedule Calendar Event"
                        onClick={() => handleOpenCalendarModal(task)}
                        style={{ color: task.o365CalendarEventId ? 'var(--accent)' : 'inherit', padding: '0.25rem' }}
                      >
                        <Calendar size={13} />
                      </button>
                    </>
                  )}
                  <button className="btn btn-secondary btn-icon" onClick={() => handleOpenEditTask(task)} style={{ padding: '0.25rem' }}>
                    <Edit2 size={13} />
                  </button>
                </>
              )}
              {canDeleteTask(activeRole) && (
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

  return (
    <div>
      {/* Project Selector Header */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select 
          className="form-select" 
          style={{ maxWidth: '340px', fontSize: '0.9rem', fontWeight: 600 }}
          value={selectedProjectId || ''}
          onChange={(e) => onSelectProject(e.target.value || null)}
        >
          <option value="">-- Select Project --</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.clientName})</option>
          ))}
        </select>

        {canCreateProject(activeRole) && (
          <button className="btn btn-primary" onClick={() => setIsNewProjectModalOpen(true)} style={{ whiteSpace: 'nowrap' }}>
            <Plus size={16} /> New Project
          </button>
        )}

        {activeProject && canEditProject(activeRole) && (
          <div style={{ display: 'flex', gap: '0.35rem', marginLeft: 'auto' }}>
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
            >
              <RefreshCw size={14} /> Duplicate
            </button>
            <button 
              className="btn btn-ghost"
              onClick={() => {
                setTemplateForm({ name: `${activeProject.name} Template` });
                setIsTemplateSaveModalOpen(true);
              }}
              title="Save as Template"
            >
              <FolderKanban size={14} /> Template
            </button>
            <button 
              className="btn btn-ghost"
              onClick={() => {
                setEditProjectForm({
                  id: activeProject.id,
                  name: activeProject.name,
                  clientName: activeProject.clientName,
                  description: activeProject.description || '',
                  budgetDays: activeProject.budgetDays,
                  startDate: activeProject.startDate,
                  targetGoLiveDate: activeProject.targetGoLiveDate || '',
                  consultantIds: activeProject.consultantIds
                });
                setIsEditProjectModalOpen(true);
              }}
              title="Amend Project"
            >
              <Edit2 size={14} /> Amend
            </button>
            <button 
              className="btn btn-ghost" 
              style={{ color: 'var(--danger)' }}
              onClick={() => {
                if (confirm(`Are you sure you want to delete project "${activeProject.name}" and all its tasks?`)) {
                  onDeleteProject(activeProject.id);
                  onSelectProject(null);
                  onAddToast('Project deleted successfully.', 'warning');
                }
              }}
              title="Delete Project"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {activeProject ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Project Header Card */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
              {/* Left Side: General Project Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="badge badge-primary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', fontWeight: 600 }}>
                    Client: {activeProject.clientName}
                  </span>
                </div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {activeProject.name}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.45', margin: 0 }}>
                  {activeProject.description || 'No description provided.'}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '0.25rem 0.6rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }}></span>
                    Start: <b>{formatDateFriendly(activeProject.startDate)}</b>
                  </span>
                  {activeProject.targetGoLiveDate && (
                    <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '0.25rem 0.6rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent)' }}></span>
                      Target Go-Live: <b>{formatDateFriendly(activeProject.targetGoLiveDate)}</b>
                    </span>
                  )}
                </div>
              </div>

              {/* Right Side: Smart summary table */}
              <div style={{ 
                backgroundColor: 'var(--bg-secondary)', 
                border: '1px solid var(--border-color)', 
                borderRadius: 'var(--radius-md)', 
                overflow: 'hidden' 
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-strong)' }}>
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em' }}>Summary Metric</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em', textAlign: 'right' }}>Target / Total</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em', textAlign: 'right' }}>Scheduled / Done</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em', textAlign: 'right' }}>Status / Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, color: 'var(--text-primary)' }}>Time Budget</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{activeProject.budgetDays.toFixed(1)}d</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{totalAllocatedDuration.toFixed(1)}d</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                        {isOverBudget ? (
                          <span className="badge badge-danger" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                            Over by {(totalAllocatedDuration - activeProject.budgetDays).toFixed(1)}d
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                            {(activeProject.budgetDays - totalAllocatedDuration).toFixed(1)}d left
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, color: 'var(--text-primary)' }}>Task Completion</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{totalLeafTasks} tasks</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{completedLeafTasks} done</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                        <span className={`badge ${completedPercentage === 100 ? 'badge-success' : 'badge-primary'}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                          {completedPercentage}%
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, color: 'var(--text-primary)' }}>Billed Progress</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{totalLeafTasks} tasks</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{totalBilledTasks} billed</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                        <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}>
                          {billedPercentage}%
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Tasks Operations Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.2rem' }}>Implementation Tasks</h3>
            {canCreateTask(activeRole) && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button 
                  className={`btn ${editMode ? 'btn-accent' : 'btn-secondary'}`}
                  onClick={() => {
                    setEditMode(!editMode);
                    setSelectedTaskIds([]);
                  }}
                  title={editMode ? 'Exit edit mode' : 'Enter edit mode — click any task to edit'}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Pencil size={14} />
                  {editMode ? 'Exit Edit Mode' : 'Edit Mode'}
                </button>
                <button className="btn btn-primary" onClick={handleOpenCreateTask}>
                  <Plus size={16} /> Add Task
                </button>
              </div>
            )}
          </div>

          {/* Filters Row */}
          <div style={{ 
            display: 'flex', 
            gap: '1.25rem', 
            alignItems: 'center', 
            backgroundColor: 'var(--bg-secondary)', 
            padding: '0.75rem 1.25rem', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            marginBottom: '1rem'
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Filters:
            </span>

            {/* Hide Completed */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
              <input 
                type="checkbox" 
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Hide Completed</span>
            </label>

            <span style={{ color: 'var(--border-color)', height: '15px', borderLeft: '1px solid currentColor' }} />

            {/* Billed Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Billing:</span>
              <select 
                className="form-select" 
                style={{ padding: '0.2rem 1.5rem 0.2rem 0.5rem', fontSize: '0.8rem', width: 'auto', minWidth: '120px' }}
                value={billedFilter}
                onChange={(e) => setBilledFilter(e.target.value as 'all' | 'only' | 'hide')}
              >
                <option value="all">Show All</option>
                <option value="only">Show Only Billed</option>
                <option value="hide">Hide Billed</option>
              </select>
            </div>

            <span style={{ color: 'var(--border-color)', height: '15px', borderLeft: '1px solid currentColor' }} />

            {/* Assignee Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Assignee:</span>
              <select 
                className="form-select" 
                style={{ padding: '0.2rem 1.5rem 0.2rem 0.5rem', fontSize: '0.8rem', width: 'auto', minWidth: '140px' }}
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
              >
                <option value="all">All Assignees</option>
                <option value="unassigned">Unassigned</option>
                {consultants.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <span style={{ color: 'var(--border-color)', height: '15px', borderLeft: '1px solid currentColor' }} />

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Status:</span>
              <select 
                className="form-select" 
                style={{ padding: '0.2rem 1.5rem 0.2rem 0.5rem', fontSize: '0.8rem', width: 'auto', minWidth: '130px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Task Tree Container */}
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            {projectTasks.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '3rem' }}>
                No tasks created yet for this project. Click 'Add Task' to build your implementation checklist.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: '750px' }}>
                {/* Column Headers - matching grid */}
                <div 
                  style={{ 
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 140px 150px 120px 100px',
                    alignItems: 'center',
                    padding: '0.7rem 1.5rem',
                    gap: '1.25rem',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderBottom: '1px solid var(--border-strong)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {editMode && (
                      <input
                        type="checkbox"
                        checked={projectTasks.length > 0 && selectedTaskIds.length === projectTasks.length}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelectedTaskIds(checked ? projectTasks.map(t => t.id) : []);
                        }}
                        style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                      />
                    )}
                    Task Name
                  </span>
                  <span style={{ textAlign: 'center' }}>Duration</span>
                  <span style={{ textAlign: 'center' }}>Start Date</span>
                  <span style={{ textAlign: 'center' }}>Assignee</span>
                  <span style={{ textAlign: 'center' }}>Status</span>
                  <span style={{ textAlign: 'center' }}>Actions</span>
                </div>
                {renderTaskTree(null, 0, '')}
              </div>
            )}
          </div>
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

      {/* CREATE PROJECT MODAL */}
      {isNewProjectModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Create Sage Intacct Project</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setIsNewProjectModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateProjectSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Base on Template (Optional)</label>
                  <select 
                    className="form-select"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    <option value="">-- Start from Scratch (No Template) --</option>
                    {projectTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Project Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Sage Intacct Core Phase 1" 
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Client Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Acme Corp" 
                    value={newProject.clientName}
                    onChange={(e) => setNewProject({ ...newProject, clientName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea 
                    className="form-textarea" 
                    placeholder="Describe the scope of implementation..."
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  />
                </div>
                <div className="grid-cols-12">
                  <div className="form-group col-span-4">
                    <label className="form-label">Total Time Budget (Days)</label>
                    <input 
                      type="number" 
                      step="0.5"
                      min="0.5"
                      className="form-input" 
                      value={newProject.budgetDays}
                      onChange={(e) => setNewProject({ ...newProject, budgetDays: parseFloat(e.target.value) || 0 })}
                      required
                    />
                  </div>
                  <div className="form-group col-span-4">
                    <label className="form-label">Project Start Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={newProject.startDate}
                      onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group col-span-4">
                    <label className="form-label">Target Go-Live Date (Optional)</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={newProject.targetGoLiveDate}
                      onChange={(e) => setNewProject({ ...newProject, targetGoLiveDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewProjectModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AMEND PROJECT MODAL */}
      {isEditProjectModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Amend Project Details</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setIsEditProjectModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditProjectSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Project Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Sage Intacct Core Phase 1" 
                    value={editProjectForm.name}
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Client Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Acme Corp" 
                    value={editProjectForm.clientName}
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, clientName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea 
                    className="form-textarea" 
                    placeholder="Describe the scope of implementation..."
                    value={editProjectForm.description}
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, description: e.target.value })}
                  />
                </div>
                <div className="grid-cols-12">
                  <div className="form-group col-span-4">
                    <label className="form-label">Total Time Budget (Days)</label>
                    <input 
                      type="number" 
                      step="0.5"
                      min="0.5"
                      className="form-input" 
                      value={editProjectForm.budgetDays}
                      onChange={(e) => setEditProjectForm({ ...editProjectForm, budgetDays: parseFloat(e.target.value) || 0 })}
                      required
                    />
                  </div>
                  <div className="form-group col-span-4">
                    <label className="form-label">Project Start Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={editProjectForm.startDate}
                      onChange={(e) => setEditProjectForm({ ...editProjectForm, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group col-span-4">
                    <label className="form-label">Target Go-Live Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={editProjectForm.targetGoLiveDate}
                      onChange={(e) => setEditProjectForm({ ...editProjectForm, targetGoLiveDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditProjectModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
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
                      <label className="form-label">Task Name</label>
                      <input 
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
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Calendar size={12} /> Start Date
                        </label>
                        <input 
                          type="date" 
                          className="form-input" 
                          value={taskForm.customStartDate || ''}
                          onChange={(e) => setTaskForm({ ...taskForm, customStartDate: e.target.value })}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={12} /> Duration (Days)
                        </label>
                        <input 
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
                        <select 
                          className="form-select"
                          value={taskForm.parentId}
                          onChange={(e) => setTaskForm({ ...taskForm, parentId: e.target.value })}
                        >
                          <option value="">None (Top-Level)</option>
                          {projectTasks
                            .filter(t => t.id !== editingTask?.id && !isParent(t.id))
                            .map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Task Status</label>
                        <select 
                          className="form-select"
                          value={taskForm.status}
                          onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as Task['status'] })}
                        >
                          <option value="not_started">Not Started</option>
                          <option value="in_progress">In Progress</option>
                          <option value="on_hold">On Hold</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>

                    {/* Pink Number & Billed Checkbox */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.75rem', alignItems: 'center' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Pink Number</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="e.g. PN-12345" 
                          value={taskForm.pinkNumber}
                          onChange={(e) => setTaskForm({ ...taskForm, pinkNumber: e.target.value })}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', height: '100%', paddingTop: '1.4rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                          <input 
                            type="checkbox" 
                            checked={taskForm.billed}
                            onChange={(e) => setTaskForm({ ...taskForm, billed: e.target.checked })}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <span>Billed</span>
                        </label>
                      </div>
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
                      <select 
                        className="form-select"
                        value={taskForm.assignedConsultantId}
                        onChange={(e) => setTaskForm({ ...taskForm, assignedConsultantId: e.target.value })}
                      >
                        <option value="">Unassigned</option>
                        {consultants.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Predecessors (Dependencies)</label>
                      <div style={{ 
                        maxHeight: '140px', 
                        overflowY: 'auto', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: 'var(--radius-md)',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--bg-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                      }}>
                        {projectTasks.filter(t => t.id !== editingTask?.id).length === 0 ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                            No other tasks available for dependency links.
                          </span>
                        ) : (
                          projectTasks
                            .filter(t => t.id !== editingTask?.id)
                            .map(t => (
                              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.15rem 0', fontSize: '0.825rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <input 
                                  type="checkbox" 
                                  checked={taskForm.predecessorIds.includes(t.id)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setTaskForm(prev => ({
                                      ...prev,
                                      predecessorIds: checked 
                                        ? [...prev.predecessorIds, t.id]
                                        : prev.predecessorIds.filter(id => id !== t.id)
                                    }));
                                  }}
                                  style={{ cursor: 'pointer' }}
                                />
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{t.name}</span>
                              </label>
                            ))
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
                  <label className="form-label">Task Description</label>
                  <textarea 
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
                      <input 
                        type="checkbox"
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

      {/* SCHEDULE OUTLOOK CALENDAR APPOINTMENT MODAL */}
      {isCalendarModalOpen && calendarTask && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Schedule Outlook Calendar Invite</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setIsCalendarModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCalendarSubmit}>
              <div className="modal-body">
                <div 
                  style={{ 
                    backgroundColor: 'var(--accent-light)', 
                    color: 'var(--accent)', 
                    padding: '0.75rem 1rem', 
                    borderRadius: 'var(--radius-md)', 
                    fontSize: '0.85rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    marginBottom: '1.25rem' 
                  }}
                >
                  <MailCheck size={16} />
                  <span>Will create a Microsoft Teams invite inside your Outlook Business Calendar.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={calendarForm.title}
                    onChange={(e) => setCalendarForm({ ...calendarForm, title: e.target.value })}
                    required
                  />
                </div>

                <div className="grid-cols-12">
                  <div className="form-group col-span-6">
                    <label className="form-label">Start Time</label>
                    <input 
                      type="time" 
                      className="form-input" 
                      value={calendarForm.startTime}
                      onChange={(e) => setCalendarForm({ ...calendarForm, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group col-span-6">
                    <label className="form-label">End Time</label>
                    <input 
                      type="time" 
                      className="form-input" 
                      value={calendarForm.endTime}
                      onChange={(e) => setCalendarForm({ ...calendarForm, endTime: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Description / Agenda</label>
                  <textarea 
                    className="form-textarea" 
                    rows={4}
                    value={calendarForm.description}
                    onChange={(e) => setCalendarForm({ ...calendarForm, description: e.target.value })}
                  />
                </div>

                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}>
                      <User size={14} /> 
                      Invited Assignee: <b>
                        {consultants.find(c => c.id === calendarTask.assignedConsultantId)?.name || 'Unassigned'}
                      </b>
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={calendarForm.sendInvites}
                        onChange={(e) => setCalendarForm({ ...calendarForm, sendInvites: e.target.checked })}
                      />
                      <span>Send email invite</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCalendarModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-accent" disabled={schedulingEvent}>
                  {schedulingEvent ? 'Sending invite...' : 'Create Invite'}
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
                  <label className="form-label">New Project Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={duplicateForm.name}
                    onChange={(e) => setDuplicateForm({ ...duplicateForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">New Client Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={duplicateForm.clientName}
                    onChange={(e) => setDuplicateForm({ ...duplicateForm, clientName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">New Project Start Date</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={duplicateForm.startDate}
                    onChange={(e) => setDuplicateForm({ ...duplicateForm, startDate: e.target.value })}
                    required
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input 
                    type="checkbox"
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
                  <label className="form-label">Template Reference Name</label>
                  <input 
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
              <select 
                className="form-select" 
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto', width: 'auto', minWidth: '120px' }}
                onChange={(e) => {
                  handleBulkStatusChange(e.target.value as Task['status']);
                  e.target.value = '';
                }}
                defaultValue=""
              >
                <option value="" disabled>Change Status...</option>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            {/* Assignee Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Assignee:</span>
              <select 
                className="form-select" 
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto', width: 'auto', minWidth: '140px' }}
                onChange={(e) => {
                  handleBulkAssigneeChange(e.target.value);
                  e.target.value = '';
                }}
                defaultValue=""
              >
                <option value="" disabled>Change Assignee...</option>
                <option value="unassigned">Unassigned</option>
                {consultants.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Billed Select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Billing:</span>
              <select 
                className="form-select" 
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 'auto', width: 'auto', minWidth: '130px' }}
                onChange={(e) => {
                  handleBulkBillingChange(e.target.value === 'billed');
                  e.target.value = '';
                }}
                defaultValue=""
              >
                <option value="" disabled>Change Billing...</option>
                <option value="billed">Mark as Billed</option>
                <option value="unbilled">Mark as Unbilled</option>
              </select>
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

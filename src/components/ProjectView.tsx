import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Project, Task, Consultant, O365Config } from '../types';
import { 
  Plus, Calendar, Trash2, Edit2, ChevronDown, ChevronRight, 
  AlertTriangle, RefreshCw, MailCheck, User, ArrowRight, X, Clock, FolderKanban, Pencil
} from 'lucide-react';
import { syncTaskToO365, createOutlookCalendarEvent } from '../utils/o365';

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
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  projectTemplates: Project[];
  onDuplicateProject: (projectId: string, config: { name: string; clientName: string; startDate: string; copyAssignments: boolean }) => void;
  onSaveAsTemplate: (projectId: string, templateName: string) => void;
  activeUserId: string;
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
  onAddToast,
  projectTemplates,
  onDuplicateProject,
  onSaveAsTemplate,
  activeUserId
}: ProjectViewProps) {
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
    status: 'not_started' as Task['status']
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

  // Active Project Data
  const activeProject = projects.find(p => p.id === selectedProjectId) || null;
  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
  
  // Calculate Budgets
  // Note: Parent tasks will be excluded from budget totals to avoid double counting.
  const isParent = (taskId: string) => tasks.some(t => t.parentId === taskId);
  const leafTasks = projectTasks.filter(t => !isParent(t.id));
  const totalAllocatedDuration = leafTasks.reduce((acc, t) => acc + t.durationDays, 0);
  const isOverBudget = activeProject ? totalAllocatedDuration > activeProject.budgetDays : false;

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
      status: 'not_started'
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
      status: task.status
    });
    setIsTaskModalOpen(true);
  };

  // Handle Task Submit
  const handleTaskSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !taskForm.name) return;

    const taskData = {
      projectId: selectedProjectId,
      name: taskForm.name,
      description: taskForm.description,
      durationDays: parseFloat(taskForm.durationDays.toString()),
      assignedConsultantId: taskForm.assignedConsultantId || null,
      parentId: taskForm.parentId || null,
      predecessorIds: taskForm.predecessorIds,
      status: taskForm.status
    };

    if (editingTask) {
      onUpdateTask({ ...editingTask, ...taskData });
      // Apply assignee, status changes to subtasks if checkbox is checked
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
        for (const subtaskId of subtaskIds) {
          const subtask = tasks.find(t => t.id === subtaskId);
          if (subtask) {
            const updates: Partial<typeof subtask> = {};
            if (taskData.assignedConsultantId) updates.assignedConsultantId = taskData.assignedConsultantId;
            if (taskData.status) updates.status = taskData.status;
            onUpdateTask({ ...subtask, ...updates });
          }
        }
      }
      setApplyToSubtasks(false);
      onAddToast('Task updated successfully!', 'success');
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

  // Recursively render hierarchical tasks
  const renderTaskTree = (parentId: string | null, depth = 0) => {
    const levelTasks = projectTasks.filter(t => t.parentId === parentId);
    
    return levelTasks.map(task => {
      const isTaskParent = isParent(task.id);
      const isExpanded = expandedTasks[task.id] !== false; // expanded by default
      const assignedConsultant = consultants.find(c => c.id === task.assignedConsultantId);

      return (
        <div key={task.id} style={{ display: 'flex', flexDirection: 'column' }}>
          <div 
            className={`task-node-row ${isTaskParent ? 'task-parent-row' : ''} ${editMode ? 'task-node-editable' : ''}`}
            style={{ 
              borderBottom: '1px solid var(--border-color)',
              opacity: task.status === 'completed' ? 0.55 : 1,
              display: 'grid',
              gridTemplateColumns: '1fr 60px 200px 140px 100px 100px',
              alignItems: 'center',
              padding: isTaskParent ? '0.85rem 1.5rem' : '0.7rem 1.5rem',
              gap: '1.25rem',
              cursor: editMode ? 'pointer' : 'default',
              minHeight: isTaskParent ? '52px' : '46px'
            }}
            onClick={() => { if (editMode) handleOpenEditTask(task); }}
          >
            {/* Col 1: Task Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: `${depth * 22}px`, minWidth: 0 }}>
              {editMode && (
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
                    fontWeight: isTaskParent ? 600 : 400,
                    fontSize: isTaskParent ? '0.95rem' : '0.88rem',
                    color: isTaskParent ? 'var(--primary-dark)' : 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.4
                  }}
                  title={task.name}
                >
                  {task.name}
                </span>
                {task.description && !isTaskParent && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{task.description.split('\n')[0]}</span>
                )}
              </div>
            </div>

            {/* Col 2: Duration */}
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.84rem', justifyContent: 'flex-end', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              <Clock size={12} style={{ opacity: 0.5 }} /> {task.durationDays}d
            </span>

            {/* Col 3: Scheduled dates */}
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {task.plannedStartDate ? (
                <>{task.plannedStartDate} <ArrowRight size={10} style={{ display: 'inline', margin: '0 3px', verticalAlign: 'middle', opacity: 0.4 }} /> {task.plannedEndDate}</>
              ) : (
                <span style={{ color: 'var(--text-tertiary)' }}>—</span>
              )}
            </span>

            {/* Col 4: Assignee */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
              {assignedConsultant ? (
                <>
                  <span 
                    style={{ 
                      width: '22px', height: '22px', borderRadius: '50%', 
                      backgroundColor: assignedConsultant.avatarColor,
                      color: 'white', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '0.58rem', fontWeight: 'bold',
                      flexShrink: 0, letterSpacing: '-0.02em'
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
            </div>
          </div>
          
          {/* Render children recursively */}
          {isTaskParent && isExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {renderTaskTree(task.id, depth + 1)}
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

        {activeUserId === 'admin' && (
          <button className="btn btn-primary" onClick={() => setIsNewProjectModalOpen(true)} style={{ whiteSpace: 'nowrap' }}>
            <Plus size={16} /> New Project
          </button>
        )}

        {activeProject && activeUserId === 'admin' && (
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
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{activeProject.name}</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{activeProject.description || 'No description provided.'}</p>
                <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-tertiary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span>Client: <b>{activeProject.clientName}</b></span>
                  <span>•</span>
                  <span>Start Date: <b>{activeProject.startDate}</b></span>
                  {activeProject.targetGoLiveDate && (
                    <>
                      <span>•</span>
                      <span>Target Go-Live: <b style={{ color: 'var(--accent)' }}>{activeProject.targetGoLiveDate}</b></span>
                    </>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span className="badge badge-secondary" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>
                  Budget: <b>{activeProject.budgetDays} days</b>
                </span>
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  Total Scheduled: <b style={{ color: isOverBudget ? 'var(--danger)' : 'var(--success)' }}>{totalAllocatedDuration} days</b>
                </div>
              </div>
            </div>

            {/* Overbudget warning */}
            {isOverBudget && (
              <div 
                style={{ 
                  marginTop: '1.25rem', 
                  backgroundColor: 'var(--danger-light)', 
                  border: '1px solid var(--danger)',
                  color: 'var(--danger)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                <AlertTriangle size={20} />
                <div>
                  <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Project Time Budget Exceeded!</h4>
                  <p style={{ fontSize: '0.825rem', marginTop: '0.15rem' }}>
                    Scheduled tasks total <b>{totalAllocatedDuration} days</b>, which exceeds the budget of <b>{activeProject.budgetDays} days</b> by <b>{(totalAllocatedDuration - activeProject.budgetDays).toFixed(1)} days</b>.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tasks Operations Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.2rem' }}>Implementation Tasks</h3>
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
          </div>

          {/* Task Tree Container */}
          <div className="card" style={{ padding: 0 }}>
            {projectTasks.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '3rem' }}>
                No tasks created yet for this project. Click 'Add Task' to build your implementation checklist.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Column Headers - matching grid */}
                <div 
                  style={{ 
                    display: 'grid',
                    gridTemplateColumns: '1fr 60px 200px 140px 100px 100px',
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
                  <span style={{ textAlign: 'right' }}>Duration</span>
                  <span>Dates (AM/PM)</span>
                  <span>Assignee</span>
                  <span>Status</span>
                  <span style={{ textAlign: 'right' }}>Actions</span>
                </div>
                {renderTaskTree(null)}
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
          <div className="modal-container">
            <div className="modal-header">
              <h3>{editingTask ? 'Edit Task' : 'Add Implementation Task'}</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setIsTaskModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleTaskSubmit}>
              <div className="modal-body">
                <div className="form-group">
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
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea 
                    className="form-textarea" 
                    placeholder="Provide execution steps or details..."
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  />
                </div>
                
                <div className="grid-cols-12">
                  <div className="form-group col-span-6">
                    <label className="form-label">Duration (Days, in 0.5 units)</label>
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
                  
                  <div className="form-group col-span-6">
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
                </div>

                <div className="grid-cols-12">
                  <div className="form-group col-span-6">
                    <label className="form-label">Parent Task (Nest Under)</label>
                    <select 
                      className="form-select"
                      value={taskForm.parentId}
                      onChange={(e) => setTaskForm({ ...taskForm, parentId: e.target.value })}
                    >
                      <option value="">None (Top-Level)</option>
                      {projectTasks
                        .filter(t => t.id !== editingTask?.id && !isParent(t.id)) // prevent choosing self or leaf-to-parent transitions
                        .map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                  </div>
                  
                  <div className="form-group col-span-6">
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

                <div className="form-group">
                  <label className="form-label">Predecessors (Dependencies)</label>
                  <div style={{ 
                    maxHeight: '120px', 
                    overflowY: 'auto', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: 'var(--radius-md)',
                    padding: '0.5rem'
                  }}>
                    {projectTasks.filter(t => t.id !== editingTask?.id).length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No other tasks to link dependencies to.</span>
                    ) : (
                      projectTasks
                        .filter(t => t.id !== editingTask?.id)
                        .map(t => (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.85rem', cursor: 'pointer' }}>
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
                            />
                            <span>{t.name}</span>
                          </label>
                        ))
                    )}
                  </div>
                </div>

                {/* Apply to Subtasks — only shown when editing a parent task */}
                {editingTask && isParent(editingTask.id) && (
                  <div style={{ 
                    padding: '0.75rem 1rem', 
                    backgroundColor: 'var(--primary-light)', 
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    marginTop: '0.5rem'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                      <input 
                        type="checkbox"
                        checked={applyToSubtasks}
                        onChange={(e) => setApplyToSubtasks(e.target.checked)}
                      />
                      Apply assignee & status changes to all sub-tasks
                    </label>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', display: 'block', marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
                      When checked, the selected assignee and status will also be applied to every child task under this parent.
                    </span>
                  </div>
                )}

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsTaskModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingTask ? 'Save Changes' : 'Create Task'}</button>
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

import { useState } from 'react';
import type { Project, Consultant, Task, ActiveUser } from '../types';
import { formatDateFriendly } from '../utils/dates';
import { Plus, Search, Trash2, LayoutGrid, List, Users, CheckCircle2, Columns3, FolderSearch, X } from 'lucide-react';
import { WinComboBox } from './winui/WinComboBox';
import { resolvePhaseMeta, PHASE_ORDER } from '../utils/phases';
import { canSeeRag } from '../utils/permissions';
import { billableDays } from '../utils/scheduler';

interface ProjectsListProps {
  projects: Project[];
  tasks: Task[];
  consultants: Consultant[];
  onSelectProject: (id: string) => void;
  onCreateProject: (project: Omit<Project, 'id' | 'createdAt' | 'isTemplate'>) => void;
  onBulkUpdateProjects: (ids: string[], updates: Partial<Project>) => void;
  onBulkDeleteProjects: (ids: string[]) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  setIsNewProjectModalOpen: (val: boolean) => void;
  activeUser?: ActiveUser | null;
}

type ProjectsViewMode = 'grid' | 'list' | 'kanban';
type ProjectKanbanGroupMode = 'phase' | 'status' | 'lead' | 'rag';

interface ProjectKanbanColumn {
  id: string;
  label: string;
  projects: Project[];
}

const PROJECT_STATUS_OPTIONS: { label: string; value: Project['status'] }[] = [
  { label: 'New', value: 'new' },
  { label: 'In Progress', value: 'in progress' },
  { label: 'On Hold', value: 'on hold' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' }
];

const RAG_OPTIONS = [
  { label: 'On Track', value: 'green' },
  { label: 'At Risk', value: 'amber' },
  { label: 'Off Track', value: 'red' }
];

export default function ProjectsList({
  projects,
  tasks,
  consultants,
  onSelectProject,
  onBulkUpdateProjects,
  onBulkDeleteProjects,
  onAddToast,
  setIsNewProjectModalOpen,
  activeUser
}: ProjectsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [leadConsultantFilter, setLeadConsultantFilter] = useState<string>('all');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ProjectsViewMode>('list');
  const [kanbanGroupMode, setKanbanGroupMode] = useState<ProjectKanbanGroupMode>('phase');
  const [kanbanDragId, setKanbanDragId] = useState<string | null>(null);

  // Hide RAG / project-health from anyone who isn't allowed to see it (customers).
  const hideRag = activeUser ? !canSeeRag(activeUser) : false;
  
  // Bulk Action States
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkPM, setBulkPM] = useState<string>('');
  const [bulkLead, setBulkLead] = useState<string>('');
  const [bulkResource, setBulkResource] = useState<string>('');

  const activeProjects = projects.filter(p => !p.isTemplate);

  const filteredProjects = activeProjects.filter(p => {
    let match = true;
    if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase()) && !p.clientName.toLowerCase().includes(searchTerm.toLowerCase())) {
      match = false;
    }
    if (statusFilter !== 'all' && p.status !== statusFilter) {
      match = false;
    }
    if (phaseFilter !== 'all') {
      // Match a project's explicit phase, or the status-derived fallback phase
      const resolvedPhase = p.phase || getPhaseColors(p.phase, p.status).label;
      if (resolvedPhase !== phaseFilter) match = false;
    }
    if (healthFilter !== 'all') {
      const rag = (p.ragOverall || 'green').toLowerCase();
      const isGreen = rag === 'green';
      const isAmber = rag === 'amber';
      const isRed = rag === 'red';

      if (healthFilter === 'on track' && !isGreen) match = false;
      if (healthFilter === 'at risk' && !isAmber) match = false;
      if (healthFilter === 'off track' && !isRed) match = false;
    }
    if (leadConsultantFilter !== 'all' && p.leadConsultantId !== leadConsultantFilter) {
      match = false;
    }
    return match;
  });

  // Calculate project metrics
  const getProjectMetrics = (projectId: string, budgetDays: number) => {
    // Leaf tasks only (parents are roll-ups), and planned effort excludes
    // Customer-owned days — the same numbers the project Overview shows.
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    const parentIds = new Set(projectTasks.map(t => t.parentId).filter(Boolean));
    const leaves = projectTasks.filter(t => !parentIds.has(t.id));
    const completed = leaves.filter(t => t.status === 'completed');

    const progress = leaves.length > 0 ? Math.round((completed.length / leaves.length) * 100) : 0;
    const daysPlanned = Math.round(billableDays(leaves) * 10) / 10;
    const daysUsed = Math.round(billableDays(completed) * 10) / 10;
    const budgetPercentage = budgetDays > 0 ? Math.round((daysPlanned / budgetDays) * 100) : 0;
    const overBudget = budgetDays > 0 && daysPlanned > budgetDays;

    return { progress, daysUsed, daysPlanned, budgetPercentage, overBudget, taskCount: leaves.length };
  };

  const getHealthColors = (ragOverall?: string) => {
    const rag = (ragOverall || 'green').toLowerCase();
    if (rag === 'red') return { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', label: 'Off Track', dot: '#ef4444' };
    if (rag === 'amber') return { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', label: 'At Risk', dot: '#f59e0b' };
    return { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', label: 'On Track', dot: '#10b981' };
  };

  // Derive phase badge colors from the shared phase util.
  const getPhaseColors = (phase: string | null | undefined, status: string) => {
    const meta = resolvePhaseMeta({ phase, status });
    return { bg: meta.bg, text: meta.text, label: meta.label };
  };

  const getStatusDotColor = (status: string) => {
    switch(status) {
      case 'new': return '#3b82f6';
      case 'in progress': return '#8b5cf6';
      case 'on hold': return '#f59e0b';
      case 'completed': return '#10b981';
      case 'cancelled': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // filteredProjects is rebuilt each render, so memoizing on it never hit.
  const kanbanColumns = ((): ProjectKanbanColumn[] => {
    if (kanbanGroupMode === 'phase') {
      const customPhases = Array.from(new Set(filteredProjects.map(p => resolvePhaseMeta({ phase: p.phase, status: p.status }).label)))
        .filter(phase => !PHASE_ORDER.includes(phase));
      const phases = [...PHASE_ORDER, ...customPhases];
      return phases.map(phase => ({
        id: phase,
        label: phase,
        projects: filteredProjects.filter(p => resolvePhaseMeta({ phase: p.phase, status: p.status }).label === phase)
      }));
    }

    if (kanbanGroupMode === 'status') {
      return PROJECT_STATUS_OPTIONS.map(status => ({
        id: status.value,
        label: status.label,
        projects: filteredProjects.filter(p => p.status === status.value)
      }));
    }

    if (kanbanGroupMode === 'lead') {
      return [
        { id: '__unassigned', label: 'Unassigned', projects: filteredProjects.filter(p => !p.leadConsultantId) },
        ...consultants.map(consultant => ({
          id: consultant.id,
          label: consultant.name,
          projects: filteredProjects.filter(p => p.leadConsultantId === consultant.id)
        }))
      ];
    }

    return RAG_OPTIONS.map(rag => ({
      id: rag.value,
      label: rag.label,
      projects: filteredProjects.filter(p => (p.ragOverall || 'green').toLowerCase() === rag.value)
    }));
  })();

  const applyKanbanDrop = (columnId: string) => {
    if (!kanbanDragId) return;
    const project = activeProjects.find(p => p.id === kanbanDragId);
    if (!project) {
      setKanbanDragId(null);
      return;
    }

    if (kanbanGroupMode === 'phase') {
      if ((project.phase || getPhaseColors(project.phase, project.status).label) !== columnId) {
        onBulkUpdateProjects([project.id], { phase: columnId });
      }
    } else if (kanbanGroupMode === 'status') {
      if (project.status !== columnId) {
        onBulkUpdateProjects([project.id], { status: columnId as Project['status'] });
      }
    } else if (kanbanGroupMode === 'lead') {
      const leadConsultantId = columnId === '__unassigned' ? null : columnId;
      if ((project.leadConsultantId ?? null) !== leadConsultantId) {
        onBulkUpdateProjects([project.id], { leadConsultantId });
      }
    } else if ((project.ragOverall || 'green').toLowerCase() !== columnId) {
      onBulkUpdateProjects([project.id], { ragOverall: columnId });
    }

    setKanbanDragId(null);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedProjectIds(filteredProjects.map(p => p.id));
    } else {
      setSelectedProjectIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedProjectIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const applyBulkStatus = () => {
    if (!bulkStatus || selectedProjectIds.length === 0) return;
    onBulkUpdateProjects(selectedProjectIds, { status: bulkStatus as Project['status'] });
    setSelectedProjectIds([]);
    setBulkStatus('');
  };

  const applyBulkPM = () => {
    if (!bulkPM || selectedProjectIds.length === 0) return;
    onBulkUpdateProjects(selectedProjectIds, { projectManagerId: bulkPM === 'unassigned' ? null : bulkPM });
    setSelectedProjectIds([]);
    setBulkPM('');
  };

  const applyBulkLead = () => {
    if (!bulkLead || selectedProjectIds.length === 0) return;
    onBulkUpdateProjects(selectedProjectIds, { leadConsultantId: bulkLead === 'unassigned' ? null : bulkLead });
    setSelectedProjectIds([]);
    setBulkLead('');
  };

  const applyBulkResource = () => {
    if (!bulkResource || selectedProjectIds.length === 0) return;
    const projectsToUpdate = activeProjects.filter(p => selectedProjectIds.includes(p.id));
    
    projectsToUpdate.forEach(p => {
      const existing = p.projectResourceIds || [];
      if (bulkResource !== 'unassigned' && !existing.includes(bulkResource)) {
        onBulkUpdateProjects([p.id], { projectResourceIds: [...existing, bulkResource] });
      }
    });
    setSelectedProjectIds([]);
    setBulkResource('');
    onAddToast(`Resource assigned to ${selectedProjectIds.length} projects`, 'success');
  };

  const calculateDaysRemaining = (goLiveDate?: string, startDate?: string) => {
    const targetDateStr = goLiveDate || startDate;
    if (!targetDateStr) return 0;
    const targetDate = new Date(targetDateStr);
    const today = new Date();
    const diffTime = targetDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const renderProjectKanbanCard = (project: Project) => {
    const metrics = getProjectMetrics(project.id, project.budgetDays);
    const healthColors = getHealthColors(project.ragOverall);
    const phaseColors = getPhaseColors(project.phase, project.status);
    const lead = consultants.find(c => c.id === project.leadConsultantId);
    const projectCode = `PRJ-${project.id.substring(0, 5).toUpperCase()}`;
    const daysRemaining = calculateDaysRemaining(project.targetGoLiveDate, project.startDate);

    return (
      <div
        key={project.id}
        className="pl-kanban-card"
        draggable
        onDragStart={(e) => { setKanbanDragId(project.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => setKanbanDragId(null)}
        onClick={() => onSelectProject(project.id)}
        style={{ borderLeftColor: getStatusDotColor(project.status) }}
      >
        <div className="pl-kanban-card-top">
          <div className="pl-kanban-heading">
            <span className="pl-kanban-code">{projectCode}</span>
            <span className="pl-kanban-title">{project.name}</span>
            <span className="pl-kanban-client">{project.clientName}</span>
          </div>
          <input
            type="checkbox"
            className="win-checkbox"
            checked={selectedProjectIds.includes(project.id)}
            onChange={() => handleSelectOne(project.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div className="pl-kanban-badges">
          <span className="pl-kanban-pill" style={{ backgroundColor: phaseColors.bg, color: phaseColors.text, borderColor: `${phaseColors.text}30` }}>
            {phaseColors.label}
          </span>
          {!hideRag && (
          <span className="pl-kanban-pill" style={{ backgroundColor: healthColors.bg, color: healthColors.text, borderColor: `${healthColors.text}30` }}>
            <span className="pl-kanban-dot" style={{ backgroundColor: healthColors.dot }} />
            {healthColors.label}
          </span>
          )}
        </div>
        <div className="pl-kanban-progress">
          <div className="pl-kanban-progress-bar">
            <div style={{ width: `${metrics.progress}%`, backgroundColor: getStatusDotColor(project.status) }} />
          </div>
          <span>{metrics.progress}%</span>
        </div>
        <div className="pl-kanban-meta">
          <span>{metrics.taskCount} tasks</span>
          <span className={metrics.overBudget ? 'pl-over' : undefined} title="Planned effort / budget">{metrics.daysPlanned}/{project.budgetDays}d</span>
          <span>{daysRemaining >= 0 ? `${daysRemaining}d left` : `${Math.abs(daysRemaining)}d overdue`}</span>
        </div>
        <div className="pl-kanban-footer">
          {lead ? (
            <span className="pl-kanban-person">
              <span style={{ backgroundColor: lead.avatarColor }}>{lead.name.charAt(0)}</span>
              {lead.name}
            </span>
          ) : (
            <span className="pl-kanban-unassigned">No lead</span>
          )}
          <span className="pl-kanban-status">{project.status}</span>
        </div>
      </div>
    );
  };

  const filtersActive = searchTerm.trim() !== '' || statusFilter !== 'all' || phaseFilter !== 'all'
    || healthFilter !== 'all' || leadConsultantFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPhaseFilter('all');
    setHealthFilter('all');
    setLeadConsultantFilter('all');
  };
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const goLiveHint = (days: number) => days === 0 ? 'Today' : days > 0 ? `in ${days}d` : `${Math.abs(days)}d overdue`;

  const emptyState = (
    <div className="empty-state">
      <FolderSearch size={28} aria-hidden="true" />
      {filtersActive ? (
        <>
          <strong>No projects match these filters</strong>
          <span>Try a different search or clear the filters to see everything.</span>
          <button type="button" className="btn btn-secondary" onClick={clearFilters}><X size={15} /> Clear filters</button>
        </>
      ) : (
        <>
          <strong>No projects yet</strong>
          <span>Create your first implementation project to start planning tasks.</span>
          <button type="button" className="btn btn-primary" onClick={() => setIsNewProjectModalOpen(true)}><Plus size={15} /> New project</button>
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Toolbar: search, filters, view switch, count, primary action */}
      <div className="toolbar">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="form-input"
            placeholder="Search projects…"
            aria-label="Search projects"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </label>

        <div className="toolbar-filter">
          <WinComboBox
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: 'All statuses', value: 'all' },
              ...PROJECT_STATUS_OPTIONS
            ]}
          />
        </div>

        <div className="toolbar-filter">
          <WinComboBox
            value={phaseFilter}
            onChange={setPhaseFilter}
            options={[
              { label: 'All phases', value: 'all' },
              ...PHASE_ORDER.map(p => ({ label: p, value: p }))
            ]}
          />
        </div>

        {!hideRag && (
        <div className="toolbar-filter">
          <WinComboBox
            value={healthFilter}
            onChange={setHealthFilter}
            options={[
              { label: 'All health', value: 'all' },
              { label: 'On Track', value: 'on track' },
              { label: 'At Risk', value: 'at risk' },
              { label: 'Off Track', value: 'off track' }
            ]}
          />
        </div>
        )}

        <div className="toolbar-filter">
          <WinComboBox
            value={leadConsultantFilter}
            onChange={setLeadConsultantFilter}
            options={[
              { label: 'All leads', value: 'all' },
              ...consultants.map(c => ({ label: c.name, value: c.id }))
            ]}
          />
        </div>

        {viewMode === 'kanban' && (
          <div className="toolbar-filter">
            <WinComboBox
              value={kanbanGroupMode}
              onChange={(v) => setKanbanGroupMode(v as ProjectKanbanGroupMode)}
              options={[
                { label: 'Group by phase', value: 'phase' },
                { label: 'Group by status', value: 'status' },
                { label: 'Group by lead', value: 'lead' },
                ...(hideRag ? [] : [{ label: 'Group by RAG', value: 'rag' }])
              ]}
            />
          </div>
        )}

        {filtersActive && (
          <button type="button" className="btn btn-ghost toolbar-clear" onClick={clearFilters}>
            <X size={14} /> Clear
          </button>
        )}

        <span className="toolbar-count">{filteredProjects.length} of {activeProjects.length} projects</span>

        <div className="seg" role="group" aria-label="View">
          <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} title="Grid view" aria-label="Grid view"><LayoutGrid size={16} /></button>
          <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} title="List view" aria-label="List view"><List size={16} /></button>
          <button type="button" className={viewMode === 'kanban' ? 'active' : ''} onClick={() => setViewMode('kanban')} title="Kanban view" aria-label="Kanban view"><Columns3 size={16} /></button>
        </div>

        <button className="btn btn-primary" onClick={() => setIsNewProjectModalOpen(true)}>
          <Plus size={16} /> New project
        </button>
      </div>

      {selectedProjectIds.length > 0 && (
        <div className="card" style={{ padding: '1.1rem 1.5rem', backgroundColor: 'var(--primary-light)', border: '1px solid var(--primary)', display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 30, overflow: 'visible' }}>
          <span style={{ fontWeight: 700, color: 'var(--primary-dark)', fontSize: '1rem' }}>
            {selectedProjectIds.length} projects selected
          </span>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', borderLeft: '1px solid var(--primary)', paddingLeft: '1.25rem', minWidth: '220px', flex: '1 1 220px' }}>
            <WinComboBox
              value={bulkStatus}
              onChange={(val) => { setBulkStatus(val); }}
              options={[
                { label: 'Change Status...', value: '' },
                { label: 'New', value: 'new' },
                { label: 'In Progress', value: 'in progress' },
                { label: 'On Hold', value: 'on hold' },
                { label: 'Completed', value: 'completed' },
                { label: 'Cancelled', value: 'cancelled' }
              ]}
            />
            <button className="btn btn-secondary" disabled={!bulkStatus} onClick={applyBulkStatus} style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}>Apply</button>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', borderLeft: '1px solid var(--primary)', paddingLeft: '1.25rem', minWidth: '220px', flex: '1 1 220px' }}>
            <WinComboBox
              value={bulkPM}
              onChange={(val) => { setBulkPM(val); }}
              options={[
                { label: 'Assign PM...', value: '' },
                { label: 'Unassigned', value: 'unassigned' },
                ...consultants.map(c => ({ label: c.name, value: c.id }))
              ]}
            />
            <button className="btn btn-secondary" disabled={!bulkPM} onClick={applyBulkPM} style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}>Apply</button>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', borderLeft: '1px solid var(--primary)', paddingLeft: '1.25rem', minWidth: '220px', flex: '1 1 220px' }}>
            <WinComboBox
              value={bulkLead}
              onChange={(val) => { setBulkLead(val); }}
              options={[
                { label: 'Assign Lead...', value: '' },
                { label: 'Unassigned', value: 'unassigned' },
                ...consultants.map(c => ({ label: c.name, value: c.id }))
              ]}
            />
            <button className="btn btn-secondary" disabled={!bulkLead} onClick={applyBulkLead} style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}>Apply</button>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', borderLeft: '1px solid var(--primary)', paddingLeft: '1.25rem', minWidth: '220px', flex: '1 1 220px' }}>
            <WinComboBox
              value={bulkResource}
              onChange={(val) => { setBulkResource(val); }}
              options={[
                { label: 'Add Resource...', value: '' },
                ...consultants.map(c => ({ label: c.name, value: c.id }))
              ]}
            />
            <button className="btn btn-secondary" disabled={!bulkResource} onClick={applyBulkResource} style={{ padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}>Apply</button>
          </div>

          <button
            className="btn btn-secondary"
            style={{ color: 'var(--danger)', marginLeft: 'auto', padding: '0.5rem 0.85rem', fontSize: '0.9rem' }}
            onClick={() => {
              if (confirm(`Delete ${selectedProjectIds.length} selected projects?`)) {
                onBulkDeleteProjects(selectedProjectIds);
                setSelectedProjectIds([]);
              }
            }}
          >
            <Trash2 size={16} style={{ marginRight: '0.25rem' }} /> Delete
          </button>
        </div>
      )}

      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: '1.5rem' }}>
          {filteredProjects.map(project => {
            const metrics = getProjectMetrics(project.id, project.budgetDays);
            const healthColors = getHealthColors(project.ragOverall);
            const phaseColors = getPhaseColors(project.phase, project.status);
            const projectCode = `PRJ-${project.id.substring(0, 5).toUpperCase()}`;
            const daysRemaining = calculateDaysRemaining(project.targetGoLiveDate, project.startDate);

            return (
              <div
                key={project.id}
                className="card"
                style={{
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  position: 'relative'
                }}
                onClick={() => onSelectProject(project.id)}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.02em' }}>{projectCode}</span>
                    <span className="pl-status"><span style={{ backgroundColor: getStatusDotColor(project.status) }} />{project.status}</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>{project.name}</h3>
                  <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>{project.clientName}</span>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', padding: '0.3rem 0.85rem', borderRadius: 'var(--radius-sm)', backgroundColor: phaseColors.bg, color: phaseColors.text, fontWeight: 700 }}>
                    {phaseColors.label}
                  </span>
                  {!hideRag && (
                  <span style={{ fontSize: '0.85rem', padding: '0.3rem 0.85rem', borderRadius: 'var(--radius-sm)', backgroundColor: healthColors.bg, color: healthColors.text, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: healthColors.dot }} />
                    {healthColors.label}
                  </span>
                  )}
                </div>

                {/* Progress Indicators */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.25rem' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Delivery Progress</span>
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', backgroundColor: getStatusDotColor(project.status), width: `${metrics.progress}%`, transition: 'width 0.3s ease', borderRadius: '4px' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', border: `3px solid ${getStatusDotColor(project.status)}`, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', flexShrink: 0 }}>
                    {metrics.progress}%
                  </div>
                </div>

                {/* Budget and Go-Live Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.85rem 1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Planned effort</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: metrics.overBudget ? 'var(--danger)' : 'var(--text-primary)' }}>{metrics.daysPlanned} days</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>of {project.budgetDays} budget · {metrics.budgetPercentage}%</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Go-Live Target</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatDateFriendly(project.targetGoLiveDate || project.startDate)}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{daysRemaining >= 0 ? `${daysRemaining} days remaining` : `${Math.abs(daysRemaining)} days overdue`}</span>
                  </div>
                </div>

                {/* Footer Icons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontWeight: 500 }}>
                    <CheckCircle2 size={16} /> {metrics.taskCount} tasks
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontWeight: 500 }}>
                    <Users size={16} /> {1 + (project.projectResourceIds?.length || 0) + (project.leadConsultantId ? 1 : 0)} team
                  </div>
                </div>
              </div>
            );
          })}
          {filteredProjects.length === 0 && (
            <div style={{ gridColumn: '1 / -1' }} className="card">{emptyState}</div>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div className="card data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="dt-check">
                  <input
                    type="checkbox"
                    className="win-checkbox"
                    aria-label="Select all projects"
                    checked={selectedProjectIds.length === filteredProjects.length && filteredProjects.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th>Project</th>
                <th>Phase</th>
                {!hideRag && <th>Health</th>}
                <th>Progress</th>
                <th className="dt-num" title="Planned billable effort vs. budget">Effort / budget</th>
                <th>Go-live</th>
                <th>PM</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(project => {
                const pm = consultants.find(c => c.id === project.projectManagerId);
                const metrics = getProjectMetrics(project.id, project.budgetDays);
                const healthColors = getHealthColors(project.ragOverall);
                const phaseColors = getPhaseColors(project.phase, project.status);
                const projectCode = `PRJ-${project.id.substring(0, 5).toUpperCase()}`;
                const daysRemaining = calculateDaysRemaining(project.targetGoLiveDate, project.startDate);
                const selected = selectedProjectIds.includes(project.id);

                return (
                  <tr
                    key={project.id}
                    className={selected ? 'is-selected' : undefined}
                    tabIndex={0}
                    aria-label={`Open ${project.name}`}
                    onClick={() => onSelectProject(project.id)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onSelectProject(project.id); }}
                  >
                    <td className="dt-check" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="win-checkbox"
                        aria-label={`Select ${project.name}`}
                        checked={selected}
                        onChange={() => handleSelectOne(project.id)}
                      />
                    </td>
                    <td>
                      <div className="dt-project">
                      <span className="dt-dot" style={{ backgroundColor: getStatusDotColor(project.status) }} title={`Status: ${project.status}`} />
                      <div>
                        <span className="dt-title">{project.name}</span>
                        <span className="dt-sub">{project.clientName} · {projectCode}</span>
                      </div>
                      </div>
                    </td>
                    <td>
                      <span className="pill" style={{ backgroundColor: phaseColors.bg, color: phaseColors.text, borderColor: `${phaseColors.text}30` }}>
                        {phaseColors.label}
                      </span>
                    </td>
                    {!hideRag && (
                      <td>
                        <span className="pill" style={{ backgroundColor: healthColors.bg, color: healthColors.text }}>
                          <span className="pill-dot" style={{ backgroundColor: healthColors.dot }} />
                          {healthColors.label}
                        </span>
                      </td>
                    )}
                    <td>
                      <div className="dt-progress">
                        <div className="dt-bar"><div style={{ width: `${metrics.progress}%`, backgroundColor: getStatusDotColor(project.status) }} /></div>
                        <span>{metrics.progress}%</span>
                      </div>
                    </td>
                    <td className="dt-num">
                      <span className={metrics.overBudget ? 'dt-strong dt-over' : 'dt-strong'}>{metrics.daysPlanned}</span>
                      <span className="dt-muted"> / {project.budgetDays}d</span>
                    </td>
                    <td>
                      <span className="dt-strong">{formatDateFriendly(project.targetGoLiveDate || project.startDate)}</span>
                      <span className={`dt-sub ${daysRemaining < 0 ? 'dt-over' : ''}`}>{goLiveHint(daysRemaining)}</span>
                    </td>
                    <td>
                      {pm ? (
                        <span className="dt-person">
                          <span className="dt-avatar" style={{ backgroundColor: pm.avatarColor }}>{initials(pm.name)}</span>
                          {pm.name}
                        </span>
                      ) : (
                        <span className="dt-muted">Unassigned</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredProjects.length === 0 && (
                <tr className="dt-empty">
                  <td colSpan={hideRag ? 7 : 8}>{emptyState}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card pl-kanban">
          {filteredProjects.length === 0 ? (
            <div className="card">{emptyState}</div>
          ) : (
            <div className="pl-kanban-scroll">
              {kanbanColumns.map(column => (
                <section
                  key={column.id}
                  className={`pl-kanban-column ${kanbanDragId ? 'pl-kanban-column-droppable' : ''}`}
                  onDragOver={(e) => { if (kanbanDragId) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); applyKanbanDrop(column.id); }}
                >
                  <header className="pl-kanban-column-head">
                    <span className="pl-kanban-column-title">{column.label}</span>
                    <span className="pl-kanban-count">{column.projects.length}</span>
                  </header>
                  <div className="pl-kanban-cards">
                    {column.projects.length > 0 ? column.projects.map(renderProjectKanbanCard) : (
                      <div className="pl-kanban-empty">No projects</div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

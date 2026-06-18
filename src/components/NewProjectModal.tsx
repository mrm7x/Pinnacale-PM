import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Project, Consultant } from '../types';
import { X } from 'lucide-react';
import { WinComboBox } from './winui/WinComboBox';
import { PHASES, PHASE_ORDER } from '../utils/phases';

interface NewProjectModalProps {
  onClose: () => void;
  onCreateProject: (project: Omit<Project, 'id' | 'createdAt' | 'isTemplate'>, templateId?: string) => void;
  projectTemplates: Project[];
  consultants: Consultant[];
}

export default function NewProjectModal({ onClose, onCreateProject, projectTemplates, consultants }: NewProjectModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [newProject, setNewProject] = useState({
    name: '',
    clientName: '',
    description: '',
    budgetDays: 10,
    startDate: new Date().toISOString().split('T')[0],
    targetGoLiveDate: '',
    consultantIds: [] as string[],
    projectManagerId: '' as string,
    leadConsultantId: '' as string,
    customerId: '' as string,
    projectResourceIds: [] as string[],
    trelloLink: '',
    sharepointLink: '',
    icon: 'Folder',
    status: 'new' as Project['status'],
    phase: '' as string
  });

  const handleCreateProjectSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newProject.name || !newProject.clientName) return;

    // Derive the accent color from the chosen phase so every phase has a
    // consistent identity. The color is no longer user-chosen.
    const colorTheme = newProject.phase && PHASES[newProject.phase]
      ? PHASES[newProject.phase].accent
      : undefined;

    const projectToCreate = {
      ...newProject,
      colorTheme,
      projectManagerId: newProject.projectManagerId || undefined,
      leadConsultantId: newProject.leadConsultantId || undefined,
      customerId: newProject.customerId || undefined,
    };

    onCreateProject(projectToCreate, selectedTemplateId || undefined);
    onClose();
  };

  const consultantOptions = [
    { label: '-- Unassigned --', value: '' },
    ...consultants.map(c => ({ label: c.name, value: c.id }))
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>Create New Project</h3>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleCreateProjectSubmit}>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div className="form-group">
              <label className="form-label">Base on Template (Optional)</label>
              <WinComboBox
                className="form-select"
                value={selectedTemplateId}
                onChange={(val) => setSelectedTemplateId(val)}
                options={[
                  { label: '-- Start from Scratch (No Template) --', value: '' },
                  ...projectTemplates.map(t => ({ label: t.name, value: t.id }))
                ]}
              />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Phase 1 Implementation"
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
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                placeholder="Describe the scope of implementation..."
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                rows={3}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Status</label>
                <WinComboBox
                  className="form-select"
                  value={newProject.status}
                  onChange={(val) => setNewProject({ ...newProject, status: val as any })}
                  options={[
                    { label: 'New', value: 'new' },
                    { label: 'In Progress', value: 'in progress' },
                    { label: 'On Hold', value: 'on hold' },
                    { label: 'Completed', value: 'completed' },
                    { label: 'Cancelled', value: 'cancelled' }
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phase</label>
                <WinComboBox
                  className="form-select"
                  value={newProject.phase || ''}
                  onChange={(val) => setNewProject({ ...newProject, phase: val })}
                  options={[
                    { label: '-- None --', value: '' },
                    { label: 'Discovery', value: 'Discovery' },
                    { label: 'Planning', value: 'Planning' },
                    { label: 'Implementation', value: 'Implementation' },
                    { label: 'Testing', value: 'Testing' },
                    { label: 'Hypercare', value: 'Hypercare' },
                    { label: 'Support', value: 'Support' }
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={newProject.startDate}
                  onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
            <h4 style={{ margin: 0 }}>Roles & Assignments</h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Project Manager</label>
                <WinComboBox
                  className="form-select"
                  value={newProject.projectManagerId}
                  onChange={(val) => setNewProject({ ...newProject, projectManagerId: val })}
                  options={consultantOptions}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Lead Consultant</label>
                <WinComboBox
                  className="form-select"
                  value={newProject.leadConsultantId}
                  onChange={(val) => setNewProject({ ...newProject, leadConsultantId: val })}
                  options={consultantOptions}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Customer</label>
                <WinComboBox
                  className="form-select"
                  value={newProject.customerId}
                  onChange={(val) => setNewProject({ ...newProject, customerId: val })}
                  options={consultantOptions}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Resources</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <select 
                    className="form-select"
                    onChange={(e) => {
                      if (e.target.value && !newProject.projectResourceIds.includes(e.target.value)) {
                        setNewProject({ ...newProject, projectResourceIds: [...newProject.projectResourceIds, e.target.value] });
                      }
                      e.target.value = '';
                    }}
                  >
                    <option value="">Add a resource...</option>
                    {consultants.filter(c => !newProject.projectResourceIds.includes(c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {newProject.projectResourceIds.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {newProject.projectResourceIds.map(rid => (
                        <span key={rid} className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {consultants.find(c => c.id === rid)?.name}
                          <X size={12} style={{ cursor: 'pointer' }} onClick={() => setNewProject({ ...newProject, projectResourceIds: newProject.projectResourceIds.filter(id => id !== rid) })} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
            <h4 style={{ margin: 0 }}>Links</h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Trello Link</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://trello.com/..."
                  value={newProject.trelloLink}
                  onChange={(e) => setNewProject({ ...newProject, trelloLink: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Sharepoint Link</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://sharepoint.com/..."
                  value={newProject.sharepointLink}
                  onChange={(e) => setNewProject({ ...newProject, sharepointLink: e.target.value })}
                />
              </div>
            </div>

          </div>
          <div className="modal-footer" style={{ padding: '1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create Project</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Project, Consultant } from '../types';
import { X } from 'lucide-react';
import { WinComboBox } from './winui/WinComboBox';
import { PHASES } from '../utils/phases';

interface EditProjectModalProps {
  onClose: () => void;
  onUpdateProject: (project: Project) => void;
  project: Project;
  consultants: Consultant[];
}

export default function EditProjectModal({ onClose, onUpdateProject, project, consultants }: EditProjectModalProps) {
  const [editProject, setEditProject] = useState({
    ...project,
    consultantIds: project.consultantIds || [],
    projectResourceIds: project.projectResourceIds || [],
    projectManagerId: project.projectManagerId || '',
    leadConsultantId: project.leadConsultantId || '',
    customerId: project.customerId || '',
    trelloLink: project.trelloLink || '',
    sharepointLink: project.sharepointLink || '',
    status: project.status || 'new',
    phase: project.phase || '',
    budgetDays: project.budgetDays || 0
  });
  const handleUpdateProjectSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editProject.name || !editProject.clientName) return;

    // Keep the accent color in sync with the phase. Changing the phase
    // automatically updates the project's accent identity.
    const colorTheme = editProject.phase && PHASES[editProject.phase]
      ? PHASES[editProject.phase].accent
      : undefined;

    const projectToUpdate = {
      ...editProject,
      colorTheme,
      projectManagerId: editProject.projectManagerId || undefined,
      leadConsultantId: editProject.leadConsultantId || undefined,
      customerId: editProject.customerId || undefined,
    };

    onUpdateProject(projectToUpdate);
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
          <h3>Amend Project</h3>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleUpdateProjectSubmit}>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Phase 1 Implementation"
                  value={editProject.name}
                  onChange={(e) => setEditProject({ ...editProject, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Client Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Acme Corp"
                  value={editProject.clientName}
                  onChange={(e) => setEditProject({ ...editProject, clientName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                placeholder="Describe the scope of implementation..."
                value={editProject.description}
                onChange={(e) => setEditProject({ ...editProject, description: e.target.value })}
                rows={3}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Status</label>
                <WinComboBox
                  className="form-select"
                  value={editProject.status}
                  onChange={(val) => setEditProject({ ...editProject, status: val as any })}
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
                  value={editProject.phase || ''}
                  onChange={(val) => setEditProject({ ...editProject, phase: val })}
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
                  value={editProject.startDate}
                  onChange={(e) => setEditProject({ ...editProject, startDate: e.target.value })}
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
                  value={editProject.projectManagerId}
                  onChange={(val) => setEditProject({ ...editProject, projectManagerId: val })}
                  options={consultantOptions}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Lead Consultant</label>
                <WinComboBox
                  className="form-select"
                  value={editProject.leadConsultantId}
                  onChange={(val) => setEditProject({ ...editProject, leadConsultantId: val })}
                  options={consultantOptions}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Customer</label>
                <WinComboBox
                  className="form-select"
                  value={editProject.customerId}
                  onChange={(val) => setEditProject({ ...editProject, customerId: val })}
                  options={consultantOptions}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Resources</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <select 
                    className="form-select"
                    onChange={(e) => {
                      if (e.target.value && !editProject.projectResourceIds.includes(e.target.value)) {
                        setEditProject({ ...editProject, projectResourceIds: [...editProject.projectResourceIds, e.target.value] });
                      }
                      e.target.value = '';
                    }}
                  >
                    <option value="">Add a resource...</option>
                    {consultants.filter(c => !editProject.projectResourceIds.includes(c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {editProject.projectResourceIds.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {editProject.projectResourceIds.map(rid => (
                        <span key={rid} className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {consultants.find(c => c.id === rid)?.name}
                          <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditProject({ ...editProject, projectResourceIds: editProject.projectResourceIds.filter(id => id !== rid) })} />
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
                  value={editProject.trelloLink}
                  onChange={(e) => setEditProject({ ...editProject, trelloLink: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Sharepoint Link</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://sharepoint.com/..."
                  value={editProject.sharepointLink}
                  onChange={(e) => setEditProject({ ...editProject, sharepointLink: e.target.value })}
                />
              </div>
            </div>

          </div>
          <div className="modal-footer" style={{ padding: '1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

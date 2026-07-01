import React, { useState } from 'react';
import type { Consultant, Customer, Project, Role } from '../types';
import type { Tier, ActiveUser } from '../utils/permissions';
import { canManageUsers, canEditUsers, canManageDatabase, canManageCustomers } from '../utils/permissions';
import {
  Users, ShieldCheck, Download, Upload, Trash2, Plus,
  RefreshCw, CheckCircle, Database, FolderKanban, Edit2, Lock
} from 'lucide-react';
import { getSupabaseCredentials, testSupabaseConnection, getSupabaseClient, isSupabaseConfigured, setSupabaseEnabled, inviteUser } from '../utils/supabase';

interface SettingsProps {
  consultants: Consultant[];
  customers: Customer[];
  activeUserTier: Tier;
  activeUserId: string;
  activeUser: ActiveUser | null;
  onAddConsultant: (consultant: Omit<Consultant, 'id'>) => void;
  onDeleteConsultant: (id: string) => void;
  onUpdateConsultant: (consultant: Consultant) => void;
  onAddCustomer: (customer: Omit<Customer, 'id' | 'tier'>) => Promise<boolean>;
  onDeleteCustomer: (id: string) => void;
  onImportData: (jsonData: string) => Promise<boolean>;
  onExportData: () => void;
  onResetData: () => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  projectTemplates: Project[];
  onDeleteTemplate: (id: string) => void;
}

export default function Settings({
  consultants,
  customers,
  activeUserTier,
  activeUserId,
  activeUser,
  onAddConsultant,
  onDeleteConsultant,
  onUpdateConsultant,
  onAddCustomer,
  onDeleteCustomer,
  onImportData,
  onExportData,
  onResetData,
  onAddToast,
  projectTemplates,
  onDeleteTemplate
}: SettingsProps) {
  // Consultant Form
  const [newConsultant, setNewConsultant] = useState<{ name: string; email: string; role: Role; avatarColor: string; tier: Tier }>({ name: '', email: '', role: 'Consultant', avatarColor: '#0d9488', tier: 'normal' });
  // Customer (external) Form
  const [newCustomer, setNewCustomer] = useState<{ name: string; email: string; company: string; avatarColor: string }>({ name: '', email: '', company: '', avatarColor: '#0d9488' });
  const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // Own Profile States
  const currentUser = consultants.find(c => c.id === activeUserId);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!newPassword || newPassword !== confirmPassword) {
      onAddToast('Passwords do not match.', 'error');
      return;
    }
    setIsChangingPassword(true);
    try {
      // Passwords are owned by Supabase Auth. Update it there directly; there
      // is no local password hash to maintain.
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase.auth.updateUser({ password: newPassword });
          if (error) {
            onAddToast(`Failed to update Supabase Auth password: ${error.message}`, 'error');
          } else {
            onAddToast('Password updated via Supabase Auth.', 'success');
          }
        }
      } else {
        onAddToast('Offline dev mode: passwords are managed by Supabase Auth.', 'info');
      }
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      onAddToast(err.message || 'Failed to update password.', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const [importJson, setImportJson] = useState('');
  const [showImportArea, setShowImportArea] = useState(false);

  // Supabase Database Form State
  const creds = getSupabaseCredentials();
  const [supabaseUrl, setSupabaseUrl] = useState(creds.url);
  const [supabaseKey, setSupabaseKey] = useState(creds.anonKey);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    // When there are no env vars, Supabase only activates via this explicit
    // opt-in flag, so saving credentials here is what enables the backend.
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setSupabaseEnabled(false);
      localStorage.removeItem('pinnacle_supabase_url');
      localStorage.removeItem('pinnacle_supabase_anon_key');
      onAddToast('Supabase credentials cleared. Using local storage mode.', 'info');
    } else {
      localStorage.setItem('pinnacle_supabase_url', supabaseUrl.trim());
      localStorage.setItem('pinnacle_supabase_anon_key', supabaseKey.trim());
      setSupabaseEnabled(true);
      onAddToast('Supabase credentials saved. App will reload to apply changes.', 'success');
    }
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    setSupabaseStatus({ type: null, message: '' });
    try {
      const res = await testSupabaseConnection();
      if (res.success) {
        setSupabaseStatus({ type: 'success', message: res.message });
      } else {
        setSupabaseStatus({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setSupabaseStatus({ type: 'error', message: err.message || 'Connection test failed.' });
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const handleDownloadSchema = () => {
    // SECURITY: this template MUST stay in sync with the locked-down migrations
    // under supabase/migrations. It must NEVER contain:
    //   * open RLS policies (USING(true)/WITH CHECK(true) with no auth check)
    //   * hardcoded password hashes or default credentials
    //   * a real administrator email
    const sqlContent = `-- Pinnacle Projects Supabase Database Schema
-- Run this script in your Supabase SQL Editor to configure your database tables.
-- RLS is ENABLED and locked to the authenticated role on every table. The anon
-- role is revoked. Do NOT weaken these policies without reviewing the security
-- model. Do NOT seed default credentials here — create users via Supabase Auth.

CREATE TABLE IF NOT EXISTS consultants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'Consultant',
    avatar_color TEXT NOT NULL DEFAULT '#0d9488',
    tier TEXT NOT NULL DEFAULT 'consultant',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consultants_select_authenticated" ON consultants FOR SELECT TO authenticated USING (true);
CREATE POLICY "consultants_insert_authenticated" ON consultants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "consultants_update_authenticated" ON consultants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "consultants_delete_authenticated" ON consultants FOR DELETE TO authenticated USING (true);
REVOKE ALL ON consultants FROM anon;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    description TEXT,
    budget_days NUMERIC NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    target_go_live_date TEXT NOT NULL,
    consultant_ids TEXT[] NOT NULL DEFAULT '{}',
    is_template BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_select_authenticated" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_insert_authenticated" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "projects_update_authenticated" ON projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "projects_delete_authenticated" ON projects FOR DELETE TO authenticated USING (true);
REVOKE ALL ON projects FROM anon;

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    duration_days NUMERIC NOT NULL DEFAULT 1.0,
    assigned_consultant_id TEXT REFERENCES consultants(id) ON DELETE SET NULL,
    predecessor_ids TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'not_started',
    planned_start_date TEXT,
    planned_end_date TEXT,
    start_half_day INTEGER NOT NULL DEFAULT 0,
    end_half_day INTEGER NOT NULL DEFAULT 0,
    pink_number TEXT,
    sort_order INTEGER DEFAULT 0,
    custom_start_date TEXT,
    progress INTEGER DEFAULT 0,
    due_date TEXT,
    task_owner TEXT NOT NULL DEFAULT 'Pinnacle'
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select_authenticated" ON tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert_authenticated" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tasks_update_authenticated" ON tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tasks_delete_authenticated" ON tasks FOR DELETE TO authenticated USING (true);
REVOKE ALL ON tasks FROM anon;
`;

    const blob = new Blob([sqlContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'supabase_schema.sql';
    link.click();
    onAddToast('SQL schema download triggered.', 'success');
  };

  // Colors list for consultants
  const colors = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4'];

  const handleAddConsultantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConsultant.name || !newConsultant.email) return;

    // App.tsx will send an invite email so the user can set their own password.
    onAddConsultant({
      name: newConsultant.name,
      email: newConsultant.email,
      role: newConsultant.role,
      avatarColor: newConsultant.avatarColor,
      tier: newConsultant.tier,
    });
    setNewConsultant({ name: '', email: '', role: 'Consultant', avatarColor: colors[Math.floor(Math.random() * colors.length)], tier: 'normal' });
  };

  const handleResetPassword = async (consultantId: string) => {
    if (!resetPasswordValue) return;
    const consultant = consultants.find(c => c.id === consultantId);
    if (consultant) {
      if (isSupabaseConfigured()) {
        const { error } = await inviteUser(consultant.email);
        if (error) {
          onAddToast(`Failed to send invite: ${error}`, 'error');
        } else {
          onAddToast(`Password reset email sent to ${consultant.email}. They can set a new password from the link.`, 'success');
        }
      }
    }
    setResetPasswordId(null);
    setResetPasswordValue('');
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onImportData(importJson);
    if (success) {
      onAddToast('Database imported successfully!', 'success');
      setImportJson('');
      setShowImportArea(false);
    } else {
      onAddToast('Import failed. Invalid database structure.', 'error');
    }
  };

  return (
    <div className="grid-cols-12">
      {/* LEFT COLUMN: Profile & Team Management */}
      <div 
        className={activeUserTier === 'superuser' ? "col-span-6" : "col-span-12"} 
        style={activeUserTier === 'superuser' ? { display: 'flex', flexDirection: 'column', gap: '2rem' } : { maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}
      >
        {/* My Profile Card */}
        {currentUser && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} /> My Profile
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div 
                style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '12px', 
                  backgroundColor: currentUser.avatarColor, 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '1.5rem', 
                  fontWeight: 'bold',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                }}
              >
                {currentUser.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{currentUser.name}</h4>
                <p style={{ margin: '0.3rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{currentUser.email}</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                  <span className="badge badge-secondary">
                    Role: {currentUser.role}
                  </span>
                  <span className={`badge badge-${currentUser.tier === 'superuser' ? 'primary' : currentUser.tier === 'admin' ? 'warning' : 'secondary'}`}>
                    Access: {currentUser.tier === 'superuser' ? 'Super User' : currentUser.tier === 'admin' ? 'Admin' : 'Normal User'}
                  </span>
                </div>
              </div>
            </div>

            {/* Gantt Avatar Color Picker */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Gantt Avatar Color</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                {colors.map(c => (
                  <button 
                    key={c}
                    type="button"
                    onClick={() => {
                      onUpdateConsultant({ ...currentUser, avatarColor: c });
                      onAddToast('Gantt color updated successfully.', 'success');
                    }}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: c,
                      border: currentUser.avatarColor === c ? '3px solid var(--text-primary)' : '1px solid transparent',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'transform 0.15s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  />
                ))}
              </div>
            </div>

            {/* Change Password Form */}
            <form onSubmit={handleChangeOwnPassword} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.75rem', display: 'block' }}>Change Password</label>
              <div className="grid-cols-12" style={{ gap: '0.75rem' }}>
                <div className="form-group col-span-6" style={{ margin: 0 }}>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group col-span-6" style={{ margin: 0 }}>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button 
                type="submit" 
                className="btn btn-secondary" 
                disabled={isChangingPassword}
                style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {isChangingPassword ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                <span>Update Password</span>
              </button>
            </form>
          </div>
        )}

        {/* Manage Consultants */}
        {canManageUsers(activeUserTier) && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={20} /> Team Consultants
              </h3>
            </div>

            <form onSubmit={handleAddConsultantSubmit} style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label htmlFor="form-field-1" className="form-label">Consultant Name</label>
                <input id="form-field-1" 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. John Doe"
                  value={newConsultant.name}
                  onChange={(e) => setNewConsultant({ ...newConsultant, name: e.target.value })}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="form-field-2" className="form-label">Office 365 Business Email</label>
                <input id="form-field-2" 
                  type="email" 
                  className="form-input" 
                  placeholder="e.g. john.doe@acme.onmicrosoft.com"
                  value={newConsultant.email}
                  onChange={(e) => setNewConsultant({ ...newConsultant, email: e.target.value })}
                  required
                />
              </div>

              <div className="grid-cols-12" style={{ gap: '1rem' }}>
                <div className="form-group col-span-12">
                  <label htmlFor="form-field-3" className="form-label">Implementation Role</label>
                  <select id="form-field-3"
                    className="form-select"
                    value={newConsultant.role}
                    onChange={(e) => setNewConsultant({ ...newConsultant, role: e.target.value as Role })}
                  >
                    <option value="Consultant">Consultant</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Manager">Manager</option>
                    <option value="Read only">Read only</option>
                  </select>
                </div>

                <div className="form-group col-span-12">
                  <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Access Level</label>
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>
                      <input 
                        type="radio" 
                        name="new_tier"
                        value="superuser"
                        checked={newConsultant.tier === 'superuser'}
                        onChange={() => setNewConsultant({ ...newConsultant, tier: 'superuser' })}
                      />
                      <span>Super user</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>
                      <input 
                        type="radio" 
                        name="new_tier"
                        value="admin"
                        checked={newConsultant.tier === 'admin'}
                        onChange={() => setNewConsultant({ ...newConsultant, tier: 'admin' })}
                      />
                      <span>Admin</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>
                      <input 
                        type="radio" 
                        name="new_tier"
                        value="normal"
                        checked={newConsultant.tier === 'normal'}
                        onChange={() => setNewConsultant({ ...newConsultant, tier: 'normal' })}
                      />
                      <span>Normal user</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid-cols-12">
                <div className="form-group col-span-12">
                  <label className="form-label">Gantt Color</label>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {colors.map(c => (
                      <button 
                        key={c}
                        type="button"
                        onClick={() => setNewConsultant({ ...newConsultant, avatarColor: c })}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: c,
                          border: newConsultant.avatarColor === c ? '2px solid var(--text-primary)' : '1px solid transparent',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                <Plus size={16} /> Add User
              </button>
            </form>

            {/* Consultants Directory List */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '1rem', marginBottom: '0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Consultants Directory</h4>
              {consultants.length === 0 ? (
                <span style={{ fontSize: '0.95rem', color: 'var(--text-tertiary)' }}>No consultants registered.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {consultants.map(c => {
                    const tierLabel = c.tier === 'superuser' ? 'Super User' : c.tier === 'admin' ? 'Admin' : 'Normal User';
                    return (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          border: '1px solid var(--border-color)',
                          padding: '0.85rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-primary)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              backgroundColor: c.avatarColor,
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold',
                              fontSize: '0.9rem',
                              flexShrink: 0
                            }}
                          >
                            {c.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '1rem' }}>{c.name}</span>
                            <span style={{ fontSize: '0.88rem', color: 'var(--text-tertiary)' }}>{c.role} | {c.email}</span>
                            <span className={`badge badge-${c.tier === 'superuser' ? 'primary' : c.tier === 'admin' ? 'warning' : 'secondary'}`}
                              style={{ alignSelf: 'flex-start', marginTop: '0.2rem' }}>
                              {tierLabel}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          {/* Reset Password — admin only */}
                          {canManageUsers(activeUserTier) && (
                            <button
                              className="btn btn-secondary btn-icon"
                              title="Reset Password"
                              aria-label="Reset Password"
                              onClick={() => { setResetPasswordId(c.id); setResetPasswordValue(''); }}
                            >
                              <Lock size={14} />
                            </button>
                          )}
                          {/* Edit — admin or PM */}
                          {canEditUsers(activeUserTier) && (
                            <button
                              className="btn btn-secondary btn-icon"
                              title="Edit Consultant"
                              aria-label="Edit Consultant"
                              onClick={() => setEditingConsultant({ ...c })}
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          {canManageUsers(activeUserTier) && (
                            <button
                              className="btn btn-secondary btn-icon"
                              title="Delete Consultant"
                              aria-label="Delete Consultant"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => {
                                if (confirm(`Delete consultant ${c.name}? All tasks assigned to them will be set to Unassigned.`)) {
                                  onDeleteConsultant(c.id);
                                  onAddToast('Consultant deleted.', 'warning');
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Reset Password Inline Modal */}
              {resetPasswordId && (
                <div style={{ marginTop: '1rem', padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    <Lock size={14} style={{ marginRight: '0.35rem' }} />
                    Reset Password for {consultants.find(c => c.id === resetPasswordId)?.name}
                  </h4>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="New password"
                      value={resetPasswordValue}
                      onChange={e => setResetPasswordValue(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={() => handleResetPassword(resetPasswordId)}>
                      Reset
                    </button>
                    <button className="btn btn-secondary" onClick={() => { setResetPasswordId(null); setResetPasswordValue(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Edit Consultant Inline Modal */}
              {editingConsultant && (
                <div style={{ marginTop: '1rem', padding: '1rem', border: '1px dashed var(--primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    <Edit2 size={14} style={{ marginRight: '0.35rem' }} />
                    Editing: {editingConsultant.name}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="grid-cols-12" style={{ gap: '0.75rem' }}>
                      <div className="form-group col-span-6" style={{ margin: 0 }}>
                        <label htmlFor="form-field-5" className="form-label">Name</label>
                        <input id="form-field-5" type="text" className="form-input" value={editingConsultant.name}
                          onChange={e => setEditingConsultant({ ...editingConsultant, name: e.target.value })} />
                      </div>
                      <div className="form-group col-span-6" style={{ margin: 0 }}>
                        <label htmlFor="form-field-6" className="form-label">Email</label>
                        <input id="form-field-6" type="email" className="form-input" value={editingConsultant.email}
                          onChange={e => setEditingConsultant({ ...editingConsultant, email: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid-cols-12" style={{ gap: '1rem' }}>
                      <div className="form-group col-span-12" style={{ margin: 0 }}>
                        <label htmlFor="form-field-7" className="form-label">Role</label>
                        <select id="form-field-7" className="form-select" value={editingConsultant.role}
                          onChange={e => setEditingConsultant({ ...editingConsultant, role: e.target.value as Role })}>
                          <option value="Consultant">Consultant</option>
                          <option value="Project Manager">Project Manager</option>
                          <option value="Manager">Manager</option>
                          <option value="Read only">Read only</option>
                        </select>
                      </div>
                      
                      <div className="form-group col-span-12" style={{ margin: 0 }}>
                        <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Access Level (Tier)</label>
                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>
                            <input 
                              type="radio" 
                              name="edit_tier"
                              value="superuser"
                              checked={editingConsultant.tier === 'superuser'}
                              onChange={() => setEditingConsultant({ ...editingConsultant, tier: 'superuser' })}
                            />
                            <span>Super user</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>
                            <input 
                              type="radio" 
                              name="edit_tier"
                              value="admin"
                              checked={editingConsultant.tier === 'admin'}
                              onChange={() => setEditingConsultant({ ...editingConsultant, tier: 'admin' })}
                            />
                            <span>Admin</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}>
                            <input 
                              type="radio" 
                              name="edit_tier"
                              value="normal"
                              checked={editingConsultant.tier === 'normal'}
                              onChange={() => setEditingConsultant({ ...editingConsultant, tier: 'normal' })}
                            />
                            <span>Normal user</span>
                          </label>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button className="btn btn-secondary" onClick={() => setEditingConsultant(null)}>Cancel</button>
                      <button className="btn btn-primary" onClick={() => {
                        onUpdateConsultant(editingConsultant);
                        onAddToast(`Updated ${editingConsultant.name}.`, 'success');
                        setEditingConsultant(null);
                      }}>Save Changes</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manage Customers (external parties) — admins only */}
        {canManageCustomers(activeUser) && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={20} /> Customers (External)
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: 0 }}>
                External parties with view-only access to their assigned projects. Always tier=normal.
              </p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newCustomer.name || !newCustomer.email) return;
              const ok = await onAddCustomer(newCustomer);
              if (ok) {
                onAddToast(`Customer ${newCustomer.name} created.`, 'success');
                setNewCustomer({ name: '', email: '', company: '', avatarColor: colors[Math.floor(Math.random() * colors.length)] });
              }
            }} style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Add Customer</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr auto', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <input className="form-input" placeholder="Full name" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} required />
                  <input className="form-input" type="email" placeholder="Email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} required />
                  <input className="form-input" placeholder="Company" value={newCustomer.company} onChange={e => setNewCustomer({ ...newCustomer, company: e.target.value })} />
                  <button type="submit" className="btn btn-primary"><Plus size={16} /> Add</button>
                </div>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {customers.length === 0 && (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', padding: '0.5rem 0' }}>No customers yet.</p>
              )}
              {customers.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: c.avatarColor, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                      {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name} {c.company && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>· {c.company}</span>}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{c.email}</div>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-icon" style={{ color: 'var(--danger)' }}
                    title="Delete customer"
                    onClick={() => { if (confirm(`Delete customer "${c.name}"? They will lose access.`)) onDeleteCustomer(c.id); }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Database & Integrations (superuser only) */}
      {canManageDatabase(activeUserTier) && (
        <div className="col-span-6" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Database Management Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} /> Backup & Database Management
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onExportData}>
                <Download size={16} /> Export JSON
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowImportArea(!showImportArea)}>
                <Upload size={16} /> Import JSON
              </button>
            </div>

            {showImportArea && (
              <form onSubmit={handleImportSubmit} style={{ border: '1px dashed var(--border-color)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="form-field-8" className="form-label">Paste Exported JSON Database</label>
                  <textarea id="form-field-8" 
                    className="form-textarea" 
                    style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    rows={4}
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImportArea(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Restore Database</button>
                </div>
              </form>
            )}

            <button 
              className="btn btn-danger" 
              style={{ width: '100%' }}
              onClick={() => {
                if (confirm('WARNING: This will delete all projects, consultants, and configuration settings, and load default demonstration data. Are you sure?')) {
                  onResetData();
                  onAddToast('Database has been reset to defaults.', 'info');
                }
              }}
            >
              Reset App & Load Sample Data
            </button>
          </div>

          {/* Saved Templates Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FolderKanban size={20} /> Saved Project Templates
              </h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {projectTemplates.length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '1rem 0' }}>
                  No saved project templates.
                </span>
              ) : (
                projectTemplates.map(tmpl => (
                  <div 
                    key={tmpl.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      border: '1px solid var(--border-color)',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-primary)'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{tmpl.name}</span>
                      <span style={{ fontSize: '0.725rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                        Ref: Template skeleton
                      </span>
                    </div>
                    <button 
                      className="btn btn-secondary btn-icon"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => {
                        if (confirm(`Delete template "${tmpl.name}"?`)) {
                          onDeleteTemplate(tmpl.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Hosted Supabase Database Config.
              In production the host is fixed by build-time env vars (never
              runtime-configurable), so the editable form is dev-only. In
              production we show a read-only connection status instead. */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} /> Hosted Supabase Database
              </h3>
            </div>

            {creds.isFromEnv ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'rgba(13, 148, 136, 0.1)',
                color: 'var(--primary)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                fontWeight: 500,
                border: '1px solid rgba(13, 148, 136, 0.15)'
              }}>
                <ShieldCheck size={16} />
                <span>Connected via build environment variables. The host is fixed and cannot be changed at runtime.</span>
              </div>
            ) : import.meta.env.DEV ? (
            <form onSubmit={handleSaveSupabaseConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'var(--warning-light, rgba(245, 158, 11, 0.1))',
                color: 'var(--warning, #b45309)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                fontWeight: 500,
                border: '1px solid rgba(245, 158, 11, 0.2)'
              }}>
                <ShieldCheck size={16} />
                <span>Dev mode: credentials are stored in localStorage for local testing only. Production uses build env vars.</span>
              </div>

              <div className="form-group">
                <label htmlFor="form-field-9" className="form-label">Supabase Project URL</label>
                <input id="form-field-9"
                  type="url"
                  className="form-input"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  disabled={creds.isFromEnv}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="form-field-10" className="form-label">Supabase Anon Key (Public Key)</label>
                <input id="form-field-10"
                  type="password"
                  className="form-input"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC..."
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  disabled={creds.isFromEnv}
                  required
                />
              </div>

              {supabaseStatus.message && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  backgroundColor: supabaseStatus.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
                  color: supabaseStatus.type === 'success' ? 'var(--success)' : 'var(--danger)',
                  border: supabaseStatus.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <CheckCircle size={15} />
                  <span>{supabaseStatus.message}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleTestSupabase}
                    disabled={isTestingSupabase || !supabaseUrl || !supabaseKey}
                    style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}
                  >
                    {isTestingSupabase ? <RefreshCw size={14} className="animate-spin" /> : null}
                    <span>Test Connection</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleDownloadSchema}
                    style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}
                    title="Download PostgreSQL schema template to run in Supabase" aria-label="Download PostgreSQL schema template to run in Supabase"
                  >
                    <Download size={14} />
                    <span>Download SQL Setup</span>
                  </button>
                </div>

                {!creds.isFromEnv && (
                  <button type="submit" className="btn btn-primary">
                    Save Credentials
                  </button>
                )}
              </div>
            </form>
            ) : (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                fontWeight: 500,
                backgroundColor: 'var(--danger-light)',
                color: 'var(--danger)',
                border: '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                No backend configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the build environment.
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

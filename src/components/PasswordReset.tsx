import React, { useState } from 'react';
import type { Consultant } from '../types';
import { Lock, CheckCircle, X } from 'lucide-react';

interface PasswordResetProps {
  userId: string;
  consultants: Consultant[];
  onPasswordReset: (newPassword: string) => void;
  onCancel: () => void;
}

export default function PasswordReset({ userId, consultants, onPasswordReset, onCancel }: PasswordResetProps) {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPass) {
      setError('Password cannot be empty.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('Passwords do not match.');
      return;
    }
    onPasswordReset(newPass);
  };

  const consultant = consultants.find(c => c.id === userId);
  const displayName = consultant?.name || 'User';

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '420px', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)' }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <Lock size={22} />
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.25rem' }}>Reset Password for {displayName}</h3>
        </div>
        {error && (
          <div style={{ color: 'var(--danger)', marginBottom: '0.75rem', fontSize: '0.95rem', fontWeight: 600 }}>{error}</div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            type="password"
            placeholder="New password"
            className="form-input"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirm password"
            className="form-input"
            value={confirmPass}
            onChange={e => setConfirmPass(e.target.value)}
            required
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              <X size={16} /> Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <CheckCircle size={16} /> Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

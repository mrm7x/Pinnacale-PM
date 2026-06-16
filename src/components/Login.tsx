import React, { useState } from 'react';
import type { Consultant } from '../types';
import { verifyPassword } from '../utils/auth';
import Logo from './Logo';
import { KeyRound, User, AlertCircle, ArrowRight } from 'lucide-react';
import { isSupabaseConfigured, getSupabaseClient } from '../utils/supabase';

interface LoginProps {
  consultants: Consultant[];
  onLoginSuccess: (userId: string) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function Login({ consultants, onLoginSuccess, onAddToast }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const cleanUser = username.trim().toLowerCase();

    // 1. Supabase Authentication flow (if active)
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient()!;
      try {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: cleanUser,
          password: password
        });

        if (authError) {
          setError(authError.message);
          setIsLoading(false);
          return;
        }

        // Fetch corresponding consultant record
        const { data, error: dbError } = await supabase
          .from('consultants')
          .select('*')
          .eq('email', cleanUser)
          .single();

        const consultantData = data as any;

        if (dbError || !consultantData) {
          console.warn('Authenticated via Supabase, but consultant profile row not found:', dbError);
          setError('User profile not found in database. Please contact your administrator.');
          await supabase.auth.signOut();
          setIsLoading(false);
          return;
        }

        onAddToast(`Welcome back, ${consultantData.name.split(' ')[0]}.`, 'success');
        onLoginSuccess(consultantData.id);
      } catch (err: any) {
        setError(err.message || 'An error occurred during authentication.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 2. Fallback Local Storage authentication flow
    const consultant = consultants.find(
      c => c.email.trim().toLowerCase() === cleanUser || (c.id === 'admin' && cleanUser === 'admin')
    );

    if (!consultant || !consultant.passwordHash) {
      setError('Invalid username or password.');
      setIsLoading(false);
      return;
    }

    const isValid = await verifyPassword(password, consultant.passwordHash);

    if (isValid) {
      onAddToast(`Welcome back, ${consultant.name.split(' ')[0]}.`, 'success');
      onLoginSuccess(consultant.id);
    } else {
      setError('Invalid username or password.');
    }

    setIsLoading(false);
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: 'var(--bg-primary)',
      fontFamily: 'var(--font-body)'
    }}>
      {/* Left Hero Panel */}
      <div style={{
        background: 'linear-gradient(145deg, var(--primary-dark) 0%, var(--primary) 50%, #3a6186 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '3rem 3.5rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background decorative circles */}
        <div style={{
          position: 'absolute', top: '-80px', right: '-80px',
          width: '320px', height: '320px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: '-60px', left: '-60px',
          width: '260px', height: '260px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: '160px', right: '40px',
          width: '140px', height: '140px',
          borderRadius: '50%',
          background: 'rgba(204, 119, 48, 0.15)',
          pointerEvents: 'none'
        }} />

        {/* Logo */}
        <div>
          <Logo style={{ height: '30px', width: 'auto', filter: 'brightness(0) invert(1)' }} />
        </div>

        {/* Hero content */}
        <div style={{ zIndex: 1 }}>
          <div style={{
            display: 'inline-block',
            backgroundColor: 'rgba(204, 119, 48, 0.2)',
            color: 'rgba(255,255,255,0.85)',
            padding: '0.3rem 0.85rem',
            borderRadius: '100px',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '1.25rem',
            border: '1px solid rgba(204,119,48,0.35)'
          }}>
            Implementation Management
          </div>
          <h1 style={{
            color: 'white',
            fontSize: '2.5rem',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            marginBottom: '1.25rem',
            fontFamily: 'var(--font-heading)'
          }}>
            Deliver projects<br />with precision.
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: '1rem',
            lineHeight: 1.7,
            maxWidth: '380px'
          }}>
            Track tasks, manage consultants, and keep every Sage Intacct implementation on time and on budget.
          </p>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex',
          gap: '2rem',
          zIndex: 1
        }}>
          {[
            { value: '100%', label: 'Cloud-based' },
            { value: 'Real-time', label: 'Scheduling' },
            { value: 'RBAC', label: 'Access Control' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '1.05rem', fontFamily: 'var(--font-heading)' }}>{stat.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '0.1rem' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Form Panel */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '3rem 4rem',
        backgroundColor: 'var(--bg-secondary)'
      }}>
        <div style={{ maxWidth: '380px', width: '100%' }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              marginBottom: '0.5rem',
              fontFamily: 'var(--font-heading)'
            }}>
              Welcome back
            </h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
              Sign in to your Pinnacle account
            </p>
          </div>

          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              backgroundColor: 'var(--danger-light)',
              color: 'var(--danger)',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              fontWeight: 500,
              marginBottom: '1.5rem',
              border: '1px solid rgba(229, 72, 61, 0.15)'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.5rem',
                letterSpacing: '0.01em'
              }}>
                <User size={13} /> Username or Email
              </label>
              <input
                type="text"
                className="form-input"
                style={{ fontSize: '0.9rem', padding: '0.75rem 1rem' }}
                placeholder="admin or email address"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                disabled={isLoading}
              />
            </div>

            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.5rem',
                letterSpacing: '0.01em'
              }}>
                <KeyRound size={13} /> Password
              </label>
              <input
                type="password"
                className="form-input"
                style={{ fontSize: '0.9rem', padding: '0.75rem 1rem' }}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.85rem',
                fontSize: '0.92rem',
                marginTop: '0.5rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              disabled={isLoading}
            >
              {isLoading ? 'Signing in…' : <><span>Sign In</span><ArrowRight size={15} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

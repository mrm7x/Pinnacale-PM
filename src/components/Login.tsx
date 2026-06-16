import React, { useState } from 'react';
import type { Consultant } from '../types';
import { verifyPassword } from '../utils/auth';
import Logo from './Logo';
import { KeyRound, User, AlertCircle, ArrowRight, CheckCircle } from 'lucide-react';
import { isSupabaseConfigured, getSupabaseClient } from '../utils/supabase';

interface LoginProps {
  consultants: Consultant[];
  onLoginSuccess: (userId: string) => void;
  onAddToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onLocalForgotPassword: (email: string) => Promise<boolean>;
}

export default function Login({ consultants, onLoginSuccess, onAddToast, onLocalForgotPassword }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Forgot password mode states
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    const emailClean = resetEmail.trim().toLowerCase();

    // 1. Supabase password reset
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient()!;
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailClean, {
          redirectTo: window.location.origin
        });

        if (resetError) {
          setError(resetError.message);
        } else {
          setSuccessMessage('A password reset link has been sent to your email address.');
          onAddToast('Password reset link sent.', 'success');
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred during password reset.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 2. Fallback local storage password reset
    const success = await onLocalForgotPassword(emailClean);
    if (success) {
      setSuccessMessage("A temporary password has been sent to your email address. Please check your inbox.");
      onAddToast("Password reset successfully. Temp password emailed to you.", "success");
      console.log(`[Email Simulation] Sent password reset email to ${emailClean} with temporary password: password1234!`);
    } else {
      setError('No user with this email address was found.');
    }
    setIsLoading(false);
  };

  const renderLeftHeroPanel = () => (
    <div className="login-hero-panel" style={{
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
  );

  if (isForgotPasswordMode) {
    return (
      <div className="login-page-container">
        {renderLeftHeroPanel()}

        {/* Right Form Panel (Reset Password) */}
        <div className="login-form-panel" style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '3rem 4rem',
          backgroundColor: 'var(--bg-secondary)',
          boxSizing: 'border-box'
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
                Reset Password
              </h2>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
                Enter your email address to reset your account password
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

            {successMessage ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  backgroundColor: 'var(--success-light)',
                  color: 'var(--success)',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  border: '1px solid rgba(16, 185, 129, 0.15)'
                }}>
                  <CheckCircle size={16} />
                  <span>{successMessage}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsForgotPasswordMode(false);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  style={{ width: '100%', padding: '0.85rem' }}
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                    <User size={13} /> Email Address
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    style={{ fontSize: '0.9rem', padding: '0.75rem 1rem' }}
                    placeholder="email@example.com"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    autoFocus
                    disabled={isLoading}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setIsForgotPasswordMode(false);
                      setError(null);
                    }}
                    style={{ flex: 1, padding: '0.85rem' }}
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 2, padding: '0.85rem' }}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page-container">
      {renderLeftHeroPanel()}

      {/* Right Form Panel (Sign In) */}
      <div className="login-form-panel" style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '3rem 4rem',
        backgroundColor: 'var(--bg-secondary)',
        boxSizing: 'border-box'
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.01em'
                }}>
                  <KeyRound size={13} /> Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPasswordMode(true);
                    setError(null);
                    setResetEmail('');
                    setSuccessMessage(null);
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Forgot Password?
                </button>
              </div>
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

import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { login } from '../../api/auth.js';

export default function LoginModal({ onSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const data = await login({
        username: username.trim().toLowerCase(),
        password,
      });

      if (data && data.token) {
        localStorage.setItem('honda_auth_token', data.token);
        if (onSuccess) {
          onSuccess(data.user, data.token);
        }
      } else {
        throw new Error('No authentication token received.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Invalid username or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
      userSelect: 'none'
    }}>
      <div style={{
        width: '420px',
        maxWidth: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid var(--border-light)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        padding: '36px 32px',
        animation: 'modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '22px',
            fontFamily: 'sans-serif',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.32)'
          }}>
            H
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              HONDA <span style={{ color: 'var(--honda-red)' }}>TICKETS</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Workshop SLA Operations Hub
            </div>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-main)' }}>
            Sign In
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-subtle)', margin: 0 }}>
            Enter your credentials to manage tickets & floor operations
          </p>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '12.5px',
            fontWeight: 500,
            marginBottom: '18px',
            lineHeight: 1.4
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Username Field */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Username
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <User size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username (e.g. admin)"
                required
                autoFocus
                className="form-input"
                style={{
                  width: '100%',
                  height: '40px',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  fontSize: '13.5px',
                  borderRadius: '8px'
                }}
              />
            </div>
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="form-input"
                style={{
                  width: '100%',
                  height: '40px',
                  paddingLeft: '36px',
                  paddingRight: '40px',
                  fontSize: '13.5px',
                  borderRadius: '8px'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              height: '42px',
              backgroundColor: 'var(--honda-red)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13.5px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.8 : 1,
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.28)',
              transition: 'all 0.15s ease'
            }}
          >
            {isLoading ? (
              <span>Signing in...</span>
            ) : (
              <>
                <span>Sign In to System</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Quick Hint / Pre-filled credentials info */}
        <div style={{
          marginTop: '22px',
          padding: '12px 14px',
          backgroundColor: '#f8fafc',
          border: '1px dashed #cbd5e1',
          borderRadius: '8px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start'
        }}>
          <ShieldCheck size={16} color="var(--honda-red)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div style={{ fontSize: '11.5px', color: 'var(--text-subtle)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-main)' }}>Default System Credentials:</strong>
            Username: <code style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>admin</code> &nbsp;
            Password: <code style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '1px 4px', borderRadius: '3px', fontWeight: 700 }}>admin</code>
          </div>
        </div>
      </div>
    </div>
  );
}

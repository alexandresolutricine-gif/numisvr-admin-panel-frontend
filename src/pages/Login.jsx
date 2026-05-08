import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { register } from '@teamhanko/hanko-elements';
import useAuthStore from '../store/authStore';
import { hankoLogin } from '../services/api';

const HANKO_API_URL = import.meta.env.VITE_HANKO_API_URL;

export default function Login() {
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const setSession            = useAuthStore((s) => s.setSession);
  const navigate              = useNavigate();
  const hankoRef              = useRef(null);
  const handledRef            = useRef(false);

  // Register the <hanko-auth> custom element and attach session listener.
  // In hanko-elements v2, register() returns { hanko } and the correct hook
  // is hanko.relay.onSessionCreated — the old 'onAuthFlowCompleted' DOM event
  // no longer exists in v2.
  useEffect(() => {
    if (!HANKO_API_URL) return;

    register(HANKO_API_URL)
      .then(({ hanko }) => {
        hanko.onSessionCreated(async () => {
          if (handledRef.current) return;
          handledRef.current = true;
          setLoading(true);
          setError('');
          try {
            const jwt = hanko.getSessionToken();
            if (!jwt) throw new Error('Could not read Hanko session token.');

            const { token, admin } = await hankoLogin(jwt);
            setSession(token, admin);
            navigate('/dashboard');
          } catch (err) {
            console.error('[Hanko] session created handler failed:', err);
            setError(err.message || 'Login failed. Ensure your account is registered as an admin.');
            handledRef.current = false;
          } finally {
            setLoading(false);
          }
        });
      })
      .catch((err) => {
        console.error('[Hanko] register failed:', err);
        setError('Passkey service unavailable. Please try again later.');
      });
  }, [navigate, setSession]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            borderRadius: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: '#fff',
            marginBottom: 16,
          }}>
            N
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--tx)' }}>NUVR Admin</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Sign in with your passkey</div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
        }}>
          {HANKO_API_URL ? (
            <hanko-auth ref={hankoRef} />
          ) : (
            <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>
              Hanko API URL is not configured. Set VITE_HANKO_API_URL in your environment.
            </p>
          )}

          {loading && (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', marginTop: 16 }}>
              Verifying…
            </p>
          )}

          {error && (
            <div style={{
              marginTop: 16,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

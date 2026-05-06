import { useEffect, useState, useCallback } from 'react';
import useAuthStore from '../store/authStore';
import { getLogs } from '../services/api';

const ACTION_LABELS = {
  admin_login:          { label: 'Login',            color: '#60a5fa' },
  kyc_approved:         { label: 'KYC Approved',     color: '#34d399' },
  kyc_rejected:         { label: 'KYC Rejected',     color: '#f87171' },
  kyc_updated:          { label: 'KYC Updated',      color: '#a78bfa' },
  settings_update:      { label: 'Settings',         color: '#a78bfa' },
  set_tge:              { label: 'Set TGE',           color: '#fbbf24' },
  set_paused:           { label: 'Pause/Resume',      color: '#f59e0b' },
  set_treasury:         { label: 'Set Treasury',      color: '#a78bfa' },
  set_vesting_schedule: { label: 'Set Vesting',       color: '#a78bfa' },
  set_authority:        { label: 'Set Authority',     color: '#fb7185' },
  initialize_vault:     { label: 'Init Vault',        color: '#60a5fa' },
  fund_vault:           { label: 'Fund Vault',        color: '#34d399' },
  withdraw_vault:       { label: 'Withdraw Vault',    color: '#f59e0b' },
};

const FILTER_OPTIONS = [
  { value: 'all',                label: 'All' },
  { value: 'admin_login',        label: 'Login' },
  { value: 'kyc_approved',       label: 'KYC Approved' },
  { value: 'kyc_rejected',       label: 'KYC Rejected' },
  { value: 'set_tge',            label: 'Set TGE' },
  { value: 'set_paused',         label: 'Pause/Resume' },
  { value: 'set_treasury',       label: 'Set Treasury' },
  { value: 'set_vesting_schedule', label: 'Set Vesting' },
  { value: 'set_authority',      label: 'Set Authority' },
  { value: 'fund_vault',         label: 'Fund Vault' },
  { value: 'withdraw_vault',     label: 'Withdraw Vault' },
  { value: 'settings_update',    label: 'Settings' },
];

function Badge({ action_type }) {
  const info = ACTION_LABELS[action_type] || { label: action_type, color: '#94a3b8' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 5,
      fontSize: 11,
      fontWeight: 600,
      background: `${info.color}18`,
      border: `1px solid ${info.color}44`,
      color: info.color,
      whiteSpace: 'nowrap',
    }}>
      {info.label}
    </span>
  );
}

function TxLink({ sig }) {
  if (!sig) return null;
  const url = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{ fontFamily: 'monospace', fontSize: 11, color: '#60a5fa', textDecoration: 'none' }}
      title={sig}
    >
      {sig.slice(0, 8)}…{sig.slice(-6)}
    </a>
  );
}

function MetaBlock({ metadata }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  return (
    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
      {Object.entries(metadata).map(([k, v]) => (
        <span key={k} style={{ fontSize: 11, color: 'var(--faint)' }}>
          <span style={{ color: 'var(--muted)' }}>{k}:</span>{' '}
          <span style={{ fontFamily: typeof v === 'string' && v.length > 20 ? 'monospace' : 'inherit', color: 'var(--tx)', wordBreak: 'break-all' }}>
            {String(v)}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function Logs() {
  const token = useAuthStore((s) => s.token);

  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [filter,  setFilter]  = useState('all');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getLogs(token, { page, limit: 50, action_type: filter })
      .then((d) => {
        setLogs(d.logs || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
      })
      .catch((e) => setError(e.message || 'Failed to load logs'))
      .finally(() => setLoading(false));
  }, [token, page, filter]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1); }, [filter]);

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>Activity Logs</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
              All admin operations — {total} total
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                padding: '7px 10px', borderRadius: 8, fontSize: 12,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--tx)', fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
              }}
            >
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={load}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>No activity yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 700 }}>
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 'auto' }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 160 }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Time', 'Type', 'Description', 'Tx', 'By'].map((h) => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600, color: 'var(--faint)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    background: 'var(--item-2)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id}
                  style={{
                    borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12, color: 'var(--tx)' }}>
                      {new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--faint)' }}>
                      {new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                    <Badge action_type={log.action_type} />
                  </td>
                  <td style={{ padding: '10px 16px', overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.description}</div>
                    <MetaBlock metadata={log.metadata} />
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                    <TxLink sig={log.tx_signature} />
                  </td>
                  <td style={{ padding: '10px 16px', overflow: 'hidden' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', display: 'block' }}>{log.performed_by}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '6px 12px', borderRadius: 7, fontSize: 12,
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: page === 1 ? 'var(--faint)' : 'var(--tx)',
              cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >← Prev</button>
          <span style={{ padding: '6px 10px', fontSize: 12, color: 'var(--muted)' }}>
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            style={{
              padding: '6px 12px', borderRadius: 7, fontSize: 12,
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: page === pages ? 'var(--faint)' : 'var(--tx)',
              cursor: page === pages ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >Next →</button>
        </div>
      )}
    </div>
  );
}

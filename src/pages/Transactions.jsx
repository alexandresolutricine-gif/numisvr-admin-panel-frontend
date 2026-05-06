import { useEffect, useState, useCallback } from 'react';
import useAuthStore from '../store/authStore';
import { getTransactions } from '../services/api';

const STATUS_TABS = ['all', 'confirmed', 'pending', 'failed'];

export default function Transactions() {
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getTransactions(token, { page, limit: 20, status })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, page, status]);

  useEffect(() => {
    load();
  }, [load]);

  function handleTabChange(t) {
    setStatus(t);
    setPage(1);
  }

  const txns = data?.transactions || [];
  const totalPages = data?.pages || 1;

  function statusColor(s) {
    if (s === 'confirmed') return '#34d399';
    if (s === 'failed') return '#f87171';
    return '#f59e0b';
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>Transactions</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>All USDT purchase transactions</p>
      </div>

      {/* Status tabs */}
      <div
        style={{
          display: 'inline-flex',
          gap: 4,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 4,
          marginBottom: 20,
        }}
      >
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'capitalize',
              border: 'none',
              cursor: 'pointer',
              background: status === t ? 'var(--hover-3)' : 'transparent',
              color: status === t ? 'var(--tx)' : 'var(--muted)',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr 1fr',
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--subtle)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <span>Tx Hash</span>
          <span>User</span>
          <span>Amount (USDT)</span>
          <span>Tokens</span>
          <span>Status</span>
          <span>Date</span>
        </div>

        {loading && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{ padding: '20px', color: '#f87171', fontSize: 13 }}>{error}</div>
        )}

        {!loading && !error && txns.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No transactions found.
          </div>
        )}

        {!loading && txns.map((tx, i) => {
          const user = tx.users || {};
          const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || '—';
          return (
            <div
              key={tx.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr 1fr',
                padding: '13px 20px',
                borderBottom: i < txns.length - 1 ? '1px solid var(--border-3)' : 'none',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tx.tx_hash ? `${tx.tx_hash.slice(0, 12)}…${tx.tx_hash.slice(-6)}` : '—'}
              </span>
              <div>
                <div style={{ fontSize: 13, color: 'var(--tx)', fontWeight: 500 }}>{userName}</div>
                {user.email && userName !== user.email && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{user.email}</div>
                )}
              </div>
              <span style={{ fontSize: 13, color: 'var(--tx)' }}>
                ${Number(tx.amount_usdt || 0).toLocaleString()}
              </span>
              <span style={{ fontSize: 13, color: 'var(--tx)' }}>
                {Number(tx.token_amount || 0).toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  color: statusColor(tx.status),
                }}
              >
                {tx.status}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: page === 1 ? 'var(--subtle)' : 'var(--tx-2)',
              fontSize: 13,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Prev
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: page === totalPages ? 'var(--subtle)' : 'var(--tx-2)',
              fontSize: 13,
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

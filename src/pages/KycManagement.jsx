import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getKycUsers } from '../services/api';

const TABS = ['all', 'pending', 'approved', 'rejected'];

const STATUS_STYLE = {
  pending:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
  approved: { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)' },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { color: 'var(--muted)', bg: 'var(--item)', border: 'var(--border)' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'capitalize',
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
      }}
    >
      {status || 'unknown'}
    </span>
  );
}

export default function KycManagement() {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();

  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getKycUsers(token, { status: tab, page, limit: 20, search })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, tab, page, search]);

  useEffect(() => {
    load();
  }, [load]);

  function handleTabChange(t) {
    setTab(t);
    setPage(1);
  }

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  const users = data?.users || [];
  const totalPages = data?.pages || 1;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>KYC Management</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Review and approve user identity verification</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Status tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 4,
          }}
        >
          {TABS.map((t) => (
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
                background: tab === t ? 'var(--hover-3)' : 'transparent',
                color: tab === t ? 'var(--tx)' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name or email…"
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              background: 'var(--item-2)',
              border: '1px solid var(--border-2)',
              color: 'var(--tx)',
              fontSize: 13,
              outline: 'none',
              width: 220,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--tx-2)',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Search
          </button>
        </form>
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
            gridTemplateColumns: '1fr 1.5fr 1fr 1fr 80px',
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--subtle)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <span>Name</span>
          <span>Email</span>
          <span>Country</span>
          <span>Status</span>
          <span></span>
        </div>

        {loading && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{ padding: '20px', color: '#f87171', fontSize: 13 }}>{error}</div>
        )}

        {!loading && !error && users.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No users found.
          </div>
        )}

        {!loading && users.map((u, i) => (
          <div
            key={u.id}
            onClick={() => navigate(`/kyc/${u.id}`)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.5fr 1fr 1fr 80px',
              padding: '14px 20px',
              borderBottom: i < users.length - 1 ? '1px solid var(--border-3)' : 'none',
              cursor: 'pointer',
              transition: 'background 0.12s',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>
              {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : '—'}
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{u.email}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{u.country || '—'}</span>
            <span><StatusBadge status={u.kyc_status} /></span>
            <span style={{ fontSize: 12, color: 'var(--subtle)' }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          </div>
        ))}
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

import { useEffect, useState } from 'react';
import useAuthStore from '../store/authStore';
import { getStats } from '../services/api';

function StatCard({ label, value, sub, accent }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || 'var(--tx)', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--subtle)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const token = useAuthStore((s) => s.token);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats(token)
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  function fmt(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString();
  }

  function fmtUsdt(n) {
    if (n == null) return '—';
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Overview of NUVR ICO activity</p>
      </div>

      {loading && (
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading stats…</div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* KYC stats */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              KYC
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              <StatCard label="Total Users" value={fmt(stats.totalUsers)} />
              <StatCard label="Pending KYC" value={fmt(stats.pendingKyc)} accent="#f59e0b" />
              <StatCard label="Approved" value={fmt(stats.approvedKyc)} accent="#34d399" />
              <StatCard label="Rejected" value={fmt(stats.rejectedKyc)} accent="#f87171" />
            </div>
          </div>

          {/* ICO stats */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              ICO
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              <StatCard
                label="Total Raised"
                value={fmtUsdt(stats.totalRaised)}
                sub="USDT (confirmed txns)"
                accent="#60a5fa"
              />
              <StatCard
                label="Tokens Sold"
                value={fmt(stats.totalTokensSold)}
                sub="NUVR allocated"
                accent="#a78bfa"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

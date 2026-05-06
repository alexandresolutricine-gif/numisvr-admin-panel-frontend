import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getKycUser, updateKycStatus } from '../services/api';

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
        padding: '3px 12px',
        borderRadius: 20,
        fontSize: 12,
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

function Field({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{
        fontSize: 13,
        color: value ? 'var(--tx)' : 'var(--faint)',
        fontFamily: mono ? 'monospace' : 'inherit',
        wordBreak: 'break-all',
        overflowWrap: 'anywhere',
      }}>
        {value || '—'}
      </span>
    </div>
  );
}

export default function KycUserDetail() {
  const { userId } = useParams();
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    getKycUser(token, userId)
      .then((d) => {
        setUser(d.user);
        setTransactions(d.transactions || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, userId]);

  async function handleStatus(status) {
    setUpdating(true);
    setActionError('');
    try {
      const updated = await updateKycStatus(token, userId, status);
      setUser((u) => ({ ...u, kyc_status: updated.kyc_status }));
    } catch (e) {
      setActionError(e.message);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, color: 'var(--muted)', fontSize: 14 }}>Loading…</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: '#f87171', fontSize: 14 }}>{error}</div>
    );
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      {/* Back */}
      <button
        onClick={() => navigate('/kyc')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          fontSize: 13,
          cursor: 'pointer',
          padding: 0,
          marginBottom: 24,
          fontFamily: 'inherit',
        }}
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to KYC
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>{fullName}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{user.email}</span>
            <StatusBadge status={user.kyc_status} />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {user.kyc_status !== 'approved' && (
            <button
              onClick={() => handleStatus('approved')}
              disabled={updating}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                background: 'rgba(52,211,153,0.12)',
                border: '1px solid rgba(52,211,153,0.3)',
                color: '#34d399',
                fontSize: 13,
                fontWeight: 600,
                cursor: updating ? 'not-allowed' : 'pointer',
                opacity: updating ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              Approve
            </button>
          )}
          {user.kyc_status !== 'rejected' && (
            <button
              onClick={() => handleStatus('rejected')}
              disabled={updating}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(248,113,113,0.25)',
                color: '#f87171',
                fontSize: 13,
                fontWeight: 600,
                cursor: updating ? 'not-allowed' : 'pointer',
                opacity: updating ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              Reject
            </button>
          )}
          {user.kyc_status !== 'pending' && (
            <button
              onClick={() => handleStatus('pending')}
              disabled={updating}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
                color: '#f59e0b',
                fontSize: 13,
                fontWeight: 600,
                cursor: updating ? 'not-allowed' : 'pointer',
                opacity: updating ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              Reset to Pending
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {actionError}
        </div>
      )}

      {/* Identity info */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-2)', marginBottom: 20 }}>Identity Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
          <Field label="First Name" value={user.first_name} />
          <Field label="Last Name" value={user.last_name} />
          <Field label="Email" value={user.email} />
          <Field label="Country" value={user.country} />
          <Field label="City" value={user.city} />
          <Field label="Postal Code" value={user.postal_code} />
          <Field label="Address Line 1" value={user.address_line1} />
          <Field label="Address Line 2" value={user.address_line2} />
          <Field label="Source of Funds" value={user.source_funds} />
          <Field label="PEP" value={user.pep != null ? (user.pep ? 'Yes' : 'No') : null} />
          <Field label="T&C Accepted" value={user.accept_tc ? 'Yes' : 'No'} />
          <Field label="T&C Accepted At" value={user.accepted_tc_at ? new Date(user.accepted_tc_at).toLocaleString() : null} />
          <Field label="Compliance Timestamp" value={user.compliance_timestamp ? new Date(user.compliance_timestamp).toLocaleString() : null} />
          <Field label="Wallet" value={user.wallet_address} mono />
        </div>
      </div>

      {/* Transactions */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--tx-2)' }}>
          Transactions ({transactions.length})
        </div>

        {transactions.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No transactions yet.
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr',
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
              <span>Amount (USDT)</span>
              <span>Tokens</span>
              <span>Status</span>
              <span>Date</span>
            </div>
            {transactions.map((tx, i) => (
              <div
                key={tx.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr',
                  padding: '13px 20px',
                  borderBottom: i < transactions.length - 1 ? '1px solid var(--border-3)' : 'none',
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
                    color:
                      tx.status === 'confirmed'
                        ? '#34d399'
                        : tx.status === 'failed'
                        ? '#f87171'
                        : '#f59e0b',
                  }}
                >
                  {tx.status}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback, useRef } from 'react';
import useAuthStore from '../store/authStore';
import { getKycUsers, getKycUser, updateKycStatus } from '../services/api';

const STATUS_STYLE = {
  pending:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
  approved: { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)' },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { color: 'var(--muted)', bg: 'var(--item)', border: 'var(--border)' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'capitalize',
      color: s.color,
      background: s.bg,
      border: `1px solid ${s.border}`,
      flexShrink: 0,
    }}>
      {status || 'none'}
    </span>
  );
}

function Field({ label, value, mono, wide }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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

// ── User list panel ────────────────────────────────────────────
function UserList({ token, selectedId, onSelect }) {
  const [users, setUsers]         = useState([]);
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getKycUsers(token, { status: 'all', page, limit: 30, search })
      .then((d) => {
        setUsers(d.users || []);
        setTotalPages(d.pages || 1);
      })
      .finally(() => setLoading(false));
  }, [token, page, search]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div style={{
      width: 280,
      minWidth: 280,
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--surface)',
    }}>
      {/* Search */}
      <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--border)' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search users…"
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: 7,
              background: 'var(--item-2)',
              border: '1px solid var(--border-2)',
              color: 'var(--tx)',
              fontSize: 12,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button type="submit" style={{
            padding: '7px 10px',
            borderRadius: 7,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>
        </form>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '20px 14px', color: 'var(--muted)', fontSize: 12 }}>Loading…</div>
        )}
        {!loading && users.length === 0 && (
          <div style={{ padding: '20px 14px', color: 'var(--muted)', fontSize: 12 }}>No users found.</div>
        )}
        {!loading && users.map((u) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
          const isSelected = u.id === selectedId;
          return (
            <div
              key={u.id}
              onClick={() => onSelect(u.id)}
              style={{
                padding: '11px 14px',
                borderBottom: '1px solid var(--border-3)',
                cursor: 'pointer',
                background: isSelected ? 'var(--hover-3)' : 'transparent',
                borderLeft: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--hover)'; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--tx)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {name}
                </span>
                <StatusBadge status={u.kyc_status} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.email}
              </div>
              {u.country && (
                <div style={{ fontSize: 11, color: 'var(--subtle)', marginTop: 2 }}>{u.country}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--item-2)',
              border: '1px solid var(--border)',
              color: page === 1 ? 'var(--faint)' : 'var(--tx-2)',
              fontSize: 11,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >← Prev</button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--item-2)',
              border: '1px solid var(--border)',
              color: page === totalPages ? 'var(--faint)' : 'var(--tx-2)',
              fontSize: 11,
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >Next →</button>
        </div>
      )}
    </div>
  );
}

// ── User detail panel ──────────────────────────────────────────
function UserDetail({ token, userId, onStatusChange }) {
  const [user, setUser]               = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [updating, setUpdating]       = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setUser(null);
    setError('');
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
    try {
      const updated = await updateKycStatus(token, userId, status);
      setUser((u) => ({ ...u, kyc_status: updated.kyc_status }));
      onStatusChange?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating(false);
    }
  }

  if (!userId) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        color: 'var(--subtle)',
      }}>
        <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.2" opacity="0.4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
        <span style={{ fontSize: 13 }}>Select a user to view details</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (error || !user) {
    return (
      <div style={{ flex: 1, padding: 32, color: '#f87171', fontSize: 13 }}>{error || 'User not found.'}</div>
    );
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';
  const s = STATUS_STYLE[user.kyc_status];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--muted)',
              flexShrink: 0,
            }}>
              {(user.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)' }}>{fullName}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{user.email}</div>
            </div>
          </div>
          {/* Status + joined */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {s ? (
              <span style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'capitalize',
                color: s.color,
                background: s.bg,
                border: `1px solid ${s.border}`,
              }}>
                {user.kyc_status}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>No KYC</span>
            )}
            {user.created_at && (
              <span style={{ fontSize: 11, color: 'var(--subtle)' }}>
                Joined {new Date(user.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user.kyc_status !== 'approved' && (
            <button onClick={() => handleStatus('approved')} disabled={updating} style={{
              padding: '7px 14px', borderRadius: 7,
              background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
              color: '#34d399', fontSize: 12, fontWeight: 600,
              cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1, fontFamily: 'inherit',
            }}>Approve</button>
          )}
          {user.kyc_status !== 'rejected' && (
            <button onClick={() => handleStatus('rejected')} disabled={updating} style={{
              padding: '7px 14px', borderRadius: 7,
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
              color: '#f87171', fontSize: 12, fontWeight: 600,
              cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1, fontFamily: 'inherit',
            }}>Reject</button>
          )}
          {user.kyc_status !== 'pending' && (
            <button onClick={() => handleStatus('pending')} disabled={updating} style={{
              padding: '7px 14px', borderRadius: 7,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              color: '#f59e0b', fontSize: 12, fontWeight: 600,
              cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1, fontFamily: 'inherit',
            }}>Pending</button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Identity */}
      <Section title="Identity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="First Name" value={user.first_name} />
          <Field label="Last Name" value={user.last_name} />
          <Field label="Email" value={user.email} />
          <Field label="Country" value={user.country} />
          <Field label="City" value={user.city} />
          <Field label="Postal Code" value={user.postal_code} />
          <Field label="Address Line 1" value={user.address_line1} wide />
          <Field label="Address Line 2" value={user.address_line2} wide />
          <Field label="Source of Funds" value={user.source_funds} />
          <Field label="PEP" value={user.pep != null ? (user.pep ? 'Yes' : 'No') : null} />
          <Field label="T&C Accepted" value={user.accept_tc ? 'Yes' : 'No'} />
          <Field label="T&C Accepted At" value={user.accepted_tc_at ? new Date(user.accepted_tc_at).toLocaleString() : null} />
          <Field label="Compliance Timestamp" value={user.compliance_timestamp ? new Date(user.compliance_timestamp).toLocaleString() : null} />
          <Field label="Joined" value={user.created_at ? new Date(user.created_at).toLocaleString() : null} />
          <Field label="Wallet Address" value={user.wallet_address} mono wide />
        </div>
      </Section>

      {/* Transactions */}
      <Section title={`Transactions (${transactions.length})`}>
        {transactions.length === 0 ? (
          <div style={{ padding: '16px 0', color: 'var(--muted)', fontSize: 12 }}>No transactions yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transactions.map((tx) => (
              <div key={tx.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr auto',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--item)',
                border: '1px solid var(--border-3)',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--subtle)', marginBottom: 2 }}>Amount</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>
                    ${Number(tx.amount_usdt || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--subtle)', marginBottom: 2 }}>Tokens</div>
                  <div style={{ fontSize: 13, color: 'var(--tx)' }}>
                    {Number(tx.token_amount || 0).toLocaleString()} NUVR
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--subtle)', marginBottom: 2 }}>Date</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                  </div>
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  color: tx.status === 'confirmed' ? '#34d399' : tx.status === 'failed' ? '#f87171' : '#f59e0b',
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: tx.status === 'confirmed' ? 'rgba(52,211,153,0.1)' : tx.status === 'failed' ? 'rgba(248,113,113,0.1)' : 'rgba(245,158,11,0.1)',
                  border: `1px solid ${tx.status === 'confirmed' ? 'rgba(52,211,153,0.25)' : tx.status === 'failed' ? 'rgba(248,113,113,0.2)' : 'rgba(245,158,11,0.2)'}`,
                }}>
                  {tx.status}
                </span>
              </div>
            ))}
          </div>
        )}
        {transactions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {transactions[0]?.tx_hash && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tx Hash</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {transactions[0].tx_hash}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--tx-2)',
      }}>
        {title}
      </div>
      <div style={{ padding: '16px' }}>
        {children}
      </div>
    </div>
  );
}

// ── Main Users page ────────────────────────────────────────────
export default function Users() {
  const token = useAuthStore((s) => s.token);
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <UserList
        token={token}
        selectedId={selectedId}
        onSelect={setSelectedId}
        key={refreshKey}
      />
      <UserDetail
        token={token}
        userId={selectedId}
        onStatusChange={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Connection, Transaction } from '@solana/web3.js';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import useAuthStore from '../store/authStore';
import {
  getSettings, updateSettings, getProfile, updateProfile,
  getIcoState, buildSetTgeTx, buildSetPausedTx, buildSetTreasuryTx, buildSetVestingScheduleTx,
  buildFundVaultTx, buildTransferFromVaultTx, getVaultBalances,
  buildSetAuthorityTx, createLog,
} from '../services/api';

const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet.solana.com';

// WalletConnect (Reown) configuration. The project ID is required and must be
// supplied via env — get one at https://cloud.reown.com. Without it, the
// WalletConnect option surfaces a clear "not configured" error on use.
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
const WALLETCONNECT_NETWORK = /main/i.test(import.meta.env.VITE_SOLANA_NETWORK || 'mainnet')
  ? WalletAdapterNetwork.Mainnet
  : WalletAdapterNetwork.Devnet;

// Lazily-created singleton. Instantiating the adapter spins up the WalletConnect
// relay client, so we defer it until the user actually picks WalletConnect.
let _wcAdapter = null;
function getWalletConnectAdapter() {
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error('WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID in the admin environment.');
  }
  if (!_wcAdapter) {
    _wcAdapter = new WalletConnectWalletAdapter({
      network: WALLETCONNECT_NETWORK,
      options: {
        projectId: WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: 'NUVR ICO Admin',
          description: 'NUVR ICO admin panel',
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.ico`],
        },
      },
    });
  }
  return _wcAdapter;
}

// WalletConnect is a relay-based protocol, not an injected extension, so it is
// always offered in the picker rather than detected on `window`.
const WALLET_CONNECT_OPTION = { name: 'WalletConnect', isWalletConnect: true };

const ANCHOR_ERROR_CODES = {
  6000: 'Purchases are paused', 6001: 'Amount must be greater than zero',
  6002: 'Amount exceeds the NUVR sale cap', 6004: 'TGE has not started yet',
  6005: 'Invalid TGE timestamp', 6006: 'TGE already started',
  6007: 'Unauthorized', 6008: 'Invalid address',
  6009: 'Vault balance is too low', 6010: 'Insufficient USDT balance',
};

/** Extract a human-readable message from a Solana/Anchor transaction error. */
function extractAnchorError(err) {
  const logs = err.logs ?? err.transactionLogs ?? [];
  for (const log of logs) {
    const m = log.match(/Error Message:\s*(\S(?:.*\S)?)/);
    if (m) {
      const msg = m[1];
      return msg.endsWith('.') ? msg.slice(0, -1) : msg;
    }
  }
  const hexMatch = (err.message || '').match(/custom program error: 0x([0-9a-f]+)/i);
  if (hexMatch) {
    const code = Number.parseInt(hexMatch[1], 16);
    if (ANCHOR_ERROR_CODES[code]) return ANCHOR_ERROR_CODES[code];
  }
  return err.message || 'Transaction failed';
}

/** Sign, submit, and confirm a base64-encoded unsigned transaction. */
async function submitOnChainTx(provider, base64Tx, blockhash, lastValidBlockHeight) {
  const bytes = Uint8Array.from(atob(base64Tx), (c) => c.charCodeAt(0));
  const tx = Transaction.from(bytes);
  const signedTx = await provider.signTransaction(tx);
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  let txid;
  try {
    txid = await conn.sendRawTransaction(signedTx.serialize());
  } catch (err) {
    throw new Error(extractAnchorError(err));
  }
  const confirmation = await conn.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
  if (confirmation.value?.err) {
    const instErr = confirmation.value.err?.InstructionError;
    if (Array.isArray(instErr) && instErr[1]?.Custom != null) {
      throw new Error(ANCHOR_ERROR_CODES[instErr[1].Custom] ?? `On-chain error (code ${instErr[1].Custom})`);
    }
    throw new Error('Transaction failed on-chain');
  }
  return txid;
}

function detectWallets() {
  const found = [];
  if (window.phantom?.solana) found.push({ name: 'Phantom', provider: window.phantom.solana });
  else if (window.solana?.isPhantom) found.push({ name: 'Phantom', provider: window.solana });
  if (window.solflare?.isSolflare) found.push({ name: 'Solflare', provider: window.solflare });
  if (window.backpack?.isBackpack) found.push({ name: 'Backpack', provider: window.backpack });
  if (window.glow?.isGlow) found.push({ name: 'Glow', provider: window.glow });
  if (window.coin98?.sol) found.push({ name: 'Coin98', provider: window.coin98.sol });
  if (window.solana && !window.solana.isPhantom && !found.some(w => w.provider === window.solana)) {
    found.push({ name: 'Solana Wallet', provider: window.solana });
  }
  return found;
}

// status: 'idle' | 'connecting' | 'authorized' | 'mismatch' | 'no_wallet_set'
function useAdminWallet(token, authorityKey) {
  const [status, setStatus] = useState('idle');
  const [connectedKey, setConnectedKey] = useState(null);
  const [connectedName, setConnectedName] = useState('');
  const [connectedProvider, setConnectedProvider] = useState(null);
  const [storedKey, setStoredKey] = useState(null);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [availableWallets, setAvailableWallets] = useState([]);

  useEffect(() => {
    if (!token) return;
    getProfile(token)
      .then((p) => setStoredKey(p.wallet_address || null))
      .catch(() => { });
  }, [token]);

  // On-chain authority overrides the DB-stored wallet address as the
  // authoritative key. Re-evaluate authorization if wallet already connected.
  useEffect(() => {
    if (!authorityKey) return;
    setStoredKey(authorityKey);
    if (connectedKey) {
      setStatus(connectedKey === authorityKey ? 'authorized' : 'mismatch');
    }
  }, [authorityKey, connectedKey]);

  const openPicker = useCallback(() => {
    setError('');
    // WalletConnect is always available (no extension required), so it is
    // appended to whatever injected wallets are detected.
    const wallets = [...detectWallets(), WALLET_CONNECT_OPTION];
    setAvailableWallets(wallets);
    setShowPicker(true);
  }, [storedKey]);

  const connectTo = useCallback(async ({ name, provider, isWalletConnect }) => {
    setShowPicker(false);
    setStatus('connecting');
    setError('');
    try {
      // For WalletConnect, resolve the adapter lazily; it opens its own QR /
      // deep-link modal on connect(). Injected wallets pass their provider directly.
      const activeProvider = isWalletConnect ? getWalletConnectAdapter() : provider;
      const resp = await activeProvider.connect({ onlyIfTrusted: false });
      const rawKey = resp?.publicKey ?? activeProvider.publicKey;
      if (!rawKey) throw new Error('Wallet connected but no public key returned.');
      const pk = typeof rawKey.toString === 'function' ? rawKey.toString() : String(rawKey);
      setConnectedKey(pk);
      setConnectedName(name);
      setConnectedProvider(activeProvider);

      if (!storedKey) {
        setStatus('no_wallet_set');
      } else if (pk === storedKey) {
        setStatus('authorized');
      } else {
        setStatus('mismatch');
      }
    } catch (e) {
      setStatus('idle');
      setError(e.message || 'Connection cancelled.');
    }
  }, [storedKey]);

  const disconnect = useCallback(() => {
    detectWallets().forEach(({ provider }) => provider.disconnect?.());
    _wcAdapter?.disconnect?.();
    setConnectedKey(null);
    setConnectedName('');
    setConnectedProvider(null);
    setStatus('idle');
    setError('');
  }, []);

  return {
    status, connectedKey, connectedName, connectedProvider, storedKey, error,
    showPicker, setShowPicker, availableWallets,
    openPicker, connectTo, disconnect,
    isAuthorized: status === 'authorized',
  };
}


/** Convert a unix timestamp (seconds) to the value format expected by datetime-local inputs: "YYYY-MM-DDTHH:MM" in the browser's local timezone. */
function tsToLocalDatetimeLocal(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


function Addr({ value }) {
  if (!value) return <span style={{ color: 'var(--faint)' }}>—</span>;
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
      {value.slice(0, 6)}…{value.slice(-4)}
    </span>
  );
}
Addr.propTypes = { value: PropTypes.string };

function WalletCard({ status, connectedKey, connectedName, storedKey, error, onConnect, onDisconnect }) {
  const btn = (label, onClick, color) => (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
      border: `1px solid ${color}33`, background: `${color}11`, color,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  );

  const states = {
    idle: {
      border: 'var(--border)',
      badge: null,
      body: <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        {storedKey
          ? <>Authorized wallet: <Addr value={storedKey} />. Connect it to proceed.</>
          : 'No wallet address set for this admin account. Contact your system administrator.'}
      </p>,
      action: storedKey ? btn('Connect Wallet', onConnect, '#a78bfa') : null,
    },
    connecting: {
      border: 'var(--border)',
      badge: <span style={{ fontSize: 11, color: 'var(--muted)' }}>Connecting…</span>,
      body: null,
      action: null,
    },
    no_wallet_set: {
      border: 'rgba(245,158,11,0.35)',
      badge: <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>No Wallet on Record</span>,
      body: <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        Connected <strong style={{ color: 'var(--tx)' }}>{connectedName}</strong> (<Addr value={connectedKey} />),
        but no wallet address is set for this admin account. Ask your system admin to set it in the database.
      </p>,
      action: btn('Disconnect', onDisconnect, '#f87171'),
    },
    mismatch: {
      border: 'rgba(248,113,113,0.4)',
      badge: <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>Wrong Wallet</span>,
      body: <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        Connected <Addr value={connectedKey} /> does not match the authorized wallet <Addr value={storedKey} />.
        Only the registered wallet can perform on-chain operations.
      </p>,
      action: btn('Disconnect', onDisconnect, '#f87171'),
    },
    authorized: {
      border: 'rgba(52,211,153,0.35)',
      badge: <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>Authorized</span>,
      body: <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        <strong style={{ color: 'var(--tx)' }}>{connectedName}</strong>: <Addr value={connectedKey} />
      </p>,
      action: btn('Disconnect', onDisconnect, '#f87171'),
    },
  };

  const s = states[status] || states.idle;

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${s.border}`,
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 20,
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Admin Wallet</span>
          {s.badge}
        </div>
        {s.action}
      </div>
      {s.body}
      {error && <p style={{ fontSize: 11, color: '#f87171', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
WalletCard.propTypes = {
  status: PropTypes.string.isRequired,
  connectedKey: PropTypes.string,
  connectedName: PropTypes.string,
  storedKey: PropTypes.string,
  error: PropTypes.string,
  onConnect: PropTypes.func.isRequired,
  onDisconnect: PropTypes.func.isRequired,
};

// ── On-chain status + pause/resume card ─────────────────────────────────────

function IcoStateCard({ icoState, icoStateError, isAuthorized, connectedKey, connectedProvider, token, onStateChange }) {
  const [txPhase, setTxPhase] = useState('idle');
  const [txError, setTxError] = useState('');
  const [txId, setTxId] = useState('');

  const [newTreasury, setNewTreasury] = useState('');
  const [treasuryPhase, setTreasuryPhase] = useState('idle');
  const [treasuryError, setTreasuryError] = useState('');
  const [treasuryTxId, setTreasuryTxId] = useState('');

  const [newAuthority, setNewAuthority] = useState('');
  const [authorityPhase, setAuthorityPhase] = useState('idle');
  const [authorityError, setAuthorityError] = useState('');
  const [authorityTxId, setAuthorityTxId] = useState('');

  async function handlePauseToggle() {
    if (!isAuthorized || !connectedProvider) return;
    const targetPaused = !icoState.paused;
    setTxPhase('building');
    setTxError('');
    setTxId('');
    try {
      const txData = await buildSetPausedTx(token, { wallet: connectedKey, paused: targetPaused });
      setTxPhase('signing');
      const txid = await submitOnChainTx(connectedProvider, txData.unsigned_transaction, txData.blockhash, txData.last_valid_block_height);
      setTxId(txid);
      setTxPhase('done');
      createLog(token, { action_type: 'set_paused', description: `ICO ${targetPaused ? 'paused' : 'resumed'}`, tx_signature: txid, metadata: { paused: targetPaused } });
      onStateChange();
    } catch (e) {
      setTxPhase('error');
      setTxError(e.message || 'Transaction failed');
    }
  }

  async function handleSetTreasury() {
    if (!isAuthorized || !connectedProvider || !newTreasury.trim()) return;
    setTreasuryPhase('building');
    setTreasuryError('');
    setTreasuryTxId('');
    try {
      const txData = await buildSetTreasuryTx(token, { wallet: connectedKey, treasury: newTreasury.trim() });
      setTreasuryPhase('signing');
      const txid = await submitOnChainTx(connectedProvider, txData.unsigned_transaction, txData.blockhash, txData.last_valid_block_height);
      setTreasuryTxId(txid);
      setTreasuryPhase('done');
      setNewTreasury('');
      createLog(token, { action_type: 'set_treasury', description: `Treasury updated to ${newTreasury.trim()}`, tx_signature: txid, metadata: { treasury: newTreasury.trim() } });
      onStateChange();
    } catch (e) {
      setTreasuryPhase('error');
      setTreasuryError(e.message || 'Transaction failed');
    }
  }

  async function handleSetAuthority() {
    if (!isAuthorized || !connectedProvider || !newAuthority.trim()) return;
    const targetAuthority = newAuthority.trim();
    setAuthorityPhase('building');
    setAuthorityError('');
    setAuthorityTxId('');
    try {
      const txData = await buildSetAuthorityTx(token, { wallet: connectedKey, new_authority: targetAuthority });
      setAuthorityPhase('signing');
      const txid = await submitOnChainTx(connectedProvider, txData.unsigned_transaction, txData.blockhash, txData.last_valid_block_height);
      setAuthorityTxId(txid);

      // Update the Database Admin Profile to use the new wallet so they don't get "Wrong Wallet" errors
      await updateProfile(token, { wallet_address: targetAuthority });

      setAuthorityPhase('done');
      setNewAuthority('');
      createLog(token, { action_type: 'set_authority', description: `Authority transferred to ${targetAuthority}`, tx_signature: txid, metadata: { new_authority: targetAuthority } });
      onStateChange();
      setTimeout(() => globalThis.location.reload(), 2500); // refresh the auth state
    } catch (e) {
      setAuthorityPhase('error');
      setAuthorityError(e.message || 'Transaction failed');
    }
  }

  if (icoStateError) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>On-Chain ICO State</div>
        <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{icoStateError}</p>
      </div>
    );
  }

  if (!icoState) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>On-Chain ICO State</div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Loading on-chain state…</p>
      </div>
    );
  }

  const tgeDateStr = icoState.tgeTs
    ? new Date(icoState.tgeTs * 1000).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
      timeZoneName: 'longGeneric',
    })
    : 'Not set';

  const isbusy = txPhase === 'building' || txPhase === 'signing' || txPhase === 'submitting';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 12 }}>On-Chain ICO State</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 12 }}>
        <StateRow label="TGE Date" value={tgeDateStr} />
        <StateRow label="Vesting" value={icoState.vestingMonths ? `${icoState.vestingMonths} months` : '—'} />
        <StateRow label="Cliff" value={icoState.cliffMonths == null ? '—' : `${icoState.cliffMonths} months`} />
        <StateRow label="Authority" value={<Addr value={icoState.authority} />} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>ICO Status:</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: icoState.paused ? '#f59e0b' : '#34d399' }}>
            {icoState.paused ? 'Paused' : 'Active'}
          </span>
        </div>
        {isAuthorized && (
          <button
            onClick={handlePauseToggle}
            disabled={isbusy}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: icoState.paused ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(245,158,11,0.3)',
              background: icoState.paused ? 'rgba(52,211,153,0.08)' : 'rgba(245,158,11,0.08)',
              color: icoState.paused ? '#34d399' : '#f59e0b',
              cursor: isbusy ? 'not-allowed' : 'pointer',
              opacity: isbusy ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            {isbusy
              ? txPhase === 'building' ? 'Building…'
                : txPhase === 'signing' ? 'Sign in wallet…'
                  : 'Submitting…'
              : icoState.paused ? 'Resume ICO' : 'Pause ICO'}
          </button>
        )}
      </div>

      {txPhase === 'done' && txId && (
        <p style={{ fontSize: 11, color: '#34d399', marginTop: 8 }}>
          Done — tx: <span style={{ fontFamily: 'monospace' }}>{txId.slice(0, 12)}…</span>
        </p>
      )}
      {txPhase === 'error' && (
        <p style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>{txError}</p>
      )}

      {/* Treasury wallet change */}
      <div style={{ paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
          Current treasury: <span style={{ fontFamily: 'monospace', color: 'var(--tx)' }}>{icoState.treasury}</span>
        </div>
        {isAuthorized ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newTreasury}
                onChange={(e) => { setNewTreasury(e.target.value); setTreasuryPhase('idle'); setTreasuryError(''); }}
                placeholder="New treasury wallet address"
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: 7,
                  background: 'var(--item-2)',
                  border: '1px solid var(--border-2)',
                  color: 'var(--tx)',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSetTreasury}
                disabled={!newTreasury.trim() || treasuryPhase === 'building' || treasuryPhase === 'signing' || treasuryPhase === 'submitting'}
                style={{
                  padding: '7px 14px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid rgba(167,139,250,0.3)',
                  background: 'rgba(167,139,250,0.08)',
                  color: '#a78bfa',
                  cursor: !newTreasury.trim() || ['building', 'signing', 'submitting'].includes(treasuryPhase) ? 'not-allowed' : 'pointer',
                  opacity: !newTreasury.trim() || ['building', 'signing', 'submitting'].includes(treasuryPhase) ? 0.5 : 1,
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {treasuryPhase === 'building' ? 'Building…'
                  : treasuryPhase === 'signing' ? 'Sign in wallet…'
                    : treasuryPhase === 'submitting' ? 'Submitting…'
                      : 'Set Treasury'}
              </button>
            </div>
            {treasuryPhase === 'done' && treasuryTxId && (
              <p style={{ fontSize: 11, color: '#34d399', marginTop: 6 }}>
                Treasury updated — tx: <span style={{ fontFamily: 'monospace' }}>{treasuryTxId.slice(0, 12)}…</span>
              </p>
            )}
            {treasuryPhase === 'error' && treasuryError && (
              <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{treasuryError}</p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--subtle)', margin: 0 }}>Connect authorized wallet to manage ICO state.</p>
        )}
      </div>

      {/* Transfer authority */}
      <div style={{ paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
          Current authority: <span style={{ fontFamily: 'monospace', color: 'var(--tx)' }}>{icoState.authority}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 6 }}>
          Transfers admin authority of the ICO program to a new wallet. This is irreversible unless the new authority transfers it back.
        </div>
        {isAuthorized ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newAuthority}
                onChange={(e) => { setNewAuthority(e.target.value); setAuthorityPhase('idle'); setAuthorityError(''); }}
                placeholder="New authority wallet address"
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: 7,
                  background: 'var(--item-2)',
                  border: '1px solid var(--border-2)',
                  color: 'var(--tx)',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSetAuthority}
                disabled={!newAuthority.trim() || ['building', 'signing', 'submitting'].includes(authorityPhase)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid rgba(251,113,133,0.3)',
                  background: 'rgba(251,113,133,0.08)',
                  color: '#fb7185',
                  cursor: !newAuthority.trim() || ['building', 'signing', 'submitting'].includes(authorityPhase) ? 'not-allowed' : 'pointer',
                  opacity: !newAuthority.trim() || ['building', 'signing', 'submitting'].includes(authorityPhase) ? 0.5 : 1,
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {authorityPhase === 'building' ? 'Building…'
                  : authorityPhase === 'signing' ? 'Sign in wallet…'
                    : authorityPhase === 'submitting' ? 'Submitting…'
                      : 'Transfer Authority'}
              </button>
            </div>
            {authorityPhase === 'done' && authorityTxId && (
              <p style={{ fontSize: 11, color: '#34d399', marginTop: 6 }}>
                Authority transferred — tx: <span style={{ fontFamily: 'monospace' }}>{authorityTxId.slice(0, 12)}…</span>
              </p>
            )}
            {authorityPhase === 'error' && authorityError && (
              <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{authorityError}</p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--subtle)', margin: 0 }}>Connect authorized wallet to manage ICO state.</p>
        )}
      </div>

    </div>
  );
}

IcoStateCard.propTypes = {
  icoState: PropTypes.shape({
    tgeTs: PropTypes.number,
    vestingMonths: PropTypes.number,
    cliffMonths: PropTypes.number,
    authority: PropTypes.string,
    treasury: PropTypes.string,
    paused: PropTypes.bool,
    nuvrMint: PropTypes.string,
    usdtMint: PropTypes.string,
    _source: PropTypes.string,
  }),
  icoStateError: PropTypes.string,
  isAuthorized: PropTypes.bool.isRequired,
  connectedKey: PropTypes.string,
  connectedProvider: PropTypes.object,
  token: PropTypes.string,
  onStateChange: PropTypes.func.isRequired,
};

// ── Vault Management card ─────────────────────────────────────────────────────

function VaultCard({ icoState, isAuthorized, connectedKey, connectedProvider, token }) {
  const NUVR_DECIMALS = 9;
  const USDT_DECIMALS = 6;

  const nuvrMint = icoState?.nuvrMint;
  const usdtMint = icoState?.usdtMint;

  // Vault balances
  const [vaultBalances, setVaultBalances] = useState(null);
  const [balancesKey, setBalancesKey] = useState(0);
  const refreshBalances = () => setBalancesKey((k) => k + 1);

  useEffect(() => {
    if (!token || !icoState) return;
    getVaultBalances(token)
      .then((d) => setVaultBalances(d))
      .catch(() => setVaultBalances(null));
  }, [token, icoState, balancesKey]);

  // Fund vault (treasury → vault, NUVR only)
  const [fundAmount, setFundAmount] = useState('');
  const [fundPhase, setFundPhase] = useState('idle');
  const [fundError, setFundError] = useState('');
  const [fundTxId, setFundTxId] = useState('');

  // Transfer from vault (vault → treasury)
  const [withdrawMint, setWithdrawMint] = useState('nuvr');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhase, setWithdrawPhase] = useState('idle');
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawTxId, setWithdrawTxId] = useState('');

  async function handleFundVault() {
    if (!isAuthorized || !connectedProvider || !fundAmount) return;
    setFundPhase('building'); setFundError(''); setFundTxId('');
    try {
      const txData = await buildFundVaultTx(token, {
        wallet: connectedKey, mint: nuvrMint,
        amount_ui: Number(fundAmount), decimals: NUVR_DECIMALS,
      });
      setFundPhase('signing');
      const txid = await submitOnChainTx(connectedProvider, txData.unsigned_transaction, txData.blockhash, txData.last_valid_block_height);
      setFundTxId(txid);
      setFundPhase('done');
      setFundAmount('');
      createLog(token, { action_type: 'fund_vault', description: `NUVR vault funded with ${fundAmount}`, tx_signature: txid, metadata: { mint: nuvrMint, amount: fundAmount } });
      refreshBalances();
    } catch (e) {
      setFundPhase('error');
      setFundError(e.message || 'Transaction failed');
    }
  }

  async function handleWithdraw() {
    if (!isAuthorized || !connectedProvider || !withdrawAmount) return;
    const mint = withdrawMint === 'nuvr' ? nuvrMint : usdtMint;
    const decimals = withdrawMint === 'nuvr' ? NUVR_DECIMALS : USDT_DECIMALS;
    setWithdrawPhase('building'); setWithdrawError(''); setWithdrawTxId('');
    try {
      const txData = await buildTransferFromVaultTx(token, {
        wallet: connectedKey, mint, amount_ui: Number(withdrawAmount), decimals,
      });
      setWithdrawPhase('signing');
      const txid = await submitOnChainTx(connectedProvider, txData.unsigned_transaction, txData.blockhash, txData.last_valid_block_height);
      setWithdrawTxId(txid);
      setWithdrawPhase('done');
      setWithdrawAmount('');
      createLog(token, { action_type: 'withdraw_vault', description: `${withdrawMint.toUpperCase()} vault withdrawn: ${withdrawAmount}`, tx_signature: txid, metadata: { mint: withdrawMint === 'nuvr' ? nuvrMint : usdtMint, amount: withdrawAmount } });
      refreshBalances();
    } catch (e) {
      setWithdrawPhase('error');
      setWithdrawError(e.message || 'Transaction failed');
    }
  }

  const busy = (phase) => ['building', 'signing', 'submitting'].includes(phase);

  const selectStyle = {
    padding: '7px 10px', borderRadius: 7, background: 'var(--item-2)',
    border: '1px solid var(--border-2)', color: 'var(--tx)', fontSize: 12,
    fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
  };
  const inputStyle = {
    flex: 1, padding: '7px 10px', borderRadius: 7, background: 'var(--item-2)',
    border: '1px solid var(--border-2)', color: 'var(--tx)', fontSize: 12,
    fontFamily: 'inherit', outline: 'none',
  };
  const btn = (label, onClick, disabled, color = '#a78bfa') => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
      border: `1px solid ${color}33`, background: `${color}11`, color,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      fontFamily: 'inherit', whiteSpace: 'nowrap',
    }}>{label}</button>
  );

  if (!icoState) return null;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 4 }}>Token Vault Management</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        Initialize vaults, fund the NUVR vault from treasury, and withdraw tokens from vaults back to treasury.
      </div>

      {/* ── Vault Balances ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'NUVR Vault', key: 'nuvr' },
          { label: 'USDT Vault', key: 'usdt' },
        ].map(({ label, key }) => {
          const bal = vaultBalances?.[key];
          const available = bal?.uiAmount != null
            ? bal.uiAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
            : null;
          return (
            <div key={key} style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--item-2)', padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
              {!vaultBalances ? (
                <div style={{ fontSize: 12, color: 'var(--faint)' }}>Loading…</div>
              ) : bal?.uiAmount == null ? (
                <div style={{ fontSize: 12, color: '#f59e0b' }}>Not initialized</div>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>
                  {available} <span style={{ fontSize: 10, color: 'var(--faint)', fontWeight: 400 }}>{key.toUpperCase()}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Initialize Vault ── */}
      {/* <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Initialize Vault</div>
        <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 8 }}>Creates the on-chain token account vault PDA for the selected mint. Run once per mint before any other vault operations.</div>
        {isAuthorized ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={initMint} onChange={(e) => { setInitMint(e.target.value); setInitPhase('idle'); setInitError(''); }} style={selectStyle}>
                <option value="nuvr">NUVR Vault</option>
                <option value="usdt">USDT Vault</option>
              </select>
              {btn(
                busy(initPhase) ? (initPhase === 'building' ? 'Building…' : 'Sign in wallet…') : 'Initialize Vault',
                handleInitialize, busy(initPhase),
              )}
            </div>
            {initPhase === 'done' && initTxId && <p style={{ fontSize: 11, color: '#34d399', marginTop: 6 }}>Initialized — tx: <span style={{ fontFamily: 'monospace' }}>{initTxId.slice(0, 12)}…</span></p>}
            {initPhase === 'error' && initError && <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{initError}</p>}
          </>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--faint)', margin: 0 }}>Connect authorized wallet to manage vaults.</p>
        )}
      </div> */}

      {/* ── Fund NUVR Vault ── */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Fund NUVR Vault <span style={{ color: 'var(--faint)', fontWeight: 400, textTransform: 'none' }}>(Treasury → Vault)</span></div>
        <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 8 }}>Transfer NUVR tokens from your wallet's token account into the program vault so users can claim them.</div>
        {nuvrMint && <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'monospace', marginBottom: 8 }}>Mint: {nuvrMint}</div>}
        {isAuthorized ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" value={fundAmount} onChange={(e) => { setFundAmount(e.target.value); setFundPhase('idle'); setFundError(''); }}
                placeholder="Amount (e.g. 1000)" min="0" step="any" style={inputStyle} />
              {btn(
                busy(fundPhase) ? (fundPhase === 'building' ? 'Building…' : 'Sign in wallet…') : 'Fund Vault',
                handleFundVault, busy(fundPhase) || !fundAmount,
              )}
            </div>
            {fundPhase === 'done' && fundTxId && <p style={{ fontSize: 11, color: '#34d399', marginTop: 6 }}>Funded — tx: <span style={{ fontFamily: 'monospace' }}>{fundTxId.slice(0, 12)}…</span></p>}
            {fundPhase === 'error' && fundError && <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{fundError}</p>}
          </>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--faint)', margin: 0 }}>Connect authorized wallet to manage vaults.</p>
        )}
      </div>

      {/* ── Withdraw from Vault ── */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Withdraw from Vault <span style={{ color: 'var(--faint)', fontWeight: 400, textTransform: 'none' }}>(Vault → Treasury)</span></div>
        <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 10 }}>Transfer tokens from the program vault back to the treasury token account.</div>

        {isAuthorized ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <select value={withdrawMint} onChange={(e) => { setWithdrawMint(e.target.value); setWithdrawPhase('idle'); setWithdrawError(''); }} style={selectStyle}>
                <option value="nuvr">NUVR</option>
                <option value="usdt">USDT</option>
              </select>
              <input type="number" value={withdrawAmount} onChange={(e) => { setWithdrawAmount(e.target.value); setWithdrawPhase('idle'); setWithdrawError(''); }}
                placeholder="Amount (e.g. 500)" min="0" step="any" style={inputStyle} />
              {btn(
                busy(withdrawPhase) ? (withdrawPhase === 'building' ? 'Building…' : 'Sign in wallet…') : 'Withdraw',
                handleWithdraw, busy(withdrawPhase) || !withdrawAmount, '#34d399',
              )}
            </div>
            {withdrawPhase === 'done' && withdrawTxId && <p style={{ fontSize: 11, color: '#34d399', marginTop: 6 }}>Withdrawn — tx: <span style={{ fontFamily: 'monospace' }}>{withdrawTxId.slice(0, 12)}…</span></p>}
            {withdrawPhase === 'error' && withdrawError && <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{withdrawError}</p>}
          </>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--faint)', margin: 0 }}>Connect authorized wallet to manage vaults.</p>
        )}
      </div>
    </div>
  );
}
VaultCard.propTypes = {
  icoState: PropTypes.shape({
    tgeTs: PropTypes.number,
    vestingMonths: PropTypes.number,
    cliffMonths: PropTypes.number,
    authority: PropTypes.string,
    treasury: PropTypes.string,
    paused: PropTypes.bool,
    nuvrMint: PropTypes.string,
    usdtMint: PropTypes.string,
    _source: PropTypes.string,
  }),
  isAuthorized: PropTypes.bool.isRequired,
  connectedKey: PropTypes.string,
  connectedProvider: PropTypes.object,
  token: PropTypes.string,
};

function StateRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--tx)' }}>{value}</div>
    </div>
  );
}
StateRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
};

function FeedbackBox({ type, children }) {
  const colors = {
    error: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#f87171' },
    success: { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', text: '#34d399' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', text: '#f59e0b' },
  };
  const c = colors[type] || colors.error;
  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 13 }}>
      {children}
    </div>
  );
}
FeedbackBox.propTypes = {
  type: PropTypes.oneOf(['error', 'success', 'warning']).isRequired,
  children: PropTypes.node.isRequired,
};

function SaveButton({ disabled, txPhase, saving, label }) {
  const isOnChain = txPhase === 'building' || txPhase === 'signing';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="submit"
        disabled={disabled}
        style={{
          alignSelf: 'flex-start', padding: '9px 22px', borderRadius: 8,
          background: disabled ? 'rgba(59,130,246,0.3)' : '#3b82f6',
          color: disabled ? 'rgba(255,255,255,0.4)' : '#fff',
          fontSize: 14, fontWeight: 600, border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s', fontFamily: 'inherit',
        }}
      >
        {txPhase === 'building' ? 'Building tx…'
          : txPhase === 'signing' ? 'Sign in wallet…'
            : saving ? 'Saving…'
              : label}
      </button>
      {isOnChain && (
        <span style={{ fontSize: 12, color: '#a78bfa' }}>
          {txPhase === 'building' ? 'Building on-chain transaction…' : 'Approve in your wallet popup…'}
        </span>
      )}
    </div>
  );
}
SaveButton.propTypes = {
  disabled: PropTypes.bool,
  txPhase: PropTypes.string,
  saving: PropTypes.bool,
  label: PropTypes.string.isRequired,
};

// ── Main Settings component ──────────────────────────────────────────────────

export default function Settings() {
  const token = useAuthStore((s) => s.token);

  // On-chain state — declared first so icoState.authority can be passed to
  // useAdminWallet as the authoritative wallet key.
  const [icoState, setIcoState] = useState(null);
  const [icoStateError, setIcoStateError] = useState('');
  const [stateKey, setStateKey] = useState(0);
  const refreshIcoState = () => setStateKey((k) => k + 1);

  const {
    status, connectedKey, connectedName, connectedProvider, storedKey,
    error: walletError,
    showPicker, setShowPicker, availableWallets,
    openPicker, connectTo, disconnect,
    isAuthorized,
  } = useAdminWallet(token, icoState?.authority);

  const [loading, setLoading] = useState(true);

  // ── TGE section ──────────────────────────────────────────────────
  const [tgeForm, setTgeForm] = useState({ tge_datetime: '', tge_unlock_percent: '' });
  const [tgeSaving, setTgeSaving] = useState(false);
  const [tgeError, setTgeError] = useState('');
  const [tgeSuccess, setTgeSuccess] = useState('');
  const [tgeTxPhase, setTgeTxPhase] = useState('idle');
  const [tgeTxError, setTgeTxError] = useState('');

  // ── Vesting section ──────────────────────────────────────────────
  const [vestingForm, setVestingForm] = useState({ vesting_months: '', cliff_months: '' });
  const [vestingSaving, setVestingSaving] = useState(false);
  const [vestingError, setVestingError] = useState('');
  const [vestingSuccess, setVestingSuccess] = useState('');
  const [vestingTxPhase, setVestingTxPhase] = useState('idle');
  const [vestingTxError, setVestingTxError] = useState('');

  useEffect(() => {
    getSettings(token)
      .then((d) => {
        // tge_datetime is intentionally NOT read from DB — on-chain state is
        // the authoritative source and is set in the getIcoState effect below.
        // DB tge_date can be stale after a program ID reset.
        setTgeForm((f) => ({
          ...f,
          tge_unlock_percent: d.unlock_percent_at_tge ?? '',
        }));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    setIcoState(null);
    setIcoStateError('');
    getIcoState(token)
      .then((s) => {
        setIcoState(s);
        setVestingForm({
          vesting_months: s.vestingMonths == null ? '' : String(s.vestingMonths),
          cliff_months:   s.cliffMonths   == null ? '' : String(s.cliffMonths),
        });
        // Override TGE datetime with exact on-chain timestamp (authoritative).
        // If tgeTs = 0 the new program has no TGE set — clear any stale DB value.
        if (s.tgeTs) {
          setTgeForm((f) => ({ ...f, tge_datetime: tsToLocalDatetimeLocal(s.tgeTs) }));
        } else {
          setTgeForm((f) => ({ ...f, tge_datetime: '' }));
        }
      })
      .catch((e) => setIcoStateError(e.message || 'Failed to load on-chain state'));
  }, [token, stateKey]);

  // Calls setTge on-chain + saves tge_date & tge_unlock_percent to DB
  async function handleSaveTge(e) {
    e.preventDefault();
    if (icoState?.tgeTs && new Date() >= new Date(icoState.tgeTs * 1000)) {
      setTgeError('TGE has already been triggered. These settings are locked.');
      return;
    }
    setTgeSaving(true);
    setTgeError('');
    setTgeSuccess('');
    setTgeTxPhase('idle');
    setTgeTxError('');
    let phase = 'idle';
    try {
      // datetime-local input has no timezone — treat as local time (browser handles conversion to UTC internally)
      const tgeTimestamp = tgeForm.tge_datetime
        ? Math.floor(new Date(tgeForm.tge_datetime).getTime() / 1000)
        : null;
      // Date-only portion for the DB tge_date column
      const tgeDateIso = tgeTimestamp
        ? new Date(tgeTimestamp * 1000).toISOString()
        : null;

      // 1. Save to DB
      await updateSettings(token, {
        tge_date: tgeDateIso,
        unlock_percent_at_tge: tgeForm.tge_unlock_percent !== '' ? Number(tgeForm.tge_unlock_percent) : undefined,
      });

      // 2. Push setTge on-chain if authorized and datetime is set
      if (isAuthorized && connectedProvider && tgeTimestamp) {
        phase = 'building';
        setTgeTxPhase('building');
        const txData = await buildSetTgeTx(token, { wallet: connectedKey, tge_timestamp: tgeTimestamp });
        phase = 'signing';
        setTgeTxPhase('signing');
        const tgeTxid = await submitOnChainTx(connectedProvider, txData.unsigned_transaction, txData.blockhash, txData.last_valid_block_height);
        setTgeTxPhase('done');
        refreshIcoState();
        createLog(token, { action_type: 'set_tge', description: `TGE set to ${new Date(tgeTimestamp * 1000).toLocaleString()}`, tx_signature: tgeTxid, metadata: { tge_timestamp: tgeTimestamp } });
        setTgeSuccess('TGE Updated.');
      } else {
        setTgeSuccess('TGE settings saved to database.');
      }
    } catch (err) {
      if (phase !== 'idle') {
        setTgeTxPhase('error');
        setTgeTxError(err.message || 'On-chain transaction failed');
      } else {
        setTgeError(err.message || 'Failed to save TGE settings');
      }
    } finally {
      setTgeSaving(false);
    }
  }

  // Calls setVestingSchedule on-chain + saves months & derived days to DB
  async function handleSaveVesting(e) {
    e.preventDefault();
    if (icoState?.tgeTs && new Date() >= new Date(icoState.tgeTs * 1000)) {
      setVestingError('TGE has already been triggered. Vesting schedule is locked.');
      return;
    }
    const vm = Number(vestingForm.vesting_months);
    const cm = Number(vestingForm.cliff_months);
    if (!vm || cm >= vm) return;
    setVestingSaving(true);
    setVestingError('');
    setVestingSuccess('');
    setVestingTxPhase('idle');
    setVestingTxError('');
    let phase = 'idle';
    try {
      // 1. Push setVestingSchedule on-chain if authorized
      if (isAuthorized && connectedProvider) {
        phase = 'building';
        setVestingTxPhase('building');
        const txData = await buildSetVestingScheduleTx(token, { wallet: connectedKey, vesting_months: vm, cliff_months: cm });
        phase = 'signing';
        setVestingTxPhase('signing');
        const vestingTxid = await submitOnChainTx(connectedProvider, txData.unsigned_transaction, txData.blockhash, txData.last_valid_block_height);
        setVestingTxPhase('done');
        refreshIcoState();
        createLog(token, { action_type: 'set_vesting_schedule', description: `Vesting schedule set: ${vm} months vesting, ${cm} months cliff`, tx_signature: vestingTxid, metadata: { vesting_months: vm, cliff_months: cm } });
      }

      // 2. Save to DB — months authoritative, derived days for reference
      await updateSettings(token, {
        vesting_months:        vm,
        cliff_months:          cm,
        vesting_duration_days: vm * 30,
        vesting_cliff_days:    cm * 30,
      });

      setVestingSuccess(isAuthorized && connectedProvider
        ? 'Vesting schedule pushed to chain and saved to database.'
        : 'Vesting schedule saved to database.');
    } catch (err) {
      if (phase !== 'idle') {
        setVestingTxPhase('error');
        setVestingTxError(err.message || 'On-chain transaction failed');
      } else {
        setVestingError(err.message || 'Failed to save vesting schedule');
      }
    } finally {
      setVestingSaving(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    background: 'var(--item-2)',
    border: '1px solid var(--border-2)',
    color: 'var(--tx)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--muted)',
    marginBottom: 6,
  };

  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Configure ICO vesting and TGE parameters</p>
      </div>

      {/* Wallet card */}
      <WalletCard
        status={status}
        connectedKey={connectedKey}
        connectedName={connectedName}
        storedKey={storedKey}
        error={walletError}
        onConnect={openPicker}
        onDisconnect={disconnect}
      />

      {/* Wallet picker modal */}
      {showPicker && (
        <div
          onClick={() => setShowPicker(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              width: 320,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>Connect Wallet</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Choose a wallet to connect</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableWallets.map((w) => (
                <button
                  key={w.name}
                  onClick={() => connectTo(w)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 10,
                    background: 'var(--item-2)', border: '1px solid var(--border-2)',
                    color: 'var(--tx)', fontSize: 14, fontWeight: 500,
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--item-2)')}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                  }}>
                    {w.name[0]}
                  </div>
                  {w.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowPicker(false)}
              style={{
                marginTop: 14, width: '100%', padding: '8px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* On-chain ICO state */}
      {icoState?._source === 'db_fallback' && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '2px 8px' }}>
            RPC unavailable — showing DB snapshot
          </span>
        </div>
      )}
      <IcoStateCard
        icoState={icoState}
        icoStateError={icoStateError}
        isAuthorized={isAuthorized}
        connectedKey={connectedKey}
        connectedProvider={connectedProvider}
        token={token}
        onStateChange={refreshIcoState}
      />

      {/* Vault management */}
      <VaultCard
        icoState={icoState}
        isAuthorized={isAuthorized}
        connectedKey={connectedKey}
        connectedProvider={connectedProvider}
        token={token}
      />

      {loading && (
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading settings…</div>
      )}

      {!loading && (
        <>
          {/* ── TGE Settings ─────────────────────────────────────────── */}
          {(() => {
            const tgeStarted = icoState?.tgeTs && new Date() >= new Date(icoState.tgeTs * 1000);
            return (
              <form onSubmit={handleSaveTge}>
                <div style={{
                  background: 'var(--surface)',
                  border: `1px solid ${tgeStarted ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                  borderRadius: 12, padding: 24, marginBottom: 20,
                  display: 'flex', flexDirection: 'column', gap: 20,
                  opacity: tgeStarted ? 0.7 : 1,
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>TGE Settings</div>
                      {tgeStarted && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, padding: '2px 7px' }}>
                          Locked — TGE has started
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {tgeStarted
                        ? 'TGE date is locked once it has been triggered. This is enforced by the contract.'
                        : <>Calls <code style={{ fontFamily: 'monospace', color: '#a78bfa' }}>setTge</code> on-chain + saves to database.</>}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>TGE Date &amp; Time <span style={{ fontWeight: 400, color: 'var(--faint)' }}>(local time)</span></label>
                    <input
                      type="datetime-local"
                      value={tgeForm.tge_datetime}
                      onChange={(e) => { setTgeForm((f) => ({ ...f, tge_datetime: e.target.value })); setTgeSuccess(''); setTgeError(''); }}
                      disabled={tgeStarted}
                      style={{ ...inputStyle, colorScheme: 'dark', cursor: tgeStarted ? 'not-allowed' : 'text' }}
                    />
                    {!tgeStarted && (
                      <div style={{ fontSize: 11, color: 'var(--subtle)', marginTop: 4 }}>
                        Enter TGE date and time in your local timezone — converted to a Unix timestamp and passed to the contract.
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>TGE Unlock % (at TGE)</label>
                    <input
                      type="number"
                      value={tgeForm.tge_unlock_percent}
                      onChange={(e) => { setTgeForm((f) => ({ ...f, tge_unlock_percent: e.target.value })); setTgeSuccess(''); setTgeError(''); }}
                      min="0" max="100" step="1"
                      placeholder="e.g. 10"
                      disabled={tgeStarted}
                      style={{ ...inputStyle, cursor: tgeStarted ? 'not-allowed' : 'text' }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--subtle)', marginTop: 4 }}>
                      Percentage of tokens unlocked immediately at TGE. Stored in database only.
                    </div>
                  </div>

                  {tgeError && <FeedbackBox type="error">{tgeError}</FeedbackBox>}
                  {tgeTxPhase === 'error' && tgeTxError && <FeedbackBox type="error">On-chain error: {tgeTxError}</FeedbackBox>}
                  {tgeSuccess && <FeedbackBox type="success">{tgeSuccess}</FeedbackBox>}

                  <SaveButton
                    disabled={tgeStarted || tgeSaving || tgeTxPhase === 'building' || tgeTxPhase === 'signing' || !tgeForm.tge_datetime}
                    txPhase={tgeTxPhase}
                    saving={tgeSaving}
                    label="Save TGE Settings"
                  />
                </div>
              </form>
            );
          })()}

          {/* ── Vesting Schedule ─────────────────────────────────────── */}
          {(() => {
            const tgeStarted = icoState?.tgeTs && new Date() >= new Date(icoState.tgeTs * 1000);
            return (
              <form onSubmit={handleSaveVesting}>
                <div style={{
                  background: 'var(--surface)',
                  border: `1px solid ${tgeStarted ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                  borderRadius: 12, padding: 24,
                  display: 'flex', flexDirection: 'column', gap: 20,
                  opacity: tgeStarted ? 0.7 : 1,
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>Vesting Schedule</div>
                      {tgeStarted && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, padding: '2px 7px' }}>
                          Locked — TGE has started
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {tgeStarted
                        ? 'Vesting schedule is locked once TGE begins. This is enforced by the contract.'
                        : <>Calls <code style={{ fontFamily: 'monospace', color: '#a78bfa' }}>setVestingSchedule</code> on-chain + saves to database.</>}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--faint)', background: 'var(--item-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px' }}>
                    Both cliff and vesting are always sent together in a single on-chain call. Changing one field keeps the other at its current value.
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label htmlFor="cliff-months" style={{ ...labelStyle, marginBottom: 0 }}>Cliff Period <span style={{ fontWeight: 400, color: 'var(--faint)' }}>(months)</span></label>
                      {icoState?.cliffMonths != null && (
                        <span style={{ fontSize: 10, color: 'var(--faint)' }}>Current: <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{icoState.cliffMonths} months</span></span>
                      )}
                    </div>
                    <input
                      id="cliff-months"
                      type="number"
                      value={vestingForm.cliff_months}
                      onChange={(e) => { setVestingForm((f) => ({ ...f, cliff_months: e.target.value })); setVestingSuccess(''); setVestingError(''); }}
                      min="0" max="254" step="1"
                      placeholder="e.g. 6"
                      disabled={tgeStarted}
                      style={{ ...inputStyle, cursor: tgeStarted ? 'not-allowed' : 'text' }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--subtle)', marginTop: 4 }}>
                      Lock-up period after TGE before linear vesting begins.
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label htmlFor="vesting-months" style={{ ...labelStyle, marginBottom: 0 }}>Vesting Duration <span style={{ fontWeight: 400, color: 'var(--faint)' }}>(months)</span></label>
                      {icoState?.vestingMonths != null && (
                        <span style={{ fontSize: 10, color: 'var(--faint)' }}>Current: <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{icoState.vestingMonths} months</span></span>
                      )}
                    </div>
                    <input
                      id="vesting-months"
                      type="number"
                      value={vestingForm.vesting_months}
                      onChange={(e) => { setVestingForm((f) => ({ ...f, vesting_months: e.target.value })); setVestingSuccess(''); setVestingError(''); }}
                      min="1" max="255" step="1"
                      placeholder="e.g. 30"
                      disabled={tgeStarted}
                      style={{ ...inputStyle, cursor: tgeStarted ? 'not-allowed' : 'text' }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--subtle)', marginTop: 4 }}>
                      Total linear vesting period after the cliff.
                    </div>
                  </div>

                  {!tgeStarted && Number(vestingForm.vesting_months) > 0 && Number(vestingForm.cliff_months) >= Number(vestingForm.vesting_months) && (
                    <FeedbackBox type="warning">Cliff must be less than vesting duration.</FeedbackBox>
                  )}
                  {vestingError && <FeedbackBox type="error">{vestingError}</FeedbackBox>}
                  {vestingTxPhase === 'error' && vestingTxError && <FeedbackBox type="error">On-chain error: {vestingTxError}</FeedbackBox>}
                  {vestingSuccess && <FeedbackBox type="success">{vestingSuccess}</FeedbackBox>}

                  <SaveButton
                    disabled={
                      tgeStarted ||
                      vestingSaving ||
                      vestingTxPhase === 'building' ||
                      vestingTxPhase === 'signing' ||
                      !vestingForm.vesting_months ||
                      Number(vestingForm.cliff_months) >= Number(vestingForm.vesting_months)
                    }
                    txPhase={vestingTxPhase}
                    saving={vestingSaving}
                    label="Save Vesting Schedule"
                  />
                </div>
              </form>
            );
          })()}
        </>
      )}
    </div>
  );
}

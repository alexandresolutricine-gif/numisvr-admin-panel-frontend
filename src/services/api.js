const BASE_URL = import.meta.env.VITE_ADM_API_URL || 'http://localhost:3002';

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request(token, path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: headers(token),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { /* non-JSON response */ }
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json?.data ?? json;
}

// ── Auth ────────────────────────────────────────────
export function login(email, password) {
  return request(null, '/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function hankoLogin(hankoToken) {
  return request(null, '/admin/auth/hanko-login', {
    method: 'POST',
    body: JSON.stringify({ hankoToken }),
  });
}

// ── Admin Profile ──────────────────────────────────
export function getProfile(token) {
  return request(token, '/admin/profile');
}

export function updateProfile(token, data) {
  return request(token, '/admin/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ── Stats ──────────────────────────────────────────
export function getStats(token) {
  return request(token, '/admin/stats');
}

// ── KYC ───────────────────────────────────────────
export function getKycUsers(token, { status = 'all', page = 1, limit = 20, search = '' } = {}) {
  const params = new URLSearchParams({ status, page, limit });
  if (search) params.set('search', search);
  return request(token, `/admin/kyc/users?${params}`);
}

export function getKycUser(token, userId) {
  return request(token, `/admin/kyc/users/${userId}`);
}

export function updateKycStatus(token, userId, kyc_status) {
  return request(token, `/admin/kyc/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ kyc_status }),
  });
}

// ── Transactions ───────────────────────────────────
export function getTransactions(token, { page = 1, limit = 20, status = 'all' } = {}) {
  const params = new URLSearchParams({ page, limit, status });
  return request(token, `/admin/transactions?${params}`);
}

// ── Settings ───────────────────────────────────────
export function getSettings(token) {
  return request(token, '/admin/settings');
}

export function updateSettings(token, data) {
  return request(token, '/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ── On-chain ────────────────────────────────────────
export function getIcoState(token) {
  return request(token, '/admin/onchain/state');
}

export function buildSetTgeTx(token, { wallet, tge_timestamp }) {
  return request(token, '/admin/onchain/build-set-tge', {
    method: 'POST',
    body: JSON.stringify({ wallet, tge_timestamp }),
  });
}

export function buildSetPausedTx(token, { wallet, paused }) {
  return request(token, '/admin/onchain/build-set-paused', {
    method: 'POST',
    body: JSON.stringify({ wallet, paused }),
  });
}

export function buildSetVestingScheduleTx(token, { wallet, vesting_days, cliff_days }) {
  return request(token, '/admin/onchain/build-set-vesting-schedule', {
    method: 'POST',
    body: JSON.stringify({ wallet, vesting_days, cliff_days }),
  });
}

export function getVaultBalances(token) {
  return request(token, '/admin/onchain/vault-balances');
}

export function buildInitializeVaultTx(token, { wallet, mint }) {
  return request(token, '/admin/onchain/build-initialize-vault', {
    method: 'POST',
    body: JSON.stringify({ wallet, mint }),
  });
}

export function buildFundVaultTx(token, { wallet, mint, amount_ui, decimals }) {
  return request(token, '/admin/onchain/build-fund-vault', {
    method: 'POST',
    body: JSON.stringify({ wallet, mint, amount_ui, decimals }),
  });
}

export function buildTransferFromVaultTx(token, { wallet, mint, amount_ui, decimals }) {
  return request(token, '/admin/onchain/build-transfer-from-vault', {
    method: 'POST',
    body: JSON.stringify({ wallet, mint, amount_ui, decimals }),
  });
}

export function buildSetAuthorityTx(token, { wallet, new_authority }) {
  return request(token, '/admin/onchain/build-set-authority', {
    method: 'POST',
    body: JSON.stringify({ wallet, new_authority }),
  });
}

// ── Activity Logs ────────────────────────────────────────────────
export function getLogs(token, { page = 1, limit = 50, action_type = 'all' } = {}) {
  const params = new URLSearchParams({ page, limit, action_type });
  return request(token, `/admin/logs?${params}`);
}

export function createLog(token, { action_type, description, tx_signature, metadata }) {
  return request(token, '/admin/logs', {
    method: 'POST',
    body: JSON.stringify({ action_type, description, tx_signature, metadata }),
  });
}

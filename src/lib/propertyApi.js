/**
 * Client for the contract endpoints on logindemoserver.
 *
 * Same base URL as the auth client, one level up from /auth. Kept React-free so
 * the request logic can be reasoned about without mounting anything.
 */

const AUTH_BASE =
  process.env.REACT_APP_AUTH_API_URL ?? 'http://localhost:4000/api/v1/auth';

/** /api/v1/auth -> /api/v1 */
const BASE = AUTH_BASE.replace(/\/auth\/?$/, '');

async function request(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    // fetch only rejects on network failure — a stopped API lands here.
    throw new Error(
      `Cannot reach the API at ${BASE}. Start it with: cd logindemoserver && npm start`
    );
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(json?.error?.message ?? `Request failed (${res.status})`);
    err.code = json?.error?.code;
    err.status = res.status;
    throw err;
  }

  return json;
}

/** Health — used to tell "API down" apart from "chain down" in the UI. */
export function fetchHealth() {
  return request('/health');
}

/** Paginated catalogue. Returns { data, pagination }. */
export function fetchProperties({ page = 1, limit = 12 } = {}) {
  return request(`/properties?page=${page}&limit=${limit}`);
}

export async function fetchProperty(tokenId) {
  const { data } = await request(`/properties/${tokenId}`);
  return data;
}

/**
 * Ask the server to build the earnest-deposit transaction.
 *
 * Returns an UNSIGNED payload — the server holds no key. The wallet signs and
 * broadcasts it; see useDeposit in the property page.
 */
export async function prepareDeposit({ tokenId, from, token }) {
  const { data } = await request(`/properties/${tokenId}/deposit/prepare`, {
    method: 'POST',
    token,
    body: { from },
  });
  return data;
}

export async function fetchTransactionStatus(hash) {
  const { data } = await request(`/transactions/${hash}`);
  return data;
}

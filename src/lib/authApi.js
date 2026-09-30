/**
 * Client for logindemoserver.
 *
 * Kept as plain functions with no React in them, so the SIWE handshake can be
 * reasoned about (and tested) without mounting a component.
 */

const BASE =
  process.env.REACT_APP_AUTH_API_URL ?? 'http://localhost:4000/api/v1/auth';

/**
 * The server answers errors as { error: { code, message } }. Unwrap that into a
 * real Error so callers can just try/catch instead of inspecting status codes.
 */
async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
  } catch {
    // fetch only rejects on network failure — a down server lands here, not below.
    throw new Error(
      `Cannot reach the login server at ${BASE}. Start it with: cd logindemoserver && npm start`
    );
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(body?.error?.message ?? `Request failed (${res.status})`);
    err.code = body?.error?.code;
    err.status = res.status;
    throw err;
  }

  return body?.data;
}

/** Step 1 — ask for a challenge. Returns { address, nonce, message, expiresAt }. */
export function requestNonce(address) {
  return request('/nonce', { method: 'POST', body: JSON.stringify({ address }) });
}

/**
 * Step 2 — exchange a signature for a session token.
 *
 * Note there is no address here: the server recovers it from the signature.
 */
export function verifySignature({ nonce, signature }) {
  return request('/verify', { method: 'POST', body: JSON.stringify({ nonce, signature }) });
}

/** Step 3 — confirm a stored token is still valid, and whose it is. */
export function fetchMe(token) {
  return request('/me', { headers: { Authorization: `Bearer ${token}` } });
}

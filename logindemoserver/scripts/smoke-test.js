import { ethers } from 'ethers';

/**
 * End-to-end check of the SIWE login flow against a running server.
 *
 *   node scripts/smoke-test.js
 *
 * Uses a throwaway keypair instead of MetaMask, so the whole handshake can be
 * exercised headlessly — same code path the browser takes, no extension needed.
 * Also asserts the negative cases, which are the ones that actually matter: a
 * replayed nonce and a signature from the wrong key must both be rejected.
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:4000/api/v1/auth';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const wallet = ethers.Wallet.createRandom();
  console.log(`\nSIWE login flow — test wallet ${wallet.address}\n`);

  // --- health --- (lives at /api/v1/health, one level above /auth)
  const health = await fetch(`${BASE.replace(/\/auth$/, '')}/health`).then((r) => r.json());
  check('server is up', health.status === 'ok');

  // --- 1. challenge ---
  const challenge = await post('/nonce', { address: wallet.address });
  check('POST /nonce returns 201', challenge.status === 201, `got ${challenge.status}`);
  check('challenge carries a message', typeof challenge.json?.data?.message === 'string');
  check(
    'message binds the address',
    challenge.json?.data?.message?.includes(wallet.address)
  );
  check(
    'message binds the nonce',
    challenge.json?.data?.message?.includes(challenge.json?.data?.nonce)
  );

  const { nonce, message } = challenge.json.data;

  // --- 2. sign + verify ---
  const signature = await wallet.signMessage(message);
  const verified = await post('/verify', { nonce, signature });
  check('POST /verify returns 200', verified.status === 200, `got ${verified.status}`);
  check(
    'recovered address matches signer',
    verified.json?.data?.address === wallet.address,
    `got ${verified.json?.data?.address}`
  );
  check('session token issued', typeof verified.json?.data?.token === 'string');

  const { token } = verified.json.data;

  // --- 3. authenticated call ---
  const me = await fetch(`${BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meJson = await me.json();
  check('GET /me accepts the token', me.status === 200, `got ${me.status}`);
  check('GET /me returns the verified address', meJson?.data?.address === wallet.address);

  // --- negative: replay ---
  const replay = await post('/verify', { nonce, signature });
  check('replayed nonce is rejected', replay.status === 401, `got ${replay.status}`);

  // --- negative: wrong signer ---
  const c2 = await post('/nonce', { address: wallet.address });
  const impostor = ethers.Wallet.createRandom();
  const badSig = await impostor.signMessage(c2.json.data.message);
  const wrongSigner = await post('/verify', { nonce: c2.json.data.nonce, signature: badSig });
  check('signature from another key is rejected', wrongSigner.status === 401, `got ${wrongSigner.status}`);

  // --- negative: no token ---
  const noAuth = await fetch(`${BASE}/me`);
  check('GET /me without a token is rejected', noAuth.status === 401, `got ${noAuth.status}`);

  // --- negative: malformed address ---
  const badAddr = await post('/nonce', { address: 'not-an-address' });
  check('malformed address is rejected', badAddr.status === 400, `got ${badAddr.status}`);

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('\nSmoke test could not run:', err.message);
  console.error('Is the server running?  npm start\n');
  process.exitCode = 1;
});

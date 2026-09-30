import { ethers } from 'ethers';

/**
 * End-to-end check of the contract API against a running stack.
 *
 *   cd blockchain && npm run node          # terminal 1
 *   cd blockchain && npm run deploy:local  # terminal 2
 *   cd logindemoserver && npm start        # terminal 3
 *   node scripts/contract-smoke-test.js    # terminal 4
 *
 * Exercises the whole non-custodial path for real: log in with SIWE, ask the API
 * to PREPARE a deposit, then sign and broadcast that exact payload locally and
 * confirm it mines. If the server ever started returning calldata the wallet
 * cannot execute, this fails.
 *
 * Hardhat account #1 — the designated buyer in the deploy script. This is the
 * publicly documented test mnemonic; it holds nothing on any real network.
 */
const BUYER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545';

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? passed++ : failed++;
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function login(wallet) {
  const { json: c } = await call('/auth/nonce', {
    method: 'POST',
    body: { address: wallet.address },
  });
  const signature = await wallet.signMessage(c.data.message);
  const { json: v } = await call('/auth/verify', {
    method: 'POST',
    body: { nonce: c.data.nonce, signature },
  });
  return v.data.token;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const buyer = new ethers.Wallet(BUYER_PK, provider);
  const stranger = ethers.Wallet.createRandom();

  console.log(`\nContract API — buyer ${buyer.address}\n`);

  /* ------------------------------------------------------------- health -- */
  const health = await call('/health');
  check('health reports ok', health.json?.status === 'ok', health.json?.status);
  check('chain is reachable', health.json?.chain?.reachable === true);
  check('contracts configured', Boolean(health.json?.contracts?.escrow));

  /* -------------------------------------------------------------- reads -- */
  const listed = await call('/properties');
  check('GET /properties returns 200', listed.status === 200, `got ${listed.status}`);
  check('catalogue has 3 seeded properties', listed.json?.data?.length === 3,
    `got ${listed.json?.data?.length}`);
  check('pagination reports total', listed.json?.pagination?.total === 3);

  const one = await call('/properties/1');
  check('GET /properties/1 returns 200', one.status === 200);
  check('tokenId 1 is listed for sale', one.json?.data?.escrow?.listed === true);
  check('escrow amount is 5 ETH', one.json?.data?.escrow?.escrowAmountEth === '5.0',
    one.json?.data?.escrow?.escrowAmountEth);

  const missing = await call('/properties/999');
  check('unknown tokenId returns 404', missing.status === 404, `got ${missing.status}`);

  const badId = await call('/properties/abc');
  check('non-numeric tokenId returns 400', badId.status === 400, `got ${badId.status}`);

  /* ------------------------------------------------------------- authz -- */
  const noAuth = await call('/properties/1/deposit/prepare', {
    method: 'POST',
    body: { from: buyer.address },
  });
  check('prepare without a token returns 401', noAuth.status === 401, `got ${noAuth.status}`);

  const token = await login(buyer);
  check('SIWE login issued a token', typeof token === 'string');

  const spoof = await call('/properties/1/deposit/prepare', {
    method: 'POST',
    token,
    body: { from: stranger.address },
  });
  check("prepare for someone else's address returns 403", spoof.status === 403,
    `got ${spoof.status}`);

  const unlisted = await call('/properties/2/deposit/prepare', {
    method: 'POST',
    token,
    body: { from: buyer.address },
  });
  check('prepare on an unlisted property returns 409', unlisted.status === 409,
    `got ${unlisted.status}`);

  /* ----------------------------------------------------------- prepare -- */
  const prep = await call('/properties/1/deposit/prepare', {
    method: 'POST',
    token,
    body: { from: buyer.address },
  });
  check('prepare returns 200', prep.status === 200, `got ${prep.status}`);

  const tx = prep.json?.data?.transaction;
  check('response carries an unsigned transaction', Boolean(tx?.to && tx?.data));
  check('value equals the on-chain escrow amount',
    tx?.value === one.json?.data?.escrow?.escrowAmountWei, tx?.value);
  check('gas was estimated (call would not revert)', Boolean(tx?.gasLimit));
  check('chainId is bound to the transaction', tx?.chainId === 31337, String(tx?.chainId));
  check('no private key or signature in the response',
    !JSON.stringify(prep.json).match(/privateKey|signature|mnemonic/i));

  /* --------------------------------------------------------- broadcast -- */
  // The decisive test: the user's wallet signs the server's payload unmodified.
  const sent = await buyer.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value),
    gasLimit: BigInt(tx.gasLimit),
  });
  const receipt = await sent.wait();

  check('prepared transaction mines successfully', receipt.status === 1);

  // Read at explicit block heights either side of the transaction. Querying
  // "latest" twice is unreliable here: ethers caches balance lookups against the
  // block number it currently knows about, so both reads can resolve to the same
  // pre-transaction block and report a delta of zero.
  const [before, after] = await Promise.all([
    provider.getBalance(tx.to, receipt.blockNumber - 1),
    provider.getBalance(tx.to, receipt.blockNumber),
  ]);
  check('escrow balance increased by the earnest amount',
    after - before === BigInt(tx.value),
    `delta ${ethers.formatEther(after - before)} ETH`);

  /* --------------------------------------------------------- reconcile -- */
  const status = await call(`/transactions/${sent.hash}`);
  check('GET /transactions/:hash returns 200', status.status === 200);
  check('transaction reports confirmed', status.json?.data?.status === 'confirmed',
    status.json?.data?.status);

  const badHash = await call('/transactions/0xdeadbeef');
  check('malformed tx hash returns 400', badHash.status === 400, `got ${badHash.status}`);

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('\nCould not run:', err.message);
  console.error('Is the node running (blockchain: npm run node), deployed, and the API up?\n');
  process.exitCode = 1;
});

import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { ApiError } from '../lib/ApiError.js';
import * as nonceStore from './nonce.store.js';

/**
 * Sign-In with Ethereum (EIP-4361).
 *
 * The problem this solves: a client can POST any address it likes. Believing it
 * would mean anyone could authenticate as anyone. Proving control of an address
 * requires a signature over a challenge WE issued, and three properties make
 * that challenge safe:
 *
 *   single-use nonce  a captured signature cannot be replayed
 *   domain binding    a signature farmed by another site will not verify here
 *   short expiry      a leaked challenge has a small window
 *
 * No gas, no transaction, no contract — this is a personal_sign over a string.
 */

/**
 * Build the exact text the wallet displays and signs.
 *
 * Every byte matters: verification reconstructs this string from stored fields
 * and recovers the signer from it. A single character of drift between what was
 * signed and what we rebuild yields a different address and a failed login —
 * which is why the message is stored alongside the nonce rather than rebuilt
 * from scratch at verify time.
 */
function buildMessage({ address, nonce, issuedAt, expiresAt }) {
  return [
    `${config.siwe.domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to RentVerse. This request will not trigger a blockchain transaction or cost any gas fees.',
    '',
    `URI: http://${config.siwe.domain}`,
    'Version: 1',
    `Chain ID: ${config.siwe.chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
  ].join('\n');
}

/** Step 1 — issue a challenge for the given address. */
export function createChallenge({ address }) {
  // Checksum immediately. The client may send lowercase, and the message the
  // user signs must match the one we later verify, byte for byte.
  let checksummed;
  try {
    checksummed = ethers.getAddress(address);
  } catch {
    throw ApiError.badRequest(`"${address}" is not a valid Ethereum address`);
  }

  const issuedAt = new Date().toISOString();

  // Mint the nonce first — it is part of the message we are about to render.
  const { nonce, expiresAtMs, expiresAt } = nonceStore.create();
  const message = buildMessage({ address: checksummed, nonce, issuedAt, expiresAt });

  // Store the rendered message verbatim. Verification recovers the signer from
  // this exact string rather than rebuilding it, so there is no way for the two
  // to drift (a reformatted line would silently break every login).
  nonceStore.save(nonce, expiresAtMs, { address: checksummed, message });

  return { address: checksummed, nonce, message, expiresAt };
}

/** Step 2 — verify the signature and mint a session token. */
export function verifyChallenge({ nonce, signature }) {
  const entry = nonceStore.consume(nonce);
  if (!entry) {
    throw ApiError.unauthorized('Challenge is unknown, already used, or expired — request a new nonce');
  }

  let recovered;
  try {
    // ecrecover: derives the address whose key produced this signature over
    // this exact message. No lookup, no database — pure cryptography.
    recovered = ethers.verifyMessage(entry.message, signature);
  } catch {
    throw ApiError.unauthorized('Signature is malformed');
  }

  if (recovered.toLowerCase() !== entry.address.toLowerCase()) {
    throw ApiError.unauthorized('Signature does not match the challenged address');
  }

  const token = jwt.sign(
    { sub: recovered, chainId: config.siwe.chainId },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn, issuer: config.jwt.issuer }
  );

  return { token, address: recovered, expiresIn: config.jwt.expiresIn };
}

/** Used by the auth middleware on every protected request. */
export function verifySessionToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer });
  } catch (err) {
    throw ApiError.unauthorized(
      err?.name === 'TokenExpiredError' ? 'Session has expired' : 'Session token is invalid'
    );
  }
}

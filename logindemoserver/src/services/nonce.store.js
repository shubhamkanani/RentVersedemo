import crypto from 'node:crypto';
import { config } from '../config/index.js';

/**
 * Single-use challenge store.
 *
 * Deliberately behind a small interface — create / save / consume — so the
 * in-memory Map can be swapped for Redis without any caller changing.
 *
 * This implementation is correct for ONE process and wrong for more than one: a
 * nonce issued by instance A would not be found by instance B, and every other
 * login would fail behind a load balancer. That is the one thing to change
 * before running more than a single node:
 *
 *   save()    -> SET <nonce> <json> EX <ttl>
 *   consume() -> GETDEL <nonce>
 *
 * GETDEL matters. Read-then-delete is not atomic, so two concurrent requests
 * could both pass verification with the same nonce.
 */
const store = new Map();

/** Drop expired entries. Called on each access, so there is no timer to leak. */
function sweep() {
  const now = Date.now();
  for (const [nonce, entry] of store) {
    if (entry.expiresAt <= now) store.delete(nonce);
  }
}

/**
 * Mint a nonce without storing anything.
 *
 * Separate from save() because the caller needs the nonce value to build the
 * message that gets stored alongside it.
 *
 * 16 bytes from a CSPRNG: a guessable nonce would let an attacker pre-farm a
 * signature for a challenge that has not been issued yet.
 */
export function create() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAtMs = Date.now() + config.siwe.nonceTtlMs;
  return { nonce, expiresAtMs, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function save(nonce, expiresAtMs, payload) {
  sweep();
  store.set(nonce, { ...payload, expiresAt: expiresAtMs });
}

/**
 * Fetch and delete in one step.
 *
 * Deleting on read — rather than after successful verification — is what makes
 * the nonce genuinely single-use. If it survived a failed attempt, an attacker
 * could keep trying signatures against the same challenge.
 */
export function consume(nonce) {
  sweep();
  const entry = store.get(nonce);
  if (!entry) return null;
  store.delete(nonce);
  return entry;
}

export function size() {
  sweep();
  return store.size;
}

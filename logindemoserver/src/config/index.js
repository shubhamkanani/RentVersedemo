import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is parsed once, here, and never read from process.env again.
 *
 * Fail-fast on purpose: a missing JWT secret should stop the process at boot
 * with a readable message, not surface as a confusing 500 on someone's first
 * login attempt.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Comma-separated. The browser origin(s) allowed to call this API.
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Long enough that it cannot be brute-forced offline from a leaked token.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('2h'),

  // Bound into the signed message. A signature farmed by another site will not
  // verify here, because the domain line will not match.
  SIWE_DOMAIN: z.string().default('localhost:3000'),

  // Announced in the SIWE challenge and used for the contract calls.
  // 31337 = Hardhat local node. personal_sign is chain-agnostic, so login still
  // works whichever network MetaMask is on; only the contract calls care.
  CHAIN_ID: z.coerce.number().int().positive().default(31337),

  NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // --- Chain -----------------------------------------------------------------
  RPC_URL: z.string().url().default('http://127.0.0.1:8545'),

  // Printed by the deploy script. Optional so the server still boots (and
  // /health still reports) before a deploy has happened — the contract registry
  // reports them as unconfigured rather than throwing at import time.
  REAL_ESTATE_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 20-byte hex address')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  ESCROW_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 20-byte hex address')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  console.error('Copy .env.example to .env and fill it in.\n');
  process.exit(1);
}

export const config = Object.freeze({
  env: parsed.data.NODE_ENV,
  isProd: parsed.data.NODE_ENV === 'production',
  port: parsed.data.PORT,
  corsOrigin: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim()),
  jwt: {
    secret: parsed.data.JWT_SECRET,
    expiresIn: parsed.data.JWT_EXPIRES_IN,
    issuer: 'rentverse-login',
  },
  siwe: {
    domain: parsed.data.SIWE_DOMAIN,
    chainId: parsed.data.CHAIN_ID,
    nonceTtlMs: parsed.data.NONCE_TTL_SECONDS * 1000,
  },
  chain: {
    id: parsed.data.CHAIN_ID,
    rpcUrl: parsed.data.RPC_URL,
  },
  contracts: {
    realEstate: parsed.data.REAL_ESTATE_ADDRESS,
    escrow: parsed.data.ESCROW_ADDRESS,
  },
});

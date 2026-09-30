# logindemoserver

Backend for RentVerse: wallet authentication (EIP-4361) **and** the smart
contract API.

Self-contained — its own `package.json` and dependency tree, independent of the
React app and of the legacy `server/` folder.

One service rather than two, deliberately: the contract endpoints must validate
the same JWTs the auth endpoints issue. Splitting them would mean sharing a
signing secret across a process boundary for no benefit at this scale. The seam
for splitting later is the service layer, which has no HTTP in it.

## Why this exists

`ConnectButton` connecting MetaMask is **not** authentication. It gives the
browser an address, and the browser can claim any address it likes — open
DevTools and the "connected wallet" is whatever you say it is. Nothing is
proven to any server.

Logging in means the **server** is convinced. That needs a signature:

| | Connecting | Logging in |
|---|---|---|
| State lives in | the browser tab | the server |
| Proves | an extension handed the page a string | the user controls the private key |
| Forgeable by the client | yes | no |
| Can authorize an API call | no | yes |

## The flow

```
1. POST /nonce    { address }
                  -> server mints a single-use challenge and returns the
                     exact string to sign

2. wallet signs   personal_sign over that string
                  -> no gas, no transaction; a signature prompt, not a tx

3. POST /verify   { nonce, signature }
                  -> ecrecover(message, signature) === challenged address?
                  -> issue a JWT

4. GET /me        Authorization: Bearer <token>
                  -> address the server verified, not one the client asserted
```

`/verify` deliberately takes **no address**. It is recovered from the signature,
so the client cannot assert an identity — that is what makes this
authentication rather than a claim.

Three properties make the challenge safe:

- **single-use nonce** — a captured signature cannot be replayed
- **domain binding** — a signature farmed by another site will not verify here
- **short expiry** — a leaked challenge has a five-minute window

## Running it

Four terminals — the chain first, since the API reads from it:

```bash
# 1. local chain
cd blockchain && npm install && npm run node

# 2. deploy + seed (prints the addresses to paste into .env)
cd blockchain && npm run deploy:local

# 3. this API
cd logindemoserver && npm install
cp .env.example .env          # set JWT_SECRET + the two addresses
npm start                     # http://localhost:4000

# 4. frontend
npx react-app-rewired start   # http://localhost:3000
```

The API boots even with no chain and no addresses — `/health` reports
`degraded` and the contracts as `null`, rather than crashing. A node being down
is not a reason for an orchestrator to restart a healthy API process.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Config is validated at boot — a missing or short `JWT_SECRET` exits immediately
with a readable message rather than failing later on a request.

## Verifying it

```bash
npm test              # both suites — 40 assertions
npm run test:auth     # SIWE handshake only
npm run test:contracts
```

Both drive real code paths headlessly — throwaway keypairs instead of MetaMask,
so no extension is needed — and both assert the negative cases, which are the
ones that actually matter.

The contract suite goes all the way through: it logs in with SIWE, asks the API
to *prepare* a deposit, then **signs and broadcasts that exact payload** and
confirms it mines. If the server ever returned calldata a wallet could not
execute, this fails.

```
  PASS  replayed nonce is rejected
  PASS  signature from another key is rejected
  PASS  prepare without a token returns 401
  PASS  prepare for someone else's address returns 403
  PASS  prepare on an unlisted property returns 409
  PASS  value equals the on-chain escrow amount
  PASS  no private key or signature in the response
  PASS  prepared transaction mines successfully
  PASS  escrow balance increased by the earnest amount

  14 passed, 0 failed
  26 passed, 0 failed
```

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/health` | — | Liveness, chain reachability, configured contracts |
| `POST` | `/api/v1/auth/nonce` | — | Issue a challenge for an address |
| `POST` | `/api/v1/auth/verify` | — | Exchange a signature for a session token |
| `GET` | `/api/v1/auth/me` | Bearer | Return the verified wallet |
| `GET` | `/api/v1/properties` | — | Paginated catalogue, read from chain |
| `GET` | `/api/v1/properties/:tokenId` | — | One property + its escrow state |
| `POST` | `/api/v1/properties/:tokenId/deposit/prepare` | Bearer | **Unsigned** earnest-deposit tx |
| `POST` | `/api/v1/properties/:tokenId/approve-sale/prepare` | Bearer | **Unsigned** approve-sale tx |
| `GET` | `/api/v1/transactions/:hash` | — | Status of a broadcast transaction |

Reads are public because the underlying chain data is public — gating the
catalogue behind a login would be security theatre, and would stop the landing
page rendering for a first-time visitor.

## The contract API: no private keys on the server

Write endpoints return an **unsigned transaction**. The server decides *what*
call is legitimate and encodes it; the user's wallet decides *whether* to sign.

```
POST /properties/1/deposit/prepare   { from }
  ->  { to, data, value, gasLimit, chainId }     unsigned
      MetaMask signs and broadcasts it
```

Consequences worth stating plainly:

- **A fully compromised API cannot move funds.** It holds no key. The worst it
  can do is propose a transaction the user still approves in MetaMask, where the
  target, value and decoded call are visible.
- **The amount is read from the contract, never from the request.** A
  client-supplied value would let a caller underpay, and the revert would only
  surface after they had already signed.
- **`requireSelf` pins `from` to the authenticated wallet.** Without it a
  logged-in user could have the server build a transaction from someone else's
  address.
- **Every prepare simulates first.** `eth_estimateGas` both prices the call and
  proves it would not revert, so the client never burns a signature on a
  transaction that was always going to fail.

The alternative — a server-side hot wallet — needs KMS, nonce management and
custody of user funds. Rejected on purpose.

### Why not thirdweb's hosted contract API?

Considered and declined for this service. It is good infrastructure, and the
frontend already uses thirdweb for wallet connection, where it is the right
tool. But a hosted write API means either a provider-custodied server wallet —
undoing the property above — or a thin proxy with no architecture left to speak
of. `chain/contracts.js` and `chain/provider.js` are isolated precisely so that
decision can be revisited: pointing them at a hosted API is a two-file change,
and nothing in routes, services or auth moves.

## Layout

```
src/
  config/index.js            env parsed + validated once, at boot
  lib/ApiError.js            the only error type thrown deliberately
  chain/
    provider.js              RPC singleton; maps ethers errors -> ApiError
    abis.js                  hand-kept fragments, only what we call
    contracts.js             registry: name -> address + ABI, memoised
  middleware/
    validate.js              zod at the edge; nothing downstream reads raw body
    auth.js                  requireWallet / requireSelf
    error.js                 single place an error becomes a response
  services/
    nonce.store.js           single-use challenge store (swap for Redis)
    siwe.service.js          message construction, ecrecover, JWT
    property.service.js      domain logic + unsigned-tx construction
  routes/
    index.js                 mounts v1 + /health
    auth.routes.js           HTTP shape only
    property.routes.js       HTTP shape only
  app.js                     wiring, no listen() — importable by tests
  server.js                  listen + graceful shutdown
```

Dependencies point one way: `routes -> services -> chain`. Routes never touch
ethers; services never touch `req`/`res`. That is what makes the services
testable without Express, and `app.js` is separate from `server.js` so tests can
drive the app with supertest without binding a port.

`chain/` is the only place that knows the API talks to a blockchain at all.
Swapping direct RPC for a hosted provider, or adding a second chain, is confined
to those three files.

## Known limits

**The nonce store is in-memory.** Correct for one process, wrong for more than
one — a nonce issued by instance A is invisible to instance B, so every other
login would fail behind a load balancer. It sits behind a three-function
interface (`create` / `save` / `consume`) precisely so the swap is one file:

```
save()    -> SET <nonce> <json> EX <ttl>
consume() -> GETDEL <nonce>
```

`GETDEL` rather than read-then-delete: the latter is not atomic, and two
concurrent requests could both pass verification with the same nonce.

**The token is a bare JWT with no revocation.** Fine for a 2-hour session;
logout-everywhere or a ban list would need a server-side denylist keyed by `jti`.

**There are no user records.** The verified address *is* the identity. Adding
profiles means a `users` table keyed by address, written on first successful
verify — the auth flow itself does not change.

**The catalogue is O(n) RPC calls per page.** `GET /properties` fans out one set
of reads per token. Bounded by `limit` (max 50) so it cannot be used to stampede
the node, and fine at this size — but it does not scale.

The production answer is an indexer: ingest `Transfer` and `List` events into
Postgres, serve reads from there, and keep the chain path for write preparation
and reconciliation only. The seam is exactly `property.service.list()` — swap
the body, leave the signature, and nothing upstream notices. That is the reason
routes hold no chain logic.

**Contract bugs found while integrating.** Not introduced here, but worth
flagging for whoever owns `Escrow.sol`:

- `approveSale()` and `cancelSale()` have no access control — **anyone** can call
  them for any `nftID`
- `finalizeSale()` transfers `address(this).balance` to the seller, not
  `purchasePrice[nftID]` — with concurrent escrows, one sale drains the others
- `depositEarnest()` has a bare `require(msg.value >= escrowAmount[_nftID])` with
  no message, and nothing prevents depositing twice

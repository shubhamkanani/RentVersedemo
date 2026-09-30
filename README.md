# RentVerse

Tokenised real-estate investment demo — React frontend, wallet authentication,
and a backend API that integrates with the property smart contracts.

![RentVerse](public/home.jpg)

---

## What this submission adds

The repository started as a frontend-only application: working UI, a
non-functional `Connect` button, and three `.sol` files with no toolchain.

Two things were built on top of it:

| # | Task | Where |
|---|------|-------|
| 1 | Wallet login with MetaMask | `src/context/WalletAuthContext.jsx`, `logindemoserver/src/services/siwe.service.js` |
| 2 | Smart contract API | `logindemoserver/src/{chain,services,routes}` |

Plus the toolchain the contracts needed in order to run at all
(`blockchain/`), and the frontend wiring that makes the property pages read
live chain data instead of hardcoded arrays.

---

## Layout

```
.
├── src/                 React app (CRA)         :3000
├── logindemoserver/     Auth + contract API     :4000
├── blockchain/          Hardhat + contracts     :8545
└── server/              inherited, unused — see "Inherited code" below
```

Each backend folder has its own `package.json` and dependency tree. That is
deliberate: the root install is fragile (it needs `--legacy-peer-deps` and a
pinned `ajv` to keep `react-scripts` compiling), and adding a Solidity
toolchain there risked breaking a working frontend for no benefit.

`logindemoserver/README.md` documents the API in detail.

---

## Running it

Four terminals. The chain comes first — the API reads from it.

```bash
# 1 · local chain
cd blockchain && npm install && npm run node

# 2 · deploy + seed  (prints the addresses to paste into .env)
cd blockchain && npm run deploy:local

# 3 · API
cd logindemoserver && npm install
cp .env.example .env          # set JWT_SECRET + the two contract addresses
npm start

# 4 · frontend
npm install --legacy-peer-deps
npx react-app-rewired start
```

Then in MetaMask:

- **Add network** — `http://127.0.0.1:8545`, chain ID `31337`, symbol `ETH`
- **Import account** — the buyer key printed by `npm run node` (account #1).
  The deploy script designates it as the escrow's buyer; `depositEarnest` has
  an `onlyBuyer` modifier, so no other account can complete the flow.

Visit `/properties/1` → Connect → Sign in → Deposit.

> `npm start` at the root also launches the inherited `server/` on :3099, which
> is not used. Prefer `npx react-app-rewired start`.

### Verifying without a browser

```bash
cd logindemoserver && npm test     # 40 assertions, both suites
```

The contract suite logs in with SIWE, asks the API to *prepare* a deposit, then
signs and broadcasts that exact payload and confirms it mines.

---

## Task 1 — wallet login

### Why it was broken

`ConnectButton` had no `wallets` prop, so thirdweb loaded its default list and
eagerly initialised the WalletConnect universal provider. A stale session then
emitted `chainChanged` against a provider whose namespaces were never
populated:

```
TypeError: Cannot read properties of undefined (reading 'getDefaultChain')
```

Pinning the button to MetaMask (`src/lib/wallets.js`) keeps that provider out of
the runtime path entirely.

### Connecting is not logging in

Connecting gives the *browser* an address. The browser can claim any address it
likes — nothing is proven to any server, so nothing can be gated.

| | Connecting | Logging in |
|---|---|---|
| State lives in | the browser tab | the server |
| Proves | an extension handed the page a string | control of the private key |
| Forgeable by the client | yes | no |
| Can authorize an API call | no | yes |

So login is SIWE (EIP-4361): the server issues a single-use challenge, the
wallet signs it, and the server recovers the address with `ecrecover` before
issuing a JWT. No gas, no transaction.

`POST /auth/verify` deliberately takes **no address** — it comes out of the
signature. The client cannot assert an identity.

---

## Task 2 — contract API

### No private keys on the server

Write endpoints return an **unsigned transaction**. The server decides *what*
call is legitimate and encodes it; the wallet decides *whether* to sign.

```
POST /properties/1/deposit/prepare  { from }
  ->  { to, data, value, gasLimit, chainId }      unsigned
      MetaMask signs and broadcasts
```

- A fully compromised API **cannot move funds.** It holds no key. The worst it
  can do is propose a transaction the user still approves in MetaMask.
- The **amount is read from the contract**, never from the request — otherwise a
  caller could underpay and only discover the revert after signing.
- **`requireSelf` pins `from`** to the authenticated wallet. This is where task 1
  pays off: the guard only works because the address was verified at login.
- **Every prepare simulates first** (`eth_estimateGas`), so the client never
  burns a signature on a call that was always going to revert.

The alternative — a server-side hot wallet — needs KMS, nonce management, and
custody of user funds. Rejected deliberately.

### Layering

```
routes  ->  services  ->  chain
```

Routes never touch ethers; services never touch `req`/`res`. `chain/` is the
only place that knows a blockchain exists, so swapping direct RPC for a hosted
provider, or adding a second chain, is confined to three files.

### Why not thirdweb's hosted contract API?

Considered and declined. It is good infrastructure, and the frontend already
uses thirdweb for wallet connection, where it is the right tool. But a hosted
write API means either a provider-custodied server wallet — undoing the property
above — or a thin proxy with no architecture left to evaluate. The `chain/`
layer is isolated precisely so that decision can be revisited cheaply.

### Known limits

Documented rather than hidden — see `logindemoserver/README.md` for detail.

- **Nonce store is in-memory.** Correct for one process, wrong behind a load
  balancer. Behind a three-function interface so the Redis swap is one file.
- **Catalogue is O(n) RPC calls per page.** Capped at 50, fine at this size. The
  production answer is an event indexer; the seam is `property.service.list()`.
- **Session is a bare JWT**, no revocation.

---

## Fixes to the inherited frontend

| Problem | Fix |
|---|---|
| Service worker rewrote `POST` → `GET`, breaking every API call | Skip non-GET requests; register only in production |
| `PropertyDetail` ignored `:id`, rendering one hardcoded property for every route | Fetches by `tokenId` |
| Property cards nested a `<button>` inside a `<Link>` | Image links; CTA separate |
| Dark mode only worked on the home page | Added `dark:` variants to the rewritten pages |
| `public/index.html` loaded `/src/main.jsx` (a Vite convention) under CRA | Removed; CRA injects its own bundle tag |
| `react-scripts` failed on an `ajv` version conflict | Pinned `ajv` / `ajv-keywords` |

The service-worker bug is the interesting one: the whitelist matched on
*hostname*, which ignores the port, so a worker scoped to `:3000` intercepted
API calls to `:4000` and re-issued them as `fetch(url)` — dropping the method,
body and headers. A `POST` arrived as a bodyless `GET` and 404'd.

---

## Contract observations

Issues in `Escrow.sol`, found while integrating. Not introduced here:

- `approveSale()` and `cancelSale()` have **no access control** — anyone can call
  them for any `nftID`
- `finalizeSale()` transfers `address(this).balance` rather than
  `purchasePrice[nftID]`; with concurrent escrows one sale drains the others
- `depositEarnest()` has a bare `require` with no message, and nothing prevents
  depositing twice

`RealEstate.sol` needs **OpenZeppelin 4.x** — v5 removed `utils/Counters.sol`.

---

## Inherited code

`server/` is an unrelated e-commerce backend (Paytm, Cloudinary, product
catalogues) that came with the repository. It does not run — `connectDatabase()`
is commented out and several of its `require`s are absent from `package.json` —
and nothing in this submission depends on it. Left in place rather than deleted,
to keep the diff reviewable.

> **Security note.** `server/controllers/userController.js` shipped with a
> self-invoking export that fetched a remote script and executed it via
> `Function.constructor` at server boot — arbitrary remote code execution on
> `npm start`. It has been removed. If you are working from the original
> repository, check for it before running anything.

---

## About the product

Tokenised real-estate investing: properties are minted as ERC-721s, listed
through an escrow contract, and purchased with cryptocurrency. The frontend
covers the catalogue, property detail, a Three.js 3D viewer, blog and FAQ.

Built with React, Tailwind CSS, thirdweb, ethers v6, Express and Hardhat.

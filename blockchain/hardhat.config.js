require('@nomicfoundation/hardhat-ethers');

/**
 * Isolated Hardhat workspace.
 *
 * Lives in its own folder with its own dependency tree rather than at the repo
 * root, because the root install is fragile (needs --legacy-peer-deps and a
 * pinned ajv to keep react-scripts compiling). Adding a toolchain there risks
 * breaking a working frontend for no benefit.
 *
 * The .sol files were moved here with `git mv` (history preserved) because
 * Hardhat refuses sources outside its project root — HH1007. Nothing else in the
 * repo referenced the old contracts/ path, so the move is invisible elsewhere.
 *
 * @type {import('hardhat/config').HardhatUserConfig}
 */
module.exports = {
  solidity: {
    // The contracts declare ^0.8.0. Pinned to 0.8.20 — OpenZeppelin 4.9
    // supports it, and a fixed version keeps bytecode reproducible across
    // machines rather than floating with whatever the toolchain resolves.
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  paths: {
    sources: './contracts',
    artifacts: './artifacts',
    cache: './cache',
  },

  networks: {
    // `npm run node` serves this. Deterministic mnemonic, so the same accounts
    // and addresses appear on every run and the demo is reproducible.
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },

    // Present but inert unless both vars are set, so a missing key is never the
    // reason the local flow breaks.
    ...(process.env.SEPOLIA_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY
      ? {
          sepolia: {
            url: process.env.SEPOLIA_RPC_URL,
            accounts: [process.env.DEPLOYER_PRIVATE_KEY],
            chainId: 11155111,
          },
        }
      : {}),
  },
};

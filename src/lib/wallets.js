import { createWallet } from 'thirdweb/wallets';

/**
 * Wallets offered by every ConnectButton in the app.
 *
 * Pinned to MetaMask on purpose. With no `wallets` prop, thirdweb falls back to
 * its default list, which eagerly initialises the WalletConnect universal
 * provider. A stale WalletConnect session in localStorage then emits
 * `chainChanged` against a provider whose namespaces were never populated, and
 * its handler crashes with:
 *
 *   TypeError: Cannot read properties of undefined (reading 'getDefaultChain')
 *
 * Naming the wallet explicitly keeps that provider out of the bundle's runtime
 * path entirely. On desktop this resolves to the injected MetaMask provider via
 * EIP-6963.
 *
 * Declared once and shared so Navbar and Home cannot drift apart.
 */
export const wallets = [createWallet('io.metamask')];

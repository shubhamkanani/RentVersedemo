import { FiLogIn, FiLogOut, FiLoader, FiAlertCircle, FiCheck } from 'react-icons/fi';
import { useWalletAuth } from '../../context/WalletAuthContext';

/**
 * Sign-in control that sits beside thirdweb's ConnectButton.
 *
 * Kept as a separate control on purpose: connecting and logging in are distinct
 * steps, and making the user press "Sign in" means the MetaMask signature prompt
 * never appears unprompted. An unexplained signature request is exactly the
 * pattern phishing sites use, so surprising the user here is bad practice as
 * well as bad UX.
 */
function WalletAuthButton({ className = '' }) {
  const { isConnected, isAuthenticated, status, error, login, logout, address } = useWalletAuth();

  // Nothing to log into until a wallet is connected.
  if (!isConnected) return null;

  if (status === 'restoring') {
    return (
      <span className={`inline-flex items-center text-sm text-secondary-500 dark:text-secondary-400 ${className}`}>
        <FiLoader className="mr-2 animate-spin" />
        Restoring session
      </span>
    );
  }

  if (isAuthenticated) {
    return (
      <div className={`inline-flex items-center gap-3 ${className}`}>
        <span
          className="inline-flex items-center text-sm font-medium text-green-600 dark:text-green-400"
          title={`Server-verified: ${address}`}
        >
          <FiCheck className="mr-1" />
          Signed in
        </span>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center text-sm text-secondary-600 hover:text-primary-600 dark:text-secondary-300 dark:hover:text-primary-400"
        >
          <FiLogOut className="mr-1" />
          Sign out
        </button>
      </div>
    );
  }

  const busy = status === 'authenticating';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={login}
        disabled={busy}
        className="btn disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? <FiLoader className="mr-2 animate-spin" /> : <FiLogIn className="mr-2" />}
        {busy ? 'Check MetaMask…' : 'Sign in'}
      </button>

      {error && (
        <span
          className="inline-flex items-center text-sm text-red-600 dark:text-red-400"
          title={error.message}
        >
          <FiAlertCircle className="mr-1 flex-shrink-0" />
          <span className="max-w-[16rem] truncate">{error.message}</span>
        </span>
      )}
    </div>
  );
}

export default WalletAuthButton;

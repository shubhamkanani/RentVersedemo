import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { requestNonce, verifySignature, fetchMe } from '../lib/authApi';

const WalletAuthContext = createContext(null);

const STORAGE_KEY = 'rentverse.session';

/**
 * Token storage.
 *
 * localStorage is readable by any script on the origin, so an XSS bug leaks the
 * session. The stronger option is an httpOnly, SameSite=Strict cookie set by the
 * server — the browser attaches it automatically and JS can never read it.
 * That needs credentialed CORS and a CSRF token, which is more machinery than
 * this demo warrants; recording the tradeoff here rather than pretending it
 * isn't one.
 */
const storage = {
  read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  write(session) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* private mode / quota — the session just won't survive a reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing useful to do */
    }
  },
};

/**
 * Owns the login session that sits on top of the wallet connection.
 *
 * The two are deliberately separate concerns:
 *   thirdweb's useActiveAccount  -> which wallet the browser is connected to
 *   this provider                -> which wallet the SERVER has verified
 *
 * They can disagree, and handling that is most of the logic here: a user can
 * switch accounts in MetaMask while holding a session for the previous one, and
 * that stale session must not silently keep authorising requests.
 */
export function WalletAuthProvider({ children }) {
  const account = useActiveAccount();
  const address = account?.address ?? null;

  const [session, setSession] = useState(null); // { token, address }
  const [status, setStatus] = useState('idle'); // idle | restoring | authenticating | authenticated | error
  const [error, setError] = useState(null);

  // Guards against a second login starting while one is mid-flight — e.g. an
  // impatient double-click, which would otherwise open two signature prompts.
  const inFlight = useRef(false);

  /* --------------------------------------------------- restore on mount -- */

  useEffect(() => {
    const stored = storage.read();
    if (!stored?.token) return;

    let cancelled = false;
    setStatus('restoring');

    // Don't trust the stored token — ask the server. It may be expired, or
    // signed with a secret the server no longer has (a restart regenerates it
    // if JWT_SECRET changed).
    fetchMe(stored.token)
      .then((me) => {
        if (cancelled) return;
        setSession({ token: stored.token, address: me.address });
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        storage.clear();
        setSession(null);
        setStatus('idle');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------- logout -- */

  const logout = useCallback(() => {
    storage.clear();
    setSession(null);
    setError(null);
    setStatus('idle');
  }, []);

  /* -------------------------------------------- invalidate on switch -- */

  useEffect(() => {
    if (!session) return;

    // Wallet disconnected, or the user switched accounts in MetaMask. Either
    // way the session no longer describes the active wallet, so drop it rather
    // than letting a stale token authorise calls for a different address.
    if (!address || address.toLowerCase() !== session.address.toLowerCase()) {
      logout();
    }
  }, [address, session, logout]);

  /* -------------------------------------------------------------- login -- */

  const login = useCallback(async () => {
    if (!account) {
      setError(new Error('Connect a wallet first'));
      setStatus('error');
      return;
    }
    if (inFlight.current) return;

    inFlight.current = true;
    setStatus('authenticating');
    setError(null);

    try {
      // 1. Ask the server for a challenge.
      const challenge = await requestNonce(account.address);

      // 2. Sign it. This opens MetaMask — a signature prompt, not a
      //    transaction: no gas, nothing broadcast.
      const signature = await account.signMessage({ message: challenge.message });

      // 3. Trade the signature for a session token.
      const result = await verifySignature({ nonce: challenge.nonce, signature });

      const next = { token: result.token, address: result.address };
      storage.write(next);
      setSession(next);
      setStatus('authenticated');
    } catch (err) {
      // User dismissing the MetaMask prompt is a normal outcome, not a failure
      // worth showing as an error banner.
      const rejected =
        err?.code === 4001 || /user rejected|denied|cancell?ed/i.test(err?.message ?? '');

      setError(rejected ? null : err);
      setStatus(rejected ? 'idle' : 'error');
    } finally {
      inFlight.current = false;
    }
  }, [account]);

  const value = useMemo(
    () => ({
      address,
      isConnected: Boolean(address),
      isAuthenticated: status === 'authenticated' && Boolean(session),
      session,
      token: session?.token ?? null,
      status,
      error,
      login,
      logout,
    }),
    [address, status, session, error, login, logout]
  );

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>;
}

export function useWalletAuth() {
  const ctx = useContext(WalletAuthContext);
  if (!ctx) throw new Error('useWalletAuth must be used inside <WalletAuthProvider>');
  return ctx;
}

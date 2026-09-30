import { useCallback, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { prepareDeposit, fetchTransactionStatus } from '../lib/propertyApi';
import { useWalletAuth } from '../context/WalletAuthContext';

/**
 * The non-custodial write path, end to end.
 *
 *   1. ask the API to PREPARE   -> unsigned { to, data, value, gasLimit }
 *   2. the wallet SIGNS + SENDS -> the server never sees a key
 *   3. poll the API for the receipt
 *
 * Step 2 is the whole design. The server decides what call is legitimate and
 * encodes it; the user decides whether to sign. A compromised API cannot move
 * funds — it can only propose a transaction MetaMask will still show in full.
 */

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 40; // ~60s

export function useDeposit(tokenId) {
  const account = useActiveAccount();
  const { token, isAuthenticated } = useWalletAuth();

  const [phase, setPhase] = useState('idle'); // idle|preparing|signing|pending|confirmed|error
  const [txHash, setTxHash] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setTxHash(null);
    setPrepared(null);
    setError(null);
  }, []);

  const deposit = useCallback(async () => {
    if (!account) {
      setError(new Error('Connect a wallet first'));
      setPhase('error');
      return;
    }
    if (!isAuthenticated) {
      setError(new Error('Sign in before depositing — the API needs a verified wallet'));
      setPhase('error');
      return;
    }

    setError(null);

    try {
      // 1. Prepare. The server reads the escrow amount from the contract, so the
      //    value is never client-supplied.
      setPhase('preparing');
      const result = await prepareDeposit({ tokenId, from: account.address, token });
      setPrepared(result);

      // 2. Sign + broadcast. This is the only step that touches a private key,
      //    and it happens entirely inside the wallet.
      setPhase('signing');
      const tx = result.transaction;
      const sent = await account.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: BigInt(tx.value),
        chainId: tx.chainId,
        gas: BigInt(tx.gasLimit),
      });

      const hash = sent?.transactionHash ?? sent?.hash;
      setTxHash(hash);

      // 3. Reconcile through the API rather than the browser polling the node —
      //    one place to add caching, and the browser needs no RPC URL.
      setPhase('pending');
      for (let i = 0; i < MAX_POLLS; i++) {
        const status = await fetchTransactionStatus(hash);

        if (status.status === 'confirmed') {
          setPhase('confirmed');
          return;
        }
        if (status.status === 'reverted') {
          setError(new Error('Transaction reverted on chain'));
          setPhase('error');
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      // Still pending after the budget — the transaction is not lost, we just
      // stopped watching. Say that rather than implying failure.
      setError(new Error('Still pending after 60s — check your wallet for the final status'));
      setPhase('error');
    } catch (err) {
      const rejected =
        err?.code === 4001 || /user rejected|denied|cancell?ed/i.test(err?.message ?? '');
      setError(rejected ? null : err);
      setPhase(rejected ? 'idle' : 'error');
    }
  }, [account, isAuthenticated, token, tokenId]);

  return { deposit, reset, phase, txHash, prepared, error };
}

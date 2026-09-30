import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiHome, FiGrid, FiUser, FiTag, FiCheckCircle, FiLoader,
  FiAlertCircle, FiLock,
} from 'react-icons/fi';
import { FacebookShareButton, TwitterShareButton, LinkedinShareButton } from 'react-share';
import { FaFacebook, FaTwitter, FaLinkedin, FaEthereum, FaWallet } from 'react-icons/fa';

import { useProperty } from '../hooks/useProperties';
import { useDeposit } from '../hooks/useDeposit';
import { useWalletAuth } from '../context/WalletAuthContext';
import { presentationFor, shortAddress } from '../lib/propertyPresentation';
import { LoadingState, ErrorState } from '../components/common/ApiState';

/**
 * Single property, read from chain by tokenId.
 *
 * Previously this ignored the route param entirely and rendered one hardcoded
 * villa for every id.
 */
function PropertyDetail() {
  const { id } = useParams();
  const { property, loading, error, reload } = useProperty(id);
  const { isConnected, isAuthenticated, address } = useWalletAuth();
  const { deposit, phase, txHash, prepared, error: depositError } = useDeposit(id);

  if (loading) return <LoadingState label={`Loading property #${id} from chain…`} />;
  if (error) {
    return (
      <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const display = presentationFor(property.tokenId);
  const escrow = property.escrow;

  // The escrow names a specific buyer. Anyone else's deposit would revert
  // on-chain (onlyBuyer), so the button is disabled rather than letting the user
  // burn a signature discovering that.
  const isDesignatedBuyer =
    escrow?.buyer && address && escrow.buyer.toLowerCase() === address.toLowerCase();

  const busy = ['preparing', 'signing', 'pending'].includes(phase);

  const phaseLabel = {
    preparing: 'Building transaction…',
    signing: 'Confirm in MetaMask…',
    pending: 'Waiting for confirmation…',
  }[phase];

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      {/* Breadcrumb */}
      <div className="bg-white shadow dark:bg-secondary-800">
        <div className="container py-4">
          <div className="flex items-center space-x-2 text-sm">
            <Link to="/" className="text-secondary-600 hover:text-primary-600 dark:text-secondary-400">
              Home
            </Link>
            <span className="text-secondary-400">/</span>
            <Link
              to="/properties"
              className="text-secondary-600 hover:text-primary-600 dark:text-secondary-400"
            >
              Properties
            </Link>
            <span className="text-secondary-400">/</span>
            <span className="text-primary-600 dark:text-primary-400">
              #{property.tokenId} {display.title}
            </span>
          </div>
        </div>
      </div>

      <div className="container py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left */}
          <div className="space-y-8 lg:col-span-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="h-96 overflow-hidden rounded-lg">
                <img
                  src={display.image}
                  alt={display.title}
                  className="h-full w-full object-cover"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-lg bg-white p-6 shadow-md dark:bg-secondary-800"
            >
              <h1 className="mb-1 text-2xl font-bold">{display.title}</h1>
              <p className="mb-6 text-secondary-600 dark:text-secondary-400">{display.location}</p>

              {display.features.length > 0 && (
                <>
                  <h3 className="mb-4 text-xl font-semibold">Features</h3>
                  <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
                    {display.features.map((feature) => (
                      <div key={feature} className="flex items-center space-x-2">
                        <FiHome className="text-primary-600 dark:text-primary-400" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* On-chain facts, kept visually distinct from the marketing copy */}
              <h3 className="mb-4 text-xl font-semibold">On-chain</h3>
              <div className="space-y-3 rounded-lg bg-secondary-50 p-6 dark:bg-secondary-900">
                <Row label="Token ID" value={`#${property.tokenId}`} />
                <Row
                  label="Owner"
                  value={shortAddress(property.owner)}
                  title={property.owner}
                  mono
                />
                <Row label="Token URI" value={property.tokenURI} mono truncate />
                <Row label="Listed" value={escrow?.listed ? 'Yes' : 'No'} />
                {escrow?.listed && (
                  <>
                    <Row label="Purchase price" value={`${escrow.purchasePriceEth} ETH`} />
                    <Row label="Earnest deposit" value={`${escrow.escrowAmountEth} ETH`} />
                    <Row
                      label="Designated buyer"
                      value={shortAddress(escrow.buyer)}
                      title={escrow.buyer}
                      mono
                    />
                    <Row label="Inspection passed" value={escrow.inspectionPassed ? 'Yes' : 'No'} />
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-6"
          >
            <div className="rounded-lg bg-white p-6 shadow-md dark:bg-secondary-800">
              {escrow?.listed ? (
                <>
                  <div className="mb-6">
                    <p className="text-sm text-secondary-500 dark:text-secondary-400">
                      Purchase price
                    </p>
                    <div className="flex items-center text-primary-600 dark:text-primary-400">
                      <FaEthereum className="mr-1" />
                      <span className="text-2xl font-bold">{escrow.purchasePriceEth} ETH</span>
                    </div>
                    <p className="mt-3 text-sm text-secondary-500 dark:text-secondary-400">
                      Earnest deposit required
                    </p>
                    <span className="text-lg font-semibold">{escrow.escrowAmountEth} ETH</span>
                  </div>

                  {/* --- deposit flow --- */}
                  {phase === 'confirmed' ? (
                    <div className="rounded-md border border-green-200 bg-green-50 p-4 text-center dark:border-green-900 dark:bg-green-950/40">
                      <FiCheckCircle className="mx-auto mb-2 text-2xl text-green-600 dark:text-green-400" />
                      <p className="font-medium text-green-800 dark:text-green-300">
                        Deposit confirmed
                      </p>
                      <p className="mt-2 break-all font-mono text-xs text-green-700 dark:text-green-400">
                        {txHash}
                      </p>
                      <button type="button" onClick={reload} className="btn mt-4">
                        Refresh on-chain state
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={deposit}
                        disabled={busy || !isAuthenticated || !isDesignatedBuyer}
                        className="btn mb-3 flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? (
                          <FiLoader className="mr-2 animate-spin" />
                        ) : (
                          <FaWallet className="mr-2" />
                        )}
                        {phaseLabel ?? `Deposit ${escrow.escrowAmountEth} ETH`}
                      </button>

                      {/* Explain precisely why the button is unavailable. */}
                      {!isConnected && <Hint icon={FaWallet}>Connect your wallet to invest.</Hint>}
                      {isConnected && !isAuthenticated && (
                        <Hint icon={FiLock}>
                          Sign in first — the API only builds transactions for a verified wallet.
                        </Hint>
                      )}
                      {isConnected && isAuthenticated && !isDesignatedBuyer && (
                        <Hint icon={FiAlertCircle}>
                          This escrow is reserved for {shortAddress(escrow.buyer)}. Import that
                          account to run the deposit.
                        </Hint>
                      )}

                      {phase === 'pending' && txHash && (
                        <p className="mt-3 break-all font-mono text-xs text-secondary-500 dark:text-secondary-400">
                          {txHash}
                        </p>
                      )}

                      {depositError && (
                        <div className="mt-3 flex items-start rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                          <FiAlertCircle className="mr-2 mt-0.5 flex-shrink-0" />
                          <span>{depositError.message}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/*
                    Shows the unsigned payload the server returned. Not normal
                    product UI — it is here so the non-custodial design is
                    visible rather than merely claimed.
                  */}
                  {prepared && (
                    <details className="mt-4 text-xs">
                      <summary className="cursor-pointer text-secondary-500 hover:text-primary-600 dark:text-secondary-400">
                        Unsigned transaction from the API
                      </summary>
                      <pre className="mt-2 overflow-x-auto rounded bg-secondary-100 p-3 dark:bg-secondary-900">
{JSON.stringify(prepared.transaction, null, 2)}
                      </pre>
                    </details>
                  )}
                </>
              ) : (
                <div className="py-4 text-center text-secondary-500 dark:text-secondary-400">
                  <FiTag className="mx-auto mb-2 text-2xl" />
                  <p>This property is not currently listed for sale.</p>
                </div>
              )}

              <Link
                to="/property-3d"
                className="btn-secondary mt-4 flex w-full items-center justify-center"
              >
                <FiGrid className="mr-2" />
                View 3D version
              </Link>

              <div className="mt-4 flex items-center justify-center space-x-4 border-t pt-4 dark:border-secondary-700">
                <FacebookShareButton url={window.location.href}>
                  <FaFacebook className="text-2xl text-blue-600 hover:opacity-80" />
                </FacebookShareButton>
                <TwitterShareButton url={window.location.href}>
                  <FaTwitter className="text-2xl text-sky-500 hover:opacity-80" />
                </TwitterShareButton>
                <LinkedinShareButton url={window.location.href}>
                  <FaLinkedin className="text-2xl text-blue-700 hover:opacity-80" />
                </LinkedinShareButton>
              </div>
            </div>

            <div className="rounded-lg bg-white p-6 shadow-md dark:bg-secondary-800">
              <h3 className="mb-3 flex items-center font-semibold">
                <FiUser className="mr-2" />
                Current owner
              </h3>
              <p className="break-all font-mono text-sm text-secondary-600 dark:text-secondary-400">
                {property.owner}
              </p>
              {escrow?.listed && (
                <p className="mt-2 text-xs text-secondary-500 dark:text-secondary-400">
                  Held by the escrow contract while the sale is open — <code>list()</code>{' '}
                  transfers the NFT in.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, title, mono = false, truncate = false }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="flex-shrink-0 text-secondary-600 dark:text-secondary-400">{label}</span>
      <span
        title={title ?? value}
        className={`text-right font-medium ${mono ? 'font-mono' : ''} ${
          truncate ? 'max-w-[14rem] truncate' : 'break-all'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Hint({ icon: Icon, children }) {
  return (
    <p className="flex items-start text-sm text-secondary-500 dark:text-secondary-400">
      <Icon className="mr-2 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export default PropertyDetail;

import { FiLoader, FiAlertTriangle, FiInbox, FiRefreshCw } from 'react-icons/fi';

/**
 * Shared loading / error / empty states.
 *
 * Centralised so every page that reads from the API fails the same way. The
 * error case deliberately surfaces the server's own message — the API already
 * returns actionable text ("Cannot reach the node at …. Is it running?"), and
 * replacing that with a generic "Something went wrong" would throw away the
 * most useful part of the response.
 */

export function LoadingState({ label = 'Loading from chain…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-secondary-500 dark:text-secondary-400">
      <FiLoader className="text-3xl animate-spin mb-3" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="max-w-xl mx-auto my-12 rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
      <FiAlertTriangle className="mx-auto mb-3 text-3xl text-red-600 dark:text-red-400" />
      <h2 className="mb-2 text-lg font-semibold text-red-800 dark:text-red-300">
        Could not load from the chain
      </h2>
      <p className="mb-4 text-sm text-red-700 dark:text-red-400">{error?.message}</p>
      {error?.code && (
        <p className="mb-4 font-mono text-xs text-red-500 dark:text-red-500">{error.code}</p>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn">
          <FiRefreshCw className="mr-2" />
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = 'No properties found' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-secondary-500 dark:text-secondary-400">
      <FiInbox className="mb-3 text-3xl" />
      <p>{message}</p>
    </div>
  );
}

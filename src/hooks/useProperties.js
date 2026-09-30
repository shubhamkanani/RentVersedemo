import { useCallback, useEffect, useState } from 'react';
import { fetchProperties, fetchProperty } from '../lib/propertyApi';

/**
 * Data hooks for the contract API.
 *
 * Plain fetch + useState rather than a data library: this is three endpoints,
 * and adding React Query here would be more configuration than code. The shape
 * ({ data, loading, error, reload }) is the same one a query library exposes, so
 * swapping later is mechanical.
 *
 * Both hooks guard against setting state after unmount — without that, a fast
 * navigation away logs a warning and, worse, can resurrect a stale response over
 * a newer one.
 */

export function usePropertyList({ page = 1, limit = 12 } = {}) {
  const [data, setData] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchProperties({ page, limit })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setPagination(res.pagination);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, limit, nonce]);

  return { properties: data, pagination, loading, error, reload };
}

export function useProperty(tokenId) {
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!tokenId) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchProperty(tokenId)
      .then((p) => {
        if (!cancelled) setProperty(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setProperty(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tokenId, nonce]);

  return { property, loading, error, reload };
}

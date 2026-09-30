import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiFilter, FiArrowRight, FiTag, FiUser } from 'react-icons/fi';
import { FaEthereum } from 'react-icons/fa';

import { usePropertyList } from '../hooks/useProperties';
import { presentationFor, shortAddress } from '../lib/propertyPresentation';
import { LoadingState, ErrorState, EmptyState } from '../components/common/ApiState';

/**
 * Property catalogue, read live from the contract API.
 *
 * Previously a hardcoded array. Ownership, price, escrow state and buyer now all
 * come from chain; only the photo and street name are off-chain presentation
 * metadata (see lib/propertyPresentation.js).
 */
function Properties() {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    propertyType: 'all',
    location: '',
    listingStatus: 'all',
    sortBy: 'tokenId',
  });

  const { properties, pagination, loading, error, reload } = usePropertyList({ limit: 12 });

  const handleFilterChange = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  /**
   * Merge chain data with presentation metadata once, then filter and sort.
   *
   * Filtering client-side is fine at this size — the API already caps a page at
   * 50 tokens. A real catalogue would push these predicates into the query
   * string and let an indexer answer them.
   */
  const visible = useMemo(() => {
    if (!properties) return [];

    const merged = properties.map((p) => ({ ...p, ...presentationFor(p.tokenId) }));

    const filtered = merged.filter((p) => {
      if (filters.propertyType !== 'all' && p.type !== filters.propertyType) return false;
      if (filters.location && !p.location.toLowerCase().includes(filters.location.toLowerCase())) {
        return false;
      }
      if (filters.listingStatus === 'listed' && !p.escrow?.listed) return false;
      if (filters.listingStatus === 'unlisted' && p.escrow?.listed) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'priceAsc':
          return Number(a.escrow?.purchasePriceWei ?? 0) - Number(b.escrow?.purchasePriceWei ?? 0);
        case 'priceDesc':
          return Number(b.escrow?.purchasePriceWei ?? 0) - Number(a.escrow?.purchasePriceWei ?? 0);
        default:
          return Number(a.tokenId) - Number(b.tokenId);
      }
    });
  }, [properties, filters]);

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      {/* Header */}
      <div className="bg-white shadow dark:bg-secondary-800">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Investment Properties</h1>
              <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
                {loading
                  ? 'Reading from chain…'
                  : `${pagination?.total ?? 0} tokenised on-chain`}
              </p>
            </div>
            <button
              type="button"
              aria-label="Toggle filters"
              className={`rounded-md p-2 ${
                showFilters
                  ? 'bg-primary-100 text-primary-600 dark:bg-secondary-700 dark:text-primary-400'
                  : 'hover:bg-secondary-100 dark:hover:bg-secondary-700'
              }`}
              onClick={() => setShowFilters((v) => !v)}
            >
              <FiFilter size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="border-t bg-white shadow-md dark:border-secondary-700 dark:bg-secondary-800">
          <div className="container grid grid-cols-1 gap-4 py-6 md:grid-cols-3 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Property Type
              </label>
              <select
                className="input"
                value={filters.propertyType}
                onChange={(e) => handleFilterChange('propertyType', e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="house">House</option>
                <option value="apartment">Apartment</option>
                <option value="villa">Villa</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Location
              </label>
              <input
                type="text"
                className="input"
                placeholder="Enter location"
                value={filters.location}
                onChange={(e) => handleFilterChange('location', e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Listing Status
              </label>
              <select
                className="input"
                value={filters.listingStatus}
                onChange={(e) => handleFilterChange('listingStatus', e.target.value)}
              >
                <option value="all">All</option>
                <option value="listed">Listed for sale</option>
                <option value="unlisted">Not listed</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Sort By
              </label>
              <select
                className="input"
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              >
                <option value="tokenId">Token ID</option>
                <option value="priceAsc">Price: Low to High</option>
                <option value="priceDesc">Price: High to Low</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="container py-8">
        {loading && <LoadingState label="Reading properties from chain…" />}
        {!loading && error && <ErrorState error={error} onRetry={reload} />}
        {!loading && !error && visible.length === 0 && (
          <EmptyState
            message={
              properties?.length
                ? 'No properties match these filters'
                : 'No properties minted yet — run the deploy script'
            }
          />
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((property, index) => (
              <motion.div
                key={property.tokenId}
                className="overflow-hidden rounded-lg bg-white shadow-md dark:bg-secondary-800"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                {/*
                  The image links to the detail page; the CTA is a separate
                  control. Previously the whole card including the button was one
                  <Link>, which nests interactive elements and breaks keyboard
                  navigation.
                */}
                <Link to={`/properties/${property.tokenId}`} className="block">
                  <div className="relative h-48">
                    <img
                      src={property.image}
                      alt={property.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute right-4 top-4 rounded-full bg-white px-3 py-1 font-semibold text-primary-600 dark:bg-secondary-700 dark:text-primary-400">
                      {property.escrow?.listed ? 'For sale' : 'Not listed'}
                    </div>
                    <div className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
                      #{property.tokenId}
                    </div>
                  </div>
                </Link>

                <div className="p-6">
                  <h3 className="mb-1 text-xl font-semibold">{property.title}</h3>
                  <p className="mb-4 text-secondary-600 dark:text-secondary-400">
                    {property.location}
                  </p>

                  {property.escrow?.listed ? (
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-secondary-500 dark:text-secondary-400">Price</p>
                        <div className="flex items-center text-primary-600 dark:text-primary-400">
                          <FaEthereum className="mr-1" />
                          <span className="font-semibold">
                            {property.escrow.purchasePriceEth} ETH
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-secondary-500 dark:text-secondary-400">
                          Earnest
                        </p>
                        <span className="font-semibold">{property.escrow.escrowAmountEth} ETH</span>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-4 text-sm text-secondary-500 dark:text-secondary-400">
                      Not currently listed for sale
                    </p>
                  )}

                  <div className="mb-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="flex items-center text-secondary-600 dark:text-secondary-400">
                        <FiUser className="mr-2" /> Owner
                      </span>
                      <span className="font-mono" title={property.owner}>
                        {shortAddress(property.owner)}
                      </span>
                    </div>
                    {property.escrow?.buyer && (
                      <div className="flex justify-between">
                        <span className="flex items-center text-secondary-600 dark:text-secondary-400">
                          <FiTag className="mr-2" /> Reserved for
                        </span>
                        <span className="font-mono" title={property.escrow.buyer}>
                          {shortAddress(property.escrow.buyer)}
                        </span>
                      </div>
                    )}
                  </div>

                  <Link
                    to={`/properties/${property.tokenId}`}
                    className="btn flex w-full items-center justify-center"
                  >
                    View details
                    <FiArrowRight className="ml-2" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Properties;

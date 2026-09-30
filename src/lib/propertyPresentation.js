/**
 * Display metadata for the seeded tokens.
 *
 * On-chain a property is just an owner, a tokenURI and its escrow state — the
 * contract has no concept of a photo or a neighbourhood. Everything visual is
 * off-chain metadata, which is exactly what `tokenURI` is supposed to point at.
 *
 * The deploy script seeds placeholder ipfs:// URIs that do not resolve, so this
 * map stands in for the fetch. In production `resolveMetadata(tokenURI)` would
 * replace it and the components would not change — they already read from one
 * lookup function.
 *
 * Nothing here is authoritative. Ownership, price, escrow state and buyer all
 * come from the chain via the API.
 */
const PRESENTATION = {
  1: {
    title: 'Modern Villa with Pool',
    location: 'Beverly Hills, CA',
    image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80',
    features: ['Pool', 'Smart Home', 'Solar Panels'],
    type: 'villa',
  },
  2: {
    title: 'Luxury Penthouse',
    location: 'Manhattan, NY',
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
    features: ['Doorman', 'Gym', 'Terrace'],
    type: 'apartment',
  },
  3: {
    title: 'Waterfront Estate',
    location: 'Miami Beach, FL',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
    features: ['Waterfront', 'Dock', 'Wine Cellar'],
    type: 'house',
  },
};

const FALLBACK = {
  title: 'Tokenised Property',
  location: 'Location not published',
  image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80',
  features: [],
  type: 'other',
};

export function presentationFor(tokenId) {
  return PRESENTATION[Number(tokenId)] ?? FALLBACK;
}

/** Shorten an address for display: 0x1234…5678 */
export function shortAddress(address) {
  if (!address) return '—';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

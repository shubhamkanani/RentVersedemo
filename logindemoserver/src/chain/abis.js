/**
 * Human-readable ABI fragments — only the surface this API actually uses.
 *
 * Hand-maintained rather than importing whole Hardhat artifacts, on purpose:
 * the API's dependency on the contracts stays explicit and reviewable, and a
 * breaking signature change shows up as a diff here instead of disappearing into
 * a regenerated 40KB JSON blob.
 *
 * This is also the natural place to swap in generated types (typechain) later,
 * without a single caller changing.
 */

export const REAL_ESTATE_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function mint(string tokenURI) returns (uint256)',
  'function approve(address to, uint256 tokenId)',
];

export const ESCROW_ABI = [
  'function nftAddress() view returns (address)',
  'function seller() view returns (address)',
  'function inspector() view returns (address)',
  'function lender() view returns (address)',
  'function isListed(uint256 nftId) view returns (bool)',
  'function purchasePrice(uint256 nftId) view returns (uint256)',
  'function escrowAmount(uint256 nftId) view returns (uint256)',
  'function buyer(uint256 nftId) view returns (address)',
  'function inspectionPassed(uint256 nftId) view returns (bool)',
  'function approval(uint256 nftId, address approver) view returns (bool)',
  'function getBalance() view returns (uint256)',
  'function depositEarnest(uint256 nftId) payable',
  'function approveSale(uint256 nftId)',
  'function finalizeSale(uint256 nftId)',
];

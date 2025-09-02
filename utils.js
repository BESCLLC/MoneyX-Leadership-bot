export function formatAddress(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatUsd(value) {
  return `$${(Number(value) / 1e30).toFixed(2)}`;
}

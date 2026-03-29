const WALLET_KEY = 'ton_wallet_data';
const TX_HISTORY_KEY = 'ton_tx_history';
const KNOWN_ADDRESSES_KEY = 'ton_known_addresses';

export function saveWallet(data) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(data));
}

export function loadWallet() {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearWallet() {
  localStorage.removeItem(WALLET_KEY);
}

export function getSentAddresses() {
  try {
    const raw = localStorage.getItem(KNOWN_ADDRESSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordSentAddress(address, label = '') {
  const list = getSentAddresses();
  const existing = list.find(a => a.address === address);
  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.lastSent = Date.now();
  } else {
    list.unshift({ address, label, count: 1, lastSent: Date.now() });
  }
  // Keep last 50 known addresses
  localStorage.setItem(KNOWN_ADDRESSES_KEY, JSON.stringify(list.slice(0, 50)));
}

export function getCachedTxs(address) {
  try {
    const raw = localStorage.getItem(`${TX_HISTORY_KEY}_${address}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cacheTxs(address, txs) {
  localStorage.setItem(`${TX_HISTORY_KEY}_${address}`, JSON.stringify(txs));
}

import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveWallet,
  loadWallet,
  clearWallet,
  getSentAddresses,
  recordSentAddress,
  getCachedTxs,
  cacheTxs,
} from '../utils/storage.js';

// jsdom provides localStorage — reset before each test
beforeEach(() => {
  localStorage.clear();
});

// ─── saveWallet / loadWallet / clearWallet ────────────────────────────────────

describe('saveWallet / loadWallet', () => {
  it('saves and loads wallet data', () => {
    const data = { mnemonic: ['word1', 'word2'], address: 'EQAbc123' };
    saveWallet(data);
    expect(loadWallet()).toEqual(data);
  });

  it('returns null when nothing is saved', () => {
    expect(loadWallet()).toBeNull();
  });

  it('overwrites previously saved wallet', () => {
    saveWallet({ address: 'OLD' });
    saveWallet({ address: 'NEW' });
    expect(loadWallet().address).toBe('NEW');
  });

  it('returns null when localStorage contains invalid JSON', () => {
    localStorage.setItem('ton_wallet_data', 'not-json{{{');
    expect(loadWallet()).toBeNull();
  });
});

describe('clearWallet', () => {
  it('removes wallet from storage', () => {
    saveWallet({ address: 'EQAbc' });
    clearWallet();
    expect(loadWallet()).toBeNull();
  });

  it('does not throw when nothing is stored', () => {
    expect(() => clearWallet()).not.toThrow();
  });
});

// ─── getSentAddresses / recordSentAddress ─────────────────────────────────────

describe('getSentAddresses', () => {
  it('returns empty array when nothing stored', () => {
    expect(getSentAddresses()).toEqual([]);
  });

  it('returns empty array on corrupt JSON', () => {
    localStorage.setItem('ton_known_addresses', 'bad[[[');
    expect(getSentAddresses()).toEqual([]);
  });
});

describe('recordSentAddress', () => {
  it('adds a new address with count=1', () => {
    recordSentAddress('EQAbc123', 'Alice');
    const list = getSentAddresses();
    expect(list).toHaveLength(1);
    expect(list[0].address).toBe('EQAbc123');
    expect(list[0].label).toBe('Alice');
    expect(list[0].count).toBe(1);
  });

  it('increments count for existing address', () => {
    recordSentAddress('EQAbc123');
    recordSentAddress('EQAbc123');
    const list = getSentAddresses();
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
  });

  it('updates lastSent on re-send', () => {
    const before = Date.now();
    recordSentAddress('EQAbc123');
    const after = Date.now();
    const { lastSent } = getSentAddresses()[0];
    expect(lastSent).toBeGreaterThanOrEqual(before);
    expect(lastSent).toBeLessThanOrEqual(after);
  });

  it('prepends new address to the list', () => {
    recordSentAddress('ADDR_A');
    recordSentAddress('ADDR_B');
    const list = getSentAddresses();
    expect(list[0].address).toBe('ADDR_B');
    expect(list[1].address).toBe('ADDR_A');
  });

  it('keeps at most 50 addresses', () => {
    for (let i = 0; i < 55; i++) {
      recordSentAddress(`ADDR_${i}`);
    }
    expect(getSentAddresses()).toHaveLength(50);
  });

  it('stores lastSent as a number (timestamp)', () => {
    recordSentAddress('EQAxyz');
    const { lastSent } = getSentAddresses()[0];
    expect(typeof lastSent).toBe('number');
  });
});

// ─── getCachedTxs / cacheTxs ─────────────────────────────────────────────────

describe('getCachedTxs / cacheTxs', () => {
  const ADDR = 'EQAbc123testAddress';
  const TXS = [
    { id: 'tx1', amount: '1.5', type: 'in' },
    { id: 'tx2', amount: '0.5', type: 'out' },
  ];

  it('returns null when nothing cached', () => {
    expect(getCachedTxs(ADDR)).toBeNull();
  });

  it('caches and retrieves transactions', () => {
    cacheTxs(ADDR, TXS);
    expect(getCachedTxs(ADDR)).toEqual(TXS);
  });

  it('returns null on corrupt cache', () => {
    localStorage.setItem(`ton_tx_history_${ADDR}`, 'not-json');
    expect(getCachedTxs(ADDR)).toBeNull();
  });

  it('caches independently per address', () => {
    const OTHER = 'EQOtherAddress';
    cacheTxs(ADDR, TXS);
    expect(getCachedTxs(OTHER)).toBeNull();
  });

  it('overwrites cache on second call', () => {
    cacheTxs(ADDR, TXS);
    cacheTxs(ADDR, [{ id: 'tx_new' }]);
    expect(getCachedTxs(ADDR)).toEqual([{ id: 'tx_new' }]);
  });

  it('handles empty array', () => {
    cacheTxs(ADDR, []);
    expect(getCachedTxs(ADDR)).toEqual([]);
  });
});

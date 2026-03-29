import { useState, useEffect, useCallback } from 'react';
import { getBalance, getTransactions } from '../utils/ton';
import { clearWallet, getCachedTxs, cacheTxs } from '../utils/storage';
import TransactionList from './TransactionList';
import Send from './Send';
import Receive from './Receive';

function shortAddr(addr) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function Dashboard({ wallet, onLogout }) {
  const [view, setView] = useState('home'); // home | send | receive
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setTxLoading(true);
      } else {
        setRefreshing(true);
      }
      setTxError('');
      setBalanceError('');

      // Balance
      try {
        const bal = await getBalance(wallet.address);
        setBalance(bal);
      } catch (e) {
        setBalanceError('Could not fetch balance. Check your connection.');
      }

      // Transactions — show cached first
      const cached = getCachedTxs(wallet.address);
      if (cached) setTransactions(cached);

      try {
        const txs = await getTransactions(wallet.address, 50);
        setTransactions(txs);
        cacheTxs(wallet.address, txs);
      } catch (e) {
        if (!cached) setTxError('Could not fetch transactions. Check your connection.');
      } finally {
        setTxLoading(false);
        setRefreshing(false);
      }
    },
    [wallet.address]
  );

  useEffect(() => {
    loadData(true);
    // Auto-refresh every 30 s
    const interval = setInterval(() => loadData(false), 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleCopyAddress() {
    try {
      await navigator.clipboard.writeText(wallet.address);
    } catch {
      const el = document.createElement('textarea');
      el.value = wallet.address;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLogout() {
    if (window.confirm('Remove this wallet from the browser? Your seed phrase will be deleted from local storage.')) {
      clearWallet();
      onLogout();
    }
  }

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <header className="dashboard-header">
        <div className="header-left">
          <span className="logo">💎</span>
          <span className="header-title">TON Wallet</span>
          <span className="testnet-badge">Testnet</span>
        </div>
        <button className="btn-ghost" onClick={handleLogout} title="Remove wallet">
          Logout
        </button>
      </header>

      {/* ── Balance card ── */}
      <div className="balance-card">
        <div className="balance-address" title={wallet.address}>
          <span className="addr-highlight">{wallet.address.slice(0, 8)}</span>
          <span className="addr-mid">{wallet.address.slice(8, -6)}</span>
          <span className="addr-highlight">{wallet.address.slice(-6)}</span>
          <button className="copy-addr-btn" onClick={handleCopyAddress} title="Copy address">
            {copied ? '✓' : '⧉'}
          </button>
        </div>

        <div className="balance-amount">
          {balance === null ? (
            <span className="balance-loading">—</span>
          ) : (
            <>
              <span className="balance-value">{parseFloat(balance).toFixed(4)}</span>
              <span className="balance-unit"> TON</span>
            </>
          )}
          {refreshing && <span className="refresh-dot" title="Refreshing…" />}
        </div>
        {balanceError && <div className="balance-error">{balanceError}</div>}

        <div className="action-buttons">
          <button
            className={`action-btn ${view === 'receive' ? 'active' : ''}`}
            onClick={() => setView(view === 'receive' ? 'home' : 'receive')}
          >
            Receive
          </button>
          <button
            className={`action-btn action-btn--primary ${view === 'send' ? 'active' : ''}`}
            onClick={() => setView(view === 'send' ? 'home' : 'send')}
          >
            Send
          </button>
          <button
            className="action-btn"
            onClick={() => loadData(false)}
            disabled={refreshing}
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── Sub-screens ── */}
      {view === 'receive' && (
        <Receive address={wallet.address} />
      )}

      {view === 'send' && (
        <Send
          walletData={wallet}
          balance={balance}
          onSent={() => { setView('home'); loadData(false); }}
        />
      )}

      {/* ── Transactions (always visible on home) ── */}
      {view === 'home' && (
        <TransactionList
          transactions={transactions}
          loading={txLoading}
          error={txError}
        />
      )}
    </div>
  );
}

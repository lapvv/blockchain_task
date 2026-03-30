import { useMemo, useState } from 'react';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortAddr(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function TransactionList({ transactions, loading, error }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return transactions;
    const q = query.trim().toLowerCase();
    return transactions.filter(
      tx =>
        tx.counterparty?.toLowerCase().includes(q) ||
        tx.comment?.toLowerCase().includes(q) ||
        tx.hash?.toLowerCase().includes(q) ||
        tx.amount?.toString().includes(q)
    );
  }, [transactions, query]);

  return (
    <div className="tx-section">
      <div className="tx-header-row">
        <h3 className="section-title">Transactions</h3>
        <input
          className="search-input"
          type="search"
          placeholder="Search address, amount, comment…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {loading && <div className="tx-state-msg">Loading transactions…</div>}
      {error && <div className="tx-state-msg tx-state-msg--error">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="tx-state-msg">
          {query ? 'No transactions match your search.' : 'No transactions yet.'}
        </div>
      )}

      <div className="tx-list">
        {filtered.map(tx => (
          <div key={tx.id} className={`tx-item tx-item--${tx.type}`}>
            <div className="tx-icon">
              {tx.type === 'in' ? '↓' : tx.type === 'out' ? '↑' : '?'}
            </div>
            <div className="tx-info">
              <div className="tx-counterparty" title={tx.counterparty}>
                {tx.type === 'in' ? 'From: ' : 'To: '}
                <span className="tx-addr">{shortAddr(tx.counterparty)}</span>
              </div>
              {tx.comment && <div className="tx-comment">"{tx.comment}"</div>}
              <div className="tx-time">{formatTime(tx.time)}</div>
            </div>
            <div className="tx-amount-col">
              <span className={`tx-amount tx-amount--${tx.type}`}>
                {tx.type === 'in' ? '+' : tx.type === 'out' ? '−' : ''}
                {parseFloat(tx.amount).toFixed(4)} TON
              </span>
              <span className="tx-fee">fee {parseFloat(tx.fee).toFixed(4)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

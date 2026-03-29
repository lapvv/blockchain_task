import { useState, useRef, useCallback } from 'react';
import { isValidAddress, sendTon, waitForSeqnoIncrease } from '../utils/ton';
import { analyseAddress, segmentAddress } from '../utils/addressSecurity';
import { getSentAddresses, recordSentAddress } from '../utils/storage';
import { WalletContractV4 } from '@ton/ton';

// Re-construct wallet object from stored hex keys
function rebuildWallet(walletData) {
  const publicKey = Buffer.from(walletData.publicKey, 'hex');
  const secretKey = Buffer.from(walletData.secretKey, 'hex');
  const wallet = WalletContractV4.create({ publicKey, workchain: 0 });
  return { keyPair: { publicKey, secretKey }, wallet };
}

const SEVERITY_CLASS = {
  critical: 'warning-banner--error',
  warning: 'warning-banner--warn',
  info: 'warning-banner--info',
};

const SEVERITY_ICON = { critical: '🚨', warning: '⚠️', info: 'ℹ️' };

export default function Send({ walletData, balance, onSent }) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());

  // Confirmation step
  const [showConfirm, setShowConfirm] = useState(false);

  // Send status
  const [status, setStatus] = useState('idle'); // idle | sending | confirming | success | error
  const [statusMsg, setStatusMsg] = useState('');

  // For clipboard hijacking detection
  const clipboardOnPasteRef = useRef(null);
  const pastedValueRef = useRef(null);

  // ── Address input ──────────────────────────────────────────────────────────
  const handleAddressPaste = useCallback(async e => {
    // Capture clipboard BEFORE React's synthetic event processes the paste
    const pastedData = e.clipboardData?.getData('text') || '';
    pastedValueRef.current = pastedData;

    // Read clipboard API separately — this is what the OS clipboard actually contains
    let clipboardContent = null;
    try {
      clipboardContent = await navigator.clipboard.readText();
    } catch {
      // Clipboard read permission not granted — skip mismatch check
    }
    clipboardOnPasteRef.current = clipboardContent;
  }, []);

  function handleAddressChange(value) {
    setToAddress(value);
    setDismissed(new Set());

    if (!value.trim()) {
      setWarnings([]);
      return;
    }

    const sentAddresses = getSentAddresses();
    const w = analyseAddress(
      value.trim(),
      clipboardOnPasteRef.current,
      pastedValueRef.current,
      sentAddresses
    );
    setWarnings(w);
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate() {
    if (!toAddress.trim()) return 'Enter recipient address.';
    if (!isValidAddress(toAddress.trim())) return 'Invalid TON address.';
    if (toAddress.trim() === walletData.address) return 'Cannot send to your own address.';
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) return 'Enter a valid amount.';
    if (amt > parseFloat(balance)) return 'Insufficient balance.';
    if (amt < 0.000000001) return 'Amount too small.';
    return null;
  }

  function handleReview() {
    const err = validate();
    if (err) { setStatusMsg(err); return; }
    setStatusMsg('');

    // Re-run security analysis before showing confirm dialog
    const sentAddresses = getSentAddresses();
    const w = analyseAddress(
      toAddress.trim(),
      clipboardOnPasteRef.current,
      pastedValueRef.current,
      sentAddresses
    );
    setWarnings(w);
    setDismissed(new Set());
    setShowConfirm(true);
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function handleConfirmSend() {
    setShowConfirm(false);
    setStatus('sending');
    setStatusMsg('Broadcasting transaction…');

    try {
      const { keyPair, wallet } = rebuildWallet(walletData);
      const seqno = await sendTon({
        keyPair,
        wallet,
        toAddress: toAddress.trim(),
        amount,
        comment: comment.trim(),
      });

      setStatus('confirming');
      setStatusMsg('Waiting for network confirmation (up to 60 s)…');

      const confirmed = await waitForSeqnoIncrease(wallet, seqno, 60000);

      if (confirmed) {
        recordSentAddress(toAddress.trim());
        setStatus('success');
        setStatusMsg(`Successfully sent ${amount} TON to ${toAddress.trim().slice(0, 8)}…`);
        setToAddress('');
        setAmount('');
        setComment('');
        setWarnings([]);
        clipboardOnPasteRef.current = null;
        pastedValueRef.current = null;
        if (onSent) setTimeout(onSent, 2000);
      } else {
        setStatus('error');
        setStatusMsg(
          'Transaction broadcast but confirmation timed out. ' +
          'Check your transaction history in a minute — it may still succeed.'
        );
      }
    } catch (e) {
      setStatus('error');
      setStatusMsg(`Error: ${e.message}`);
    }
  }

  const validationError = validate();
  const activeWarnings = warnings.filter(w => !dismissed.has(w.id));
  const criticalWarnings = activeWarnings.filter(w => w.severity === 'critical');
  const hasCritical = criticalWarnings.length > 0;

  const [seg1, seg2, seg3] = segmentAddress(toAddress.trim());

  return (
    <div className="send-screen">
      <h2 className="screen-title">Send TON</h2>

      {/* ── Status messages ── */}
      {status === 'sending' && (
        <div className="warning-banner warning-banner--info">
          <span className="spinner" /> {statusMsg}
        </div>
      )}
      {status === 'confirming' && (
        <div className="warning-banner warning-banner--info">
          <span className="spinner" /> {statusMsg}
        </div>
      )}
      {status === 'success' && (
        <div className="warning-banner warning-banner--success">{statusMsg}</div>
      )}
      {status === 'error' && (
        <div className="warning-banner warning-banner--error">{statusMsg}</div>
      )}

      {status !== 'sending' && status !== 'confirming' && (
        <form
          className="send-form"
          onSubmit={e => { e.preventDefault(); handleReview(); }}
        >
          {/* Address */}
          <div className="form-group">
            <label className="field-label">Recipient address</label>
            <input
              className="form-input"
              type="text"
              placeholder="EQ… or UQ…"
              value={toAddress}
              onPaste={handleAddressPaste}
              onChange={e => handleAddressChange(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {toAddress.trim() && (
              <div className="address-preview">
                <span className="addr-highlight">{seg1}</span>
                <span className="addr-middle">{seg2}</span>
                <span className="addr-highlight">{seg3}</span>
              </div>
            )}
          </div>

          {/* Inline warnings */}
          {activeWarnings.map(w => (
            <div key={w.id} className={`warning-banner ${SEVERITY_CLASS[w.severity]}`}>
              <span>{SEVERITY_ICON[w.severity]} {w.message}</span>
              {w.severity !== 'critical' && (
                <button
                  type="button"
                  className="dismiss-btn"
                  onClick={() => setDismissed(prev => new Set([...prev, w.id]))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* Amount */}
          <div className="form-group">
            <label className="field-label">
              Amount (TON)
              <span className="balance-hint">Balance: {parseFloat(balance || 0).toFixed(4)} TON</span>
            </label>
            <input
              className="form-input"
              type="number"
              placeholder="0.0"
              min="0"
              step="any"
              value={amount}
              onChange={e => { setAmount(e.target.value); setStatusMsg(''); }}
            />
            <div className="amount-shortcuts">
              {['25%', '50%', '75%', 'Max'].map(label => {
                const pct = label === 'Max' ? 1 : parseFloat(label) / 100;
                const val = (parseFloat(balance || 0) * pct).toFixed(4);
                return (
                  <button
                    key={label}
                    type="button"
                    className="shortcut-btn"
                    onClick={() => setAmount(val)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          <div className="form-group">
            <label className="field-label">Comment (optional)</label>
            <input
              className="form-input"
              type="text"
              placeholder="Memo / note"
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={120}
            />
          </div>

          {statusMsg && status === 'idle' && (
            <div className="warning-banner warning-banner--error">{statusMsg}</div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={!!validationError}
          >
            Review & Send
          </button>
        </form>
      )}

      {/* ── Confirmation modal ── */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Confirm transaction</h3>

            <div className="confirm-row">
              <span className="confirm-label">To</span>
              <span className="confirm-value">
                <span className="addr-highlight">{seg1}</span>
                <span className="addr-middle">{seg2}</span>
                <span className="addr-highlight">{seg3}</span>
              </span>
            </div>
            <div className="confirm-row">
              <span className="confirm-label">Amount</span>
              <span className="confirm-value">{amount} TON</span>
            </div>
            {comment && (
              <div className="confirm-row">
                <span className="confirm-label">Comment</span>
                <span className="confirm-value">{comment}</span>
              </div>
            )}

            {/* Show all active warnings in confirm dialog too */}
            {activeWarnings.length > 0 && (
              <div className="confirm-warnings">
                <p className="confirm-warnings-title">Security alerts — read before confirming:</p>
                {activeWarnings.map(w => (
                  <div key={w.id} className={`warning-banner ${SEVERITY_CLASS[w.severity]}`}>
                    {SEVERITY_ICON[w.severity]} {w.message}
                  </div>
                ))}
              </div>
            )}

            {hasCritical && (
              <div className="warning-banner warning-banner--error">
                Critical security issue detected. Sending is blocked until you clear the address field and re-enter manually.
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleConfirmSend}
                disabled={hasCritical}
              >
                Confirm send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

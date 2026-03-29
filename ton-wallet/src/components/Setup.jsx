import { useState } from 'react';
import { createWallet, walletFromMnemonic, validateMnemonic } from '../utils/ton';
import { saveWallet } from '../utils/storage';

export default function Setup({ onWalletCreated }) {
  const [tab, setTab] = useState('create'); // 'create' | 'import'
  const [step, setStep] = useState(1); // for create flow: 1=generate, 2=show seed, 3=done
  const [mnemonic, setMnemonic] = useState([]);
  const [pendingWallet, setPendingWallet] = useState(null);
  const [importText, setImportText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Create flow ──────────────────────────────────────────────────────────
  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const { mnemonic: words, keyPair, address } = await createWallet();
      const walletData = {
        mnemonic: words,
        address,
        publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
        secretKey: Buffer.from(keyPair.secretKey).toString('hex'),
      };
      setMnemonic(words);
      setPendingWallet(walletData);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmSeed() {
    saveWallet(pendingWallet);
    onWalletCreated(pendingWallet);
  }

  // ── Import flow ───────────────────────────────────────────────────────────
  async function handleImport() {
    setLoading(true);
    setError('');
    try {
      const words = importText.trim().split(/\s+/);
      if (words.length !== 24) {
        throw new Error(`Expected 24 words, got ${words.length}.`);
      }
      const valid = await validateMnemonic(words);
      if (!valid) throw new Error('Invalid mnemonic phrase. Please check your seed words.');

      const { keyPair, wallet, address } = await walletFromMnemonic(words);
      const walletData = {
        mnemonic: words,
        address,
        publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
        secretKey: Buffer.from(keyPair.secretKey).toString('hex'),
      };
      saveWallet(walletData);
      onWalletCreated(walletData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="setup-container">
      <div className="setup-card">
        <div className="logo-row">
          <span className="logo">💎</span>
          <h1>TON Wallet</h1>
          <span className="testnet-badge">Testnet</span>
        </div>
        <p className="subtitle">Self-custodial wallet — your keys, your coins.</p>

        <div className="tab-bar">
          <button
            className={`tab-btn ${tab === 'create' ? 'active' : ''}`}
            onClick={() => { setTab('create'); setError(''); setStep(1); }}
          >
            Create new
          </button>
          <button
            className={`tab-btn ${tab === 'import' ? 'active' : ''}`}
            onClick={() => { setTab('import'); setError(''); }}
          >
            Import existing
          </button>
        </div>

        {/* ── Create ── */}
        {tab === 'create' && step === 1 && (
          <div className="setup-section">
            <p className="info-text">
              A new 24-word seed phrase will be generated. Write it down and store it safely —
              it is the only way to recover your wallet.
            </p>
            <button className="btn-primary" onClick={handleGenerate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate wallet'}
            </button>
          </div>
        )}

        {tab === 'create' && step === 2 && (
          <div className="setup-section">
            <div className="warning-banner warning-banner--warn">
              <strong>Write down these 24 words.</strong> Anyone with this phrase can access your
              funds. Never share it.
            </div>
            <div className="mnemonic-grid">
              {mnemonic.map((word, i) => (
                <div key={i} className="mnemonic-word">
                  <span className="word-num">{i + 1}.</span> {word}
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={handleConfirmSeed}>
              I've written it down — Continue
            </button>
          </div>
        )}

        {/* ── Import ── */}
        {tab === 'import' && (
          <div className="setup-section">
            <label className="field-label">
              Enter your 24-word seed phrase (space-separated)
            </label>
            <textarea
              className="mnemonic-input"
              rows={4}
              placeholder="word1 word2 word3 … word24"
              value={importText}
              onChange={e => { setImportText(e.target.value); setError(''); }}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
            />
            <button className="btn-primary" onClick={handleImport} disabled={loading}>
              {loading ? 'Importing…' : 'Import wallet'}
            </button>
          </div>
        )}

        {error && <div className="warning-banner warning-banner--error">{error}</div>}
      </div>
    </div>
  );
}

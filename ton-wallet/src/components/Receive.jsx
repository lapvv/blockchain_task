import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

export default function Receive({ address }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `ton://transfer/${address}`, {
      width: 200,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    }).catch(() => {});
  }, [address]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = address;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="receive-screen">
      <h2 className="screen-title">Receive TON</h2>

      <div className="qr-wrapper">
        <canvas ref={canvasRef} />
      </div>

      <p className="receive-label">Your testnet wallet address</p>

      <div className="address-display">
        <span className="addr-highlight">{address.slice(0, 8)}</span>
        <span className="addr-middle">{address.slice(8, -8)}</span>
        <span className="addr-highlight">{address.slice(-8)}</span>
      </div>

      <button className="btn-primary" onClick={handleCopy}>
        {copied ? '✓ Copied!' : 'Copy address'}
      </button>

      <p className="receive-note">
        Share this address to receive testnet TON. Use the{' '}
        <a
          href="https://t.me/testgiver_ton_bot"
          target="_blank"
          rel="noopener noreferrer"
        >
          TON Testnet Faucet
        </a>{' '}
        to get test coins.
      </p>
    </div>
  );
}

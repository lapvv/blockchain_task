import { useState, useEffect } from 'react';
import Setup from './components/Setup';
import Dashboard from './components/Dashboard';
import { loadWallet } from './utils/storage';
import './App.css';

export default function App() {
  const [wallet, setWallet] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = loadWallet();
    if (saved) setWallet(saved);
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <div className="splash">
        <span className="logo">💎</span>
      </div>
    );
  }

  return wallet
    ? <Dashboard wallet={wallet} onLogout={() => setWallet(null)} />
    : <Setup onWalletCreated={setWallet} />;
}

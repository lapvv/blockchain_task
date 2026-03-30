import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Setup from '../components/Setup.jsx';

// Mock ton utilities — avoid real crypto / network calls
vi.mock('../utils/ton.js', () => ({
  createWallet: vi.fn(),
  walletFromMnemonic: vi.fn(),
  validateMnemonic: vi.fn(),
}));

// Mock storage — we verify it separately in storage.test.js
vi.mock('../utils/storage.js', () => ({
  saveWallet: vi.fn(),
}));

import { createWallet, walletFromMnemonic, validateMnemonic } from '../utils/ton.js';
import { saveWallet } from '../utils/storage.js';

// A fake wallet returned by mocked walletFromMnemonic
const FAKE_KEYPAIR = {
  publicKey: new Uint8Array(32).fill(1),
  secretKey: new Uint8Array(64).fill(2),
};
const FAKE_WALLET = { address: { toString: () => 'EQAFakeAddress123' } };
const FAKE_ADDRESS = 'EQAFakeAddress123';

const VALID_MNEMONIC_24 =
  'abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon abandon abandon art';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── Initial render ───────────────────────────────────────────────────────────

describe('Setup — initial render', () => {
  it('shows both tabs', () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    expect(screen.getByText('Create new')).toBeInTheDocument();
    expect(screen.getByText('Import existing')).toBeInTheDocument();
  });

  it('defaults to "Create new" tab', () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    expect(screen.getByText('Generate wallet')).toBeInTheDocument();
  });

  it('shows no error message on load', () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────

describe('Setup — tab switching', () => {
  it('switches to Import tab and shows textarea', async () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));
    expect(screen.getByPlaceholderText(/word1 word2/i)).toBeInTheDocument();
    expect(screen.getByText('Import wallet')).toBeInTheDocument();
  });

  it('switching back to Create clears error', async () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));

    // Trigger an error by submitting with wrong word count
    validateMnemonic.mockResolvedValue(false);
    await userEvent.click(screen.getByText('Import wallet'));
    await waitFor(() =>
      expect(screen.getByText(/Expected 24 words/i)).toBeInTheDocument()
    );

    // Switch back — error should be gone
    await userEvent.click(screen.getByText('Create new'));
    expect(screen.queryByText(/Expected 24 words/i)).not.toBeInTheDocument();
  });
});

// ─── Import flow — validation errors ─────────────────────────────────────────

describe('Setup — import: validation errors', () => {
  it('shows error when fewer than 24 words are entered', async () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));
    await userEvent.type(
      screen.getByPlaceholderText(/word1 word2/i),
      'only three words here'
    );
    await userEvent.click(screen.getByText('Import wallet'));
    await waitFor(() =>
      expect(screen.getByText(/Expected 24 words, got 4/i)).toBeInTheDocument()
    );
    expect(validateMnemonic).not.toHaveBeenCalled();
    expect(walletFromMnemonic).not.toHaveBeenCalled();
  });

  it('shows error when mnemonic is cryptographically invalid', async () => {
    validateMnemonic.mockResolvedValue(false);

    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));
    await userEvent.type(
      screen.getByPlaceholderText(/word1 word2/i),
      VALID_MNEMONIC_24
    );
    await userEvent.click(screen.getByText('Import wallet'));

    await waitFor(() =>
      expect(screen.getByText(/Invalid mnemonic phrase/i)).toBeInTheDocument()
    );
    expect(walletFromMnemonic).not.toHaveBeenCalled();
  });

  it('shows error when walletFromMnemonic throws', async () => {
    validateMnemonic.mockResolvedValue(true);
    walletFromMnemonic.mockRejectedValue(new Error('Crypto failure'));

    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));
    await userEvent.type(
      screen.getByPlaceholderText(/word1 word2/i),
      VALID_MNEMONIC_24
    );
    await userEvent.click(screen.getByText('Import wallet'));

    await waitFor(() =>
      expect(screen.getByText(/Crypto failure/i)).toBeInTheDocument()
    );
  });

  it('button shows "Importing…" while loading', async () => {
    validateMnemonic.mockResolvedValue(true);
    // Never resolves — keeps component in loading state
    walletFromMnemonic.mockReturnValue(new Promise(() => {}));

    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));
    await userEvent.type(
      screen.getByPlaceholderText(/word1 word2/i),
      VALID_MNEMONIC_24
    );
    await userEvent.click(screen.getByText('Import wallet'));

    await waitFor(() =>
      expect(screen.getByText('Importing…')).toBeInTheDocument()
    );
    expect(screen.getByText('Importing…')).toBeDisabled();
  });
});

// ─── Import flow — happy path ─────────────────────────────────────────────────

describe('Setup — import: happy path', () => {
  beforeEach(() => {
    validateMnemonic.mockResolvedValue(true);
    walletFromMnemonic.mockResolvedValue({
      keyPair: FAKE_KEYPAIR,
      wallet: FAKE_WALLET,
      address: FAKE_ADDRESS,
    });
  });

  it('calls saveWallet with correct data', async () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));
    await userEvent.type(
      screen.getByPlaceholderText(/word1 word2/i),
      VALID_MNEMONIC_24
    );
    await userEvent.click(screen.getByText('Import wallet'));

    await waitFor(() => expect(saveWallet).toHaveBeenCalledOnce());
    const saved = saveWallet.mock.calls[0][0];
    expect(saved.address).toBe(FAKE_ADDRESS);
    expect(saved.mnemonic).toHaveLength(24);
    expect(saved.publicKey).toBeTypeOf('string'); // hex string
    expect(saved.secretKey).toBeTypeOf('string');
  });

  it('calls onWalletCreated with wallet data', async () => {
    const onWalletCreated = vi.fn();
    render(<Setup onWalletCreated={onWalletCreated} />);
    await userEvent.click(screen.getByText('Import existing'));
    await userEvent.type(
      screen.getByPlaceholderText(/word1 word2/i),
      VALID_MNEMONIC_24
    );
    await userEvent.click(screen.getByText('Import wallet'));

    await waitFor(() => expect(onWalletCreated).toHaveBeenCalledOnce());
    expect(onWalletCreated.mock.calls[0][0].address).toBe(FAKE_ADDRESS);
  });

  it('passes the correct words to walletFromMnemonic', async () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));
    await userEvent.type(
      screen.getByPlaceholderText(/word1 word2/i),
      VALID_MNEMONIC_24
    );
    await userEvent.click(screen.getByText('Import wallet'));

    await waitFor(() => expect(walletFromMnemonic).toHaveBeenCalledOnce());
    const words = walletFromMnemonic.mock.calls[0][0];
    expect(words).toHaveLength(24);
    expect(words[0]).toBe('abandon');
    expect(words[23]).toBe('art');
  });

  it('no error message shown after successful import', async () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Import existing'));
    await userEvent.type(
      screen.getByPlaceholderText(/word1 word2/i),
      VALID_MNEMONIC_24
    );
    await userEvent.click(screen.getByText('Import wallet'));

    await waitFor(() => expect(saveWallet).toHaveBeenCalled());
    expect(screen.queryByText(/Invalid/i)).not.toBeInTheDocument();
  });
});

// ─── Create flow ──────────────────────────────────────────────────────────────

describe('Setup — create: happy path', () => {
  const FAKE_MNEMONIC = Array(24).fill('word');

  beforeEach(() => {
    createWallet.mockResolvedValue({
      mnemonic: FAKE_MNEMONIC,
      keyPair: FAKE_KEYPAIR,
      address: FAKE_ADDRESS,
    });
  });

  it('shows mnemonic grid after clicking Generate wallet', async () => {
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Generate wallet'));

    await waitFor(() =>
      expect(screen.getByText(/I've written it down/i)).toBeInTheDocument()
    );
    // All 24 words are shown
    expect(screen.getAllByText('word')).toHaveLength(24);
  });

  it('calls onWalletCreated after confirming seed', async () => {
    const onWalletCreated = vi.fn();
    render(<Setup onWalletCreated={onWalletCreated} />);
    await userEvent.click(screen.getByText('Generate wallet'));
    await waitFor(() =>
      expect(screen.getByText(/I've written it down/i)).toBeInTheDocument()
    );
    await userEvent.click(screen.getByText(/I've written it down/i));

    expect(saveWallet).toHaveBeenCalledOnce();
    expect(onWalletCreated).toHaveBeenCalledOnce();
  });

  it('shows "Generating…" while loading', async () => {
    createWallet.mockReturnValue(new Promise(() => {}));
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Generate wallet'));

    await waitFor(() =>
      expect(screen.getByText('Generating…')).toBeInTheDocument()
    );
    expect(screen.getByText('Generating…')).toBeDisabled();
  });

  it('shows error when createWallet throws', async () => {
    createWallet.mockRejectedValue(new Error('RNG failure'));
    render(<Setup onWalletCreated={vi.fn()} />);
    await userEvent.click(screen.getByText('Generate wallet'));

    await waitFor(() =>
      expect(screen.getByText(/RNG failure/i)).toBeInTheDocument()
    );
  });
});

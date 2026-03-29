# TON Testnet Wallet — Implementation Summary

## Quick Start

```bash
cd ton-wallet
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

To build for production:
```bash
npm run build
```

---

## Tech Stack

- **React + Vite** — frontend framework with fast HMR
- **`@ton/ton` + `@ton/core` + `@ton/crypto`** — TON blockchain SDK
- **TONCenter testnet REST API** — balance & transaction queries
- **`qrcode`** — QR code generation
- **localStorage** — mnemonic and sent-address history (browser only, no backend)

---

## Features

### 1. Setup (Create / Import)

**Create new wallet:**
- Generates a 24-word BIP39 mnemonic phrase
- Derives a WalletContractV4 keypair from the mnemonic
- Displays the seed phrase in a grid with a bold warning: "Write down these 24 words"
- Stores mnemonic and secret key in localStorage

**Import existing wallet:**
- Validates 24-word mnemonic syntax using `@ton/crypto`
- Imports the corresponding keypair and address
- Stores in localStorage for future sessions

---

### 2. Dashboard

**Main wallet view:**
- Displays wallet address with first 8 and last 6 characters highlighted for easy visual recognition
- Shows current balance in TON (fetched from TONCenter)
- Auto-refreshes every 30 seconds with a subtle pulsing dot indicator
- Three action buttons: **Receive**, **Send**, **Refresh**

---

### 3. Receive

**Sharing funds:**
- QR code (encodes `ton://transfer/<address>`)
- Full wallet address displayed with highlighted segments
- One-click copy to clipboard
- Link to [TON Testnet Faucet](https://t.me/testgiver_ton_bot) to request test TON

---

### 4. Send

**Sending TON with address-substitution protection:**
- Address field with real-time address-security analysis
- Amount field with percentage shortcuts (25%, 50%, 75%, Max)
- Optional comment field (up to 120 characters)
- Two-step confirmation:
  1. Review & Send button validates form and shows security warnings
  2. Confirmation modal displays recipient, amount, comment, and re-surfaces all warnings
- After sending, waits up to 60 seconds for transaction confirmation via seqno polling
- Shows clear status: "Broadcasting transaction…" → "Waiting for confirmation…" → success/error

---

### 5. Transactions

**History & search:**
- Fetches up to 50 recent transactions from TONCenter
- Displays incoming (green ↓) and outgoing (red ↑) transfers
- Shows counterparty address, amount, fee, timestamp, and comment (if any)
- **Client-side search** filters by address, amount, comment, or transaction hash
- Caches transactions in localStorage to show data while network is slow

---

## Address Substitution Attack Protection

### Attack vectors covered

The wallet implements realistic protections against four common address-theft scenarios:

#### 1. **Clipboard Hijacking** (🚨 Critical)

**Scenario:** Malware running on the user's computer replaces the clipboard content after they copy an address.

**Detection:**
- On paste event, captures the clipboard content via Clipboard API
- Compares it with the value React's synthetic event inserts
- If different: **blocks the Confirm button entirely**

**User message:**
> "The address you pasted does not match the current clipboard content. This may indicate clipboard hijacking malware. Verify the address manually before sending."

---

#### 2. **Post-Paste Clipboard Swap** (🚨 Critical)

**Scenario:** Malware swaps the clipboard after the user has already pasted an address into the form.

**Detection:**
- Tracks both the pasted value and current clipboard state
- If the pasted value matches the form field but clipboard is now different: **blocks confirmation**

**User message:**
> "Your clipboard was changed after you pasted. A malicious program may have swapped the address. Double-check the address below carefully."

---

#### 3. **Near-Duplicate / Lookalike Addresses** (⚠️ Warning)

**Scenario:** Attacker generates an address that matches the first 8 and/or last 6 characters of a victim's known contact, then sends phishing messages: "Send to 0xABC…XYZ" (which is actually the attacker's address).

**Detection:**
- Calculates **Levenshtein distance** between the input address and all previously sent addresses
- Triggers warning if distance ≤ 6 (within edit distance threshold)
- Highlights the matching known address for comparison

**User message:**
> "This address closely resembles one you previously sent to (EQ123456…abcdef). Verify you have the correct recipient — attackers often generate addresses that match the first and last characters of your contacts' addresses."

---

#### 4. **New Recipient Address** (ℹ️ Info)

**Scenario:** User is sending to a new address for the first time. While not inherently risky, this requires extra vigilance.

**Detection:**
- Checks against the local "sent addresses" history
- Triggers on any address not previously sent to

**User message:**
> "You have never sent to this address before. Verify it before confirming."

---

### Warning UI/UX

- **Critical warnings** block the Confirm button — user must clear the address field and re-enter it manually
- **Other warnings** are dismissible inline (×) but reappear in the confirmation dialog
- **Visual hierarchy:**
  - 🚨 Critical = red background + red border
  - ⚠️ Warning = yellow background + yellow border
  - ℹ️ Info = cyan background + cyan border
- **Address segments highlighted:** First 8 and last 6 characters in bold for quick visual verification

---

## File Structure

```
ton-wallet/
├── src/
│   ├── components/
│   │   ├── Setup.jsx           # Create/import wallet screen
│   │   ├── Dashboard.jsx       # Main wallet view
│   │   ├── Receive.jsx         # Receive screen with QR
│   │   ├── Send.jsx            # Send screen with address security
│   │   └── TransactionList.jsx # Transaction history & search
│   ├── utils/
│   │   ├── ton.js              # TON SDK wrapper (balance, tx, send)
│   │   ├── storage.js          # localStorage helpers
│   │   └── addressSecurity.js  # Address analysis & attack detection
│   ├── App.jsx                 # Root component (Setup or Dashboard)
│   ├── App.css                 # All styles (dark theme)
│   ├── index.css               # Global reset
│   └── main.jsx                # React entry point
├── index.html                  # HTML template
├── vite.config.js              # Vite + buffer polyfill config
├── package.json
└── dist/                        # Production build (after npm run build)
```

---

## Data Storage

All data is stored **locally in the browser** using `localStorage`:

- `ton_wallet_data` — mnemonic, public key, secret key (hex-encoded)
- `ton_tx_history_<address>` — cached transaction list
- `ton_known_addresses` — history of addresses this wallet has sent to (for security analysis)

**No backend, no cloud sync.** Each browser profile has its own isolated wallet state.

---

## Network

The wallet uses **TON testnet** via:
- **Mnemonic/keys:** Derived locally using `@ton/crypto`
- **Balance queries:** `https://testnet.toncenter.com/api/v2/getAddressBalance`
- **Transaction history:** `https://testnet.toncenter.com/api/v2/getTransactions`
- **Sending:** Broadcasts via `TonClient` → TON testnet

The testnet endpoint is defined in [src/utils/ton.js](src/utils/ton.js).

---

## Security Assumptions

This is a **testnet demo**, not production-grade. Real deployments would require:

- ✗ Hardware wallet integration (Ledger, Trezor)
- ✗ Encrypted key storage (not plaintext in localStorage)
- ✗ Biometric unlock
- ✗ Rate limiting on transaction broadcasts
- ✗ Seed phrase confirmation on first setup (e.g., user re-enters random words)
- ✗ Session timeouts

For **testnet use only**, the current implementation is safe and sufficient.

---

## Browser Compatibility

- Modern browsers with ES2020+ support
- Requires Clipboard API for address-hijacking detection (fallback to `document.execCommand` for copy)
- Tested on Chrome, Firefox, Safari, Edge

---

## Future Enhancements

- Multi-wallet support (switch between multiple addresses)
- Address book / contact labels
- Token (Jetton) support beyond TON
- Staking / pooling UI
- Transaction comments synced to blockchain (via `internal()` message body)
- Backup seed phrase storage (encrypted cloud or printed QR)
- Custom testnet endpoint selector
- Detailed transaction explorer (view full message body, etc.)
- NFT wallet features (send/receive NFTs)

---

## Testing

To manually test address-security warnings:

1. **Test clipboard hijacking:**
   - Copy an address from another wallet: `EQCz2F...`
   - Paste into the recipient field
   - Immediately open clipboard manager and replace it with a different address
   - See critical warning appear

2. **Test lookalike addresses:**
   - Send a test transaction to any address
   - Try sending to a manually typed address that has the same first 8 and last 6 chars
   - See warning about near-duplicate

3. **Test new address:**
   - Send to an address you've never sent to before
   - See info warning about new recipient

---

## License

This is a demo/testnet wallet. Use at your own risk.

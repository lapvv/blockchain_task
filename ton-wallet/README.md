# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

TON Testnet Wallet — Implementation Summary
Run: cd ton-wallet && npm run dev → http://localhost:5173

Stack
React + Vite (no backend, pure browser app)
@ton/ton + @ton/core + @ton/crypto for wallet operations
TONCenter testnet REST API (testnet.toncenter.com) for balance & transactions
qrcode for QR code generation
localStorage for mnemonic/key storage and sent-address history
Features implemented
Screen	What it does
Setup → Create	Generates 24-word BIP39 mnemonic, derives WalletV4R2 keypair, shows seed phrase grid with warning
Setup → Import	Validates and imports existing 24-word mnemonic
Dashboard	Shows address (first/last chars bolded), balance in TON, auto-refreshes every 30 s
Transactions	Full history with incoming/outgoing labels, counterparty, comment, fee; client-side search by address/amount/comment/hash
Receive	QR code (ton://transfer/<addr>), address with highlighted segments, copy button, faucet link
Send	Address + amount + optional comment, percentage shortcuts, two-step confirm dialog
Address substitution protection (src/utils/addressSecurity.js)
Four attack vectors covered with realistic user scenarios:

Clipboard hijacking (critical) — reads clipboard on paste event via Clipboard API, compares with pasted value; blocks Confirm send if mismatch detected
Post-paste clipboard swap (critical) — if clipboard changes after paste, warns address may have been swapped by malware
Near-duplicate / first+last char spoofing (warning) — Levenshtein distance ≤ 6 against all previously sent addresses; warns of common "vanity address" attacks
New address (info) — warns whenever sending to an address not in local send history
Critical warnings block the Confirm button entirely. Warning/info banners are dismissible individually but reappear in the confirmation modal.
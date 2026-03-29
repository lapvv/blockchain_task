import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto';
import { WalletContractV4, fromNano, toNano, internal } from '@ton/ton';
import { Address, beginCell, external, storeMessage } from '@ton/core';

const TONCENTER_REST = 'https://testnet.toncenter.com/api/v2';

// ─── HTTP with 429 retry ──────────────────────────────────────────────────────

async function fetchWithRetry(url, options = {}, retries = 4, backoff = 3000) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      if (i < retries - 1) {
        await delay(backoff * (i + 1));
        continue;
      }
      throw new Error('TONCenter rate limit exceeded. Please wait a moment and try again.');
    }
    return res;
  }
}

// ─── Wallet creation / import ────────────────────────────────────────────────

export async function createWallet() {
  const mnemonic = await mnemonicNew(24);
  const { keyPair, wallet, address } = await walletFromMnemonic(mnemonic);
  return { mnemonic, keyPair, wallet, address };
}

export async function walletFromMnemonic(mnemonic) {
  const words = Array.isArray(mnemonic) ? mnemonic : mnemonic.trim().split(/\s+/);
  const keyPair = await mnemonicToPrivateKey(words);
  const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const address = wallet.address.toString({ testOnly: true, bounceable: false });
  return { keyPair, wallet, address };
}

export async function validateMnemonic(words) {
  try {
    return await mnemonicValidate(words);
  } catch {
    return false;
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function isValidAddress(addr) {
  try {
    Address.parse(addr);
    return true;
  } catch {
    return false;
  }
}

// ─── Balance ─────────────────────────────────────────────────────────────────

export async function getBalance(address) {
  const res = await fetchWithRetry(
    `${TONCENTER_REST}/getAddressBalance?address=${encodeURIComponent(address)}`
  );
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to get balance');
  return fromNano(BigInt(data.result));
}

// ─── Transactions ────────────────────────────────────────────────────────────

export async function getTransactions(address, limit = 50) {
  const res = await fetchWithRetry(
    `${TONCENTER_REST}/getTransactions?address=${encodeURIComponent(address)}&limit=${limit}`
  );
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to get transactions');

  return data.result.map(tx => {
    const isIncoming =
      tx.in_msg &&
      tx.in_msg.source &&
      tx.in_msg.source !== '' &&
      BigInt(tx.in_msg.value || 0) > 0n;

    const outMsgs = (tx.out_msgs || []).filter(m => m.destination && m.destination !== '');
    const isOutgoing = outMsgs.length > 0;

    let type = 'unknown';
    let counterparty = '';
    let amount = '0';

    if (isOutgoing) {
      type = 'out';
      amount = fromNano(outMsgs.reduce((s, m) => s + BigInt(m.value || 0), 0n));
      counterparty = outMsgs[0]?.destination || '';
    } else if (isIncoming) {
      type = 'in';
      amount = fromNano(BigInt(tx.in_msg.value || 0));
      counterparty = tx.in_msg.source || '';
    }

    const comment = tx.in_msg?.message || outMsgs[0]?.message || '';

    return {
      id: `${tx.transaction_id?.lt}_${tx.transaction_id?.hash}`,
      hash: tx.transaction_id?.hash || '',
      lt: tx.transaction_id?.lt || '',
      time: tx.utime * 1000,
      type,
      amount,
      counterparty,
      comment,
      fee: fromNano(BigInt(tx.fee || 0)),
    };
  });
}

// ─── Seqno via REST (bypasses TonClient / avoids its internal 429 errors) ────

async function getSeqnoRest(address) {
  // Try /getWalletInformation first — simplest, returns seqno directly
  try {
    const res = await fetchWithRetry(
      `${TONCENTER_REST}/getWalletInformation?address=${encodeURIComponent(address)}`
    );
    const data = await res.json();
    if (data.ok && typeof data.result?.seqno === 'number') {
      return data.result.seqno;
    }
  } catch {
    // fall through to runGetMethod
  }

  // Fallback: POST runGetMethod
  try {
    const res = await fetchWithRetry(`${TONCENTER_REST}/runGetMethod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, method: 'seqno', stack: [] }),
    });
    const data = await res.json();
    if (!data.ok) return 0;
    const stack = data.result?.stack;
    if (!stack || stack.length === 0) return 0;
    // stack entry is ["num", "0xHEX"] or ["num", decimalString]
    const raw = stack[0][1];
    return typeof raw === 'number' ? raw : parseInt(raw, raw.startsWith('0x') ? 16 : 10) || 0;
  } catch {
    return 0;
  }
}

// ─── Send (all network via fetchWithRetry, no TonClient) ──────────────────────

export async function sendTon({ keyPair, wallet, toAddress, amount, comment = '' }) {
  const walletAddress = wallet.address.toString({ testOnly: true, bounceable: false });
  const seqno = await getSeqnoRest(walletAddress);

  const transfer = wallet.createTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to: Address.parse(toAddress),
        value: toNano(amount),
        bounce: false,
        body: comment || undefined,
      }),
    ],
  });

  // Wrap in external message and serialize to BOC
  const externalMsg = external({ to: wallet.address, body: transfer });
  const cell = beginCell().store(storeMessage(externalMsg)).endCell();
  const boc = cell.toBoc().toString('base64');

  const res = await fetchWithRetry(`${TONCENTER_REST}/sendBoc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boc }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to broadcast transaction');

  return seqno;
}

// ─── Poll for confirmation via REST ──────────────────────────────────────────

export async function waitForSeqnoIncrease(wallet, initialSeqno, timeoutMs = 60000) {
  const walletAddress = wallet.address.toString({ testOnly: true, bounceable: false });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await delay(6000);
    try {
      const current = await getSeqnoRest(walletAddress);
      if (current > initialSeqno) return true;
    } catch {
      // keep waiting
    }
  }
  return false;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

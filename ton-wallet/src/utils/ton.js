import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto';
import { WalletContractV4, TonClient, fromNano, toNano, internal } from '@ton/ton';
import { Address } from '@ton/core';

const TESTNET_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TONCENTER_REST = 'https://testnet.toncenter.com/api/v2';

export const client = new TonClient({ endpoint: TESTNET_ENDPOINT });

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
  const res = await fetch(
    `${TONCENTER_REST}/getAddressBalance?address=${encodeURIComponent(address)}`
  );
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to get balance');
  return fromNano(BigInt(data.result));
}

// ─── Transactions ────────────────────────────────────────────────────────────

export async function getTransactions(address, limit = 50) {
  const res = await fetch(
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

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendTon({ keyPair, wallet, toAddress, amount, comment = '' }) {
  const contract = client.open(wallet);

  // Ensure wallet is deployed; if not yet, first send deploys it
  let seqno = 0;
  try {
    seqno = await contract.getSeqno();
  } catch {
    seqno = 0;
  }

  const parsedTo = Address.parse(toAddress);

  await contract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to: parsedTo,
        value: toNano(amount),
        bounce: false,
        body: comment || undefined,
      }),
    ],
  });

  return seqno;
}

// ─── Poll for confirmation ────────────────────────────────────────────────────

export async function waitForSeqnoIncrease(wallet, initialSeqno, timeoutMs = 60000) {
  const contract = client.open(wallet);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await delay(3000);
    try {
      const current = await contract.getSeqno();
      if (current > initialSeqno) return true;
    } catch {
      // wallet not yet deployed — keep waiting
    }
  }
  return false;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

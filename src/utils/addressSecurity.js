/**
 * Address substitution attack protection.
 *
 * Realistic attack vectors:
 * 1. Clipboard hijacking – malware replaces clipboard content after user copies an address
 * 2. Lookalike / near-duplicate addresses – attacker generates an address sharing first/last N chars
 * 3. First-time send to unknown address – user may have copy-pasted from a tampered source
 */

// Levenshtein distance — used to detect near-duplicate addresses
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Normalise address for comparison (strip whitespace, lowercase)
function norm(addr) {
  return addr.trim().toLowerCase();
}

/**
 * Analyses a recipient address and returns an array of warning objects.
 *
 * @param {string} address          – address typed/pasted by the user
 * @param {string|null} clipboardValue – current clipboard content (read on paste event)
 * @param {string|null} pastedValue    – value that the paste event inserted
 * @param {Array} sentAddresses        – previously-used addresses from storage
 * @returns {Array<{id, severity, message}>}  severity: 'critical' | 'warning' | 'info'
 */
export function analyseAddress(address, clipboardValue, pastedValue, sentAddresses = []) {
  const warnings = [];
  if (!address) return warnings;

  const normAddr = norm(address);

  // 1. Clipboard mismatch – strongest signal of clipboard hijacking
  if (
    clipboardValue !== null &&
    pastedValue !== null &&
    norm(clipboardValue) !== norm(pastedValue)
  ) {
    warnings.push({
      id: 'clipboard_mismatch',
      severity: 'critical',
      message:
        'The address you pasted does not match the current clipboard content. ' +
        'This may indicate clipboard hijacking malware. Verify the address manually before sending.',
    });
  }

  // 2. Address was pasted but clipboard is now different (post-paste replacement)
  if (
    clipboardValue !== null &&
    pastedValue !== null &&
    norm(pastedValue) === normAddr &&
    norm(clipboardValue) !== normAddr
  ) {
    warnings.push({
      id: 'clipboard_replaced',
      severity: 'critical',
      message:
        'Your clipboard was changed after you pasted. ' +
        'A malicious program may have swapped the address. Double-check the address below carefully.',
    });
  }

  // 3. Near-duplicate of a previously used address (first/last char spoofing)
  // Compare case-sensitively — TON addresses are base64 and case matters visually.
  // Lowercasing before diff would hide substitutions like 'X'→'x' (distance=0 after norm).
  const SIMILARITY_THRESHOLD = 6; // edit distance
  for (const known of sentAddresses) {
    const dist = levenshtein(address.trim(), known.address);
    if (dist > 0 && dist <= SIMILARITY_THRESHOLD) {
      warnings.push({
        id: `similar_to_${known.address.slice(0, 8)}`,
        severity: 'warning',
        message:
          `This address closely resembles one you previously sent to ` +
          `(${known.address.slice(0, 8)}…${known.address.slice(-6)}). ` +
          `Verify you have the correct recipient — attackers often generate addresses ` +
          `that match the first and last characters of your contacts' addresses.`,
      });
      break; // one similarity warning is enough
    }
  }

  // 4. Exact first-4 and last-4 character match with a known address (but different overall)
  // Case-sensitive: 'EQAb' vs 'EQab' are visually different and must trigger a warning.
  for (const known of sentAddresses) {
    if (known.address === address) break; // exact match, no warning needed
    const prefix = 4;
    const suffix = 4;
    if (
      address.length >= prefix + suffix &&
      known.address.length >= prefix + suffix &&
      address.slice(0, prefix) === known.address.slice(0, prefix) &&
      address.slice(-suffix) === known.address.slice(-suffix) &&
      address.trim() !== known.address
    ) {
      warnings.push({
        id: `prefix_suffix_match_${known.address.slice(0, 8)}`,
        severity: 'warning',
        message:
          `This address has the same start and end as a previously used address ` +
          `(${known.address.slice(0, 8)}…${known.address.slice(-6)}) but is different. ` +
          `This is a common address-spoofing technique. Check all characters carefully.`,
      });
      break;
    }
  }

  // 5. New address — informational
  const isKnown = sentAddresses.some(a => norm(a.address) === normAddr);
  if (!isKnown) {
    warnings.push({
      id: 'new_address',
      severity: 'info',
      message: 'You have never sent to this address before. Verify it before confirming.',
    });
  }

  return warnings;
}

/**
 * Returns a segmented address for highlighted display:
 * [prefix(8), middle, suffix(8)]
 */
export function segmentAddress(address) {
  if (!address || address.length <= 16) return [address, '', ''];
  return [address.slice(0, 8), address.slice(8, -8), address.slice(-8)];
}

import { describe, it, expect } from 'vitest';
import { analyseAddress, segmentAddress } from '../utils/addressSecurity.js';

// Realistic-looking TON addresses for tests
const ADDR_A = 'EQAbc1234567890xyzABC1234567890xyzABCDEFGHIJK12';
const ADDR_B = 'EQAbc1234567890xyzABC1234567890xyzABCDEFGHIJK99'; // differs only at end
const ADDR_C = 'UQzzzWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW99'; // completely different

// ─── segmentAddress ───────────────────────────────────────────────────────────

describe('segmentAddress', () => {
  it('splits a normal address into [prefix(8), middle, suffix(8)]', () => {
    const addr = 'EQAbc123MIDDLE_PARTXYZ_END_12';
    // length = 30, prefix = first 8, suffix = last 8, middle = chars 8..-8
    const [prefix, middle, suffix] = segmentAddress(addr);
    expect(prefix).toBe(addr.slice(0, 8));
    expect(middle).toBe(addr.slice(8, -8));
    expect(suffix).toBe(addr.slice(-8));
  });

  it('returns [address, "", ""] for a short address (≤16 chars)', () => {
    expect(segmentAddress('ABCDEFGHIJ')).toEqual(['ABCDEFGHIJ', '', '']);
    expect(segmentAddress('1234567890123456')).toEqual(['1234567890123456', '', '']);
  });

  it('handles empty string', () => {
    expect(segmentAddress('')).toEqual(['', '', '']);
  });

  it('handles null / undefined gracefully', () => {
    expect(segmentAddress(null)).toEqual([null, '', '']);
    expect(segmentAddress(undefined)).toEqual([undefined, '', '']);
  });
});

// ─── analyseAddress — no warnings expected ───────────────────────────────────

describe('analyseAddress — no warnings', () => {
  it('returns empty array for empty address', () => {
    expect(analyseAddress('', null, null, [])).toEqual([]);
  });

  it('known address with no clipboard info → no critical warnings, no new_address', () => {
    const sentAddresses = [{ address: ADDR_A }];
    const warnings = analyseAddress(ADDR_A, null, null, sentAddresses);
    expect(warnings.find(w => w.id === 'new_address')).toBeUndefined();
    expect(warnings.find(w => w.severity === 'critical')).toBeUndefined();
  });

  it('clipboard matches pasted value → no clipboard warning', () => {
    const warnings = analyseAddress(ADDR_A, ADDR_A, ADDR_A, []);
    const ids = warnings.map(w => w.id);
    expect(ids).not.toContain('clipboard_mismatch');
    expect(ids).not.toContain('clipboard_replaced');
  });
});

// ─── analyseAddress — new_address ────────────────────────────────────────────

describe('analyseAddress — new_address', () => {
  it('flags unseen address as info', () => {
    const warnings = analyseAddress(ADDR_A, null, null, []);
    const w = warnings.find(w => w.id === 'new_address');
    expect(w).toBeDefined();
    expect(w.severity).toBe('info');
  });

  it('does NOT flag address already in sentAddresses', () => {
    const warnings = analyseAddress(ADDR_A, null, null, [{ address: ADDR_A }]);
    expect(warnings.find(w => w.id === 'new_address')).toBeUndefined();
  });

  it('comparison is case-insensitive', () => {
    const warnings = analyseAddress(
      ADDR_A.toUpperCase(),
      null,
      null,
      [{ address: ADDR_A.toLowerCase() }]
    );
    expect(warnings.find(w => w.id === 'new_address')).toBeUndefined();
  });

  it('trims whitespace before comparison', () => {
    const warnings = analyseAddress(`  ${ADDR_A}  `, null, null, [{ address: ADDR_A }]);
    expect(warnings.find(w => w.id === 'new_address')).toBeUndefined();
  });
});

// ─── analyseAddress — clipboard_mismatch ─────────────────────────────────────

describe('analyseAddress — clipboard_mismatch', () => {
  it('flags critical when clipboardValue ≠ pastedValue', () => {
    const warnings = analyseAddress(ADDR_B, ADDR_C, ADDR_A, []);
    const w = warnings.find(w => w.id === 'clipboard_mismatch');
    expect(w).toBeDefined();
    expect(w.severity).toBe('critical');
  });

  it('no mismatch when clipboard === pasted', () => {
    const warnings = analyseAddress(ADDR_A, ADDR_A, ADDR_A, []);
    expect(warnings.find(w => w.id === 'clipboard_mismatch')).toBeUndefined();
  });

  it('no mismatch when both clipboard and pasted are null', () => {
    const warnings = analyseAddress(ADDR_A, null, null, []);
    expect(warnings.find(w => w.id === 'clipboard_mismatch')).toBeUndefined();
  });

  it('comparison is case-insensitive', () => {
    const warnings = analyseAddress(
      ADDR_A,
      ADDR_A.toLowerCase(),
      ADDR_A.toUpperCase(),
      []
    );
    expect(warnings.find(w => w.id === 'clipboard_mismatch')).toBeUndefined();
  });
});

// ─── analyseAddress — clipboard_replaced ─────────────────────────────────────

describe('analyseAddress — clipboard_replaced', () => {
  it('flags critical when pasted matches address but clipboard does not', () => {
    // User pasted ADDR_A (pastedValue = ADDR_A), but clipboard is now ADDR_C
    const warnings = analyseAddress(ADDR_A, ADDR_C, ADDR_A, []);
    const w = warnings.find(w => w.id === 'clipboard_replaced');
    expect(w).toBeDefined();
    expect(w.severity).toBe('critical');
  });

  it('no replaced warning when clipboard matches pasted', () => {
    const warnings = analyseAddress(ADDR_A, ADDR_A, ADDR_A, []);
    expect(warnings.find(w => w.id === 'clipboard_replaced')).toBeUndefined();
  });
});

// ─── analyseAddress — similar address (Levenshtein) ──────────────────────────

describe('analyseAddress — similar_to (Levenshtein)', () => {
  it('warns when address is within 6 edits of a known address', () => {
    // ADDR_B differs from ADDR_A only in the last 2 chars → distance = 2
    const warnings = analyseAddress(ADDR_B, null, null, [{ address: ADDR_A }]);
    const w = warnings.find(w => w.id.startsWith('similar_to_'));
    expect(w).toBeDefined();
    expect(w.severity).toBe('warning');
  });

  it('does not warn for identical address (dist = 0)', () => {
    const warnings = analyseAddress(ADDR_A, null, null, [{ address: ADDR_A }]);
    expect(warnings.find(w => w.id.startsWith('similar_to_'))).toBeUndefined();
  });

  it('does not warn for completely different address (dist > 6)', () => {
    const warnings = analyseAddress(ADDR_C, null, null, [{ address: ADDR_A }]);
    expect(warnings.find(w => w.id.startsWith('similar_to_'))).toBeUndefined();
  });

  it('only produces one similarity warning even with multiple close known addresses', () => {
    const sentAddresses = [{ address: ADDR_A }, { address: ADDR_B }];
    // Use an address close to ADDR_A
    const closeAddr = ADDR_A.slice(0, -3) + 'XXX';
    const warnings = analyseAddress(closeAddr, null, null, sentAddresses);
    const similarWarnings = warnings.filter(w => w.id.startsWith('similar_to_'));
    expect(similarWarnings.length).toBeLessThanOrEqual(1);
  });
});

// ─── analyseAddress — prefix/suffix match ────────────────────────────────────

describe('analyseAddress — prefix_suffix_match', () => {
  // Build two addresses sharing first 4 and last 4 chars but different in the middle
  const base =   'EQAbXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX1234';
  const spoof =  'EQAbYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY1234';

  it('warns when address shares first+last 4 chars with a known address', () => {
    const warnings = analyseAddress(spoof, null, null, [{ address: base }]);
    const w = warnings.find(w => w.id.startsWith('prefix_suffix_match_'));
    expect(w).toBeDefined();
    expect(w.severity).toBe('warning');
  });

  it('no warning for exact match', () => {
    const warnings = analyseAddress(base, null, null, [{ address: base }]);
    expect(warnings.find(w => w.id.startsWith('prefix_suffix_match_'))).toBeUndefined();
  });

  it('no warning when prefix differs', () => {
    const different = 'ZZZbXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX1234';
    const warnings = analyseAddress(different, null, null, [{ address: base }]);
    expect(warnings.find(w => w.id.startsWith('prefix_suffix_match_'))).toBeUndefined();
  });
});

// ─── analyseAddress — multiple warnings can coexist ──────────────────────────

describe('analyseAddress — combined scenarios', () => {
  it('can return both clipboard_mismatch and new_address', () => {
    const warnings = analyseAddress(ADDR_A, ADDR_C, ADDR_B, []);
    const ids = warnings.map(w => w.id);
    expect(ids).toContain('clipboard_mismatch');
    expect(ids).toContain('new_address');
  });

  it('returns only new_address for a clean paste to an unseen address', () => {
    const warnings = analyseAddress(ADDR_A, ADDR_A, ADDR_A, []);
    expect(warnings.length).toBe(1);
    expect(warnings[0].id).toBe('new_address');
  });
});

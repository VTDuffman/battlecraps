// =============================================================================
// BATTLECRAPS — SERVER-SIDE RNG
// apps/api/src/lib/rng.ts
//
// Generates cryptographically random dice rolls using Node.js Web Crypto API.
// This is the ONLY place dice values are created. Never generate dice client-side.
//
// The function signature matches RollDiceFn from @battlecraps/shared so it can
// be injected directly into resolveRoll() and resolveCascade().
// =============================================================================

import { webcrypto } from 'node:crypto';

/**
 * Rolls two independent d6 using `crypto.getRandomValues()`.
 *
 * Implementation: Rejection-sampling over a Uint8Array.
 * We request 2 bytes at a time and reject values >= 252 to avoid modulo bias
 * (252 is the largest multiple of 6 that fits in a byte: 252 / 6 = 42).
 * Values 252–255 are discarded and re-drawn.
 *
 * Expected draws before acceptance: 2 bytes × (4/256 rejection rate) ≈ negligible.
 *
 * @returns [d1, d2] — each value in range [1, 6], uniformly distributed.
 */
export function rollDice(): [number, number] {
  return [drawD6(), drawD6()];
}

function drawD6(): number {
  const buf = new Uint8Array(1);
  while (true) {
    webcrypto.getRandomValues(buf);
    const byte = buf[0];
    // buf[0] is always defined — Uint8Array[0] is valid for a 1-element array.
    if (byte === undefined) continue; // unreachable, satisfies noUncheckedIndexedAccess
    if (byte < 252) {
      return (byte % 6) + 1;
    }
    // byte in [252, 255]: discard and re-draw to avoid modulo bias
  }
}

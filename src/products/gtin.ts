/**
 * GTIN handling (GS1 General Specifications, section 7.9).
 *
 * Barcodes come in several lengths — GTIN-8 (EAN-8), GTIN-12 (UPC-A),
 * GTIN-13 (EAN-13) and GTIN-14 — but they all name the same number space.
 * We always store and look up the 14-digit form, left-padded with zeros, so
 * a scanner reading `0614141000418` finds the product stored as
 * `00614141000418`.
 */

const VALID_LENGTHS = new Set([8, 12, 13, 14]);

export type GtinResult =
  { ok: true; gtin: string } | { ok: false; reason: string };

/** GS1 mod-10 check digit for the digits before the check digit. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  // Weights alternate 3,1,3,1… starting from the rightmost body digit.
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Validates any supported GTIN length and returns its 14-digit form. */
export function normalizeGtin(raw: string): GtinResult {
  const value = raw.trim();

  if (!/^\d+$/.test(value)) {
    return { ok: false, reason: 'A GTIN may contain digits only' };
  }
  if (!VALID_LENGTHS.has(value.length)) {
    return {
      ok: false,
      reason: 'A GTIN must be 8, 12, 13 or 14 digits long',
    };
  }

  const gtin = value.padStart(14, '0');
  const expected = gtinCheckDigit(gtin.slice(0, 13));
  if (expected !== Number(gtin[13])) {
    return {
      ok: false,
      reason: `Invalid check digit (expected ${expected})`,
    };
  }

  return { ok: true, gtin };
}

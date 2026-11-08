import { gtinCheckDigit, normalizeGtin } from './gtin';

describe('normalizeGtin', () => {
  it('pads a valid EAN-13 to 14 digits', () => {
    expect(normalizeGtin('0614141000418')).toEqual({
      ok: true,
      gtin: '00614141000418',
    });
  });

  it('accepts an already 14-digit GTIN unchanged', () => {
    expect(normalizeGtin('00614141000418')).toEqual({
      ok: true,
      gtin: '00614141000418',
    });
  });

  it('accepts UPC-A (12 digits) and EAN-8', () => {
    expect(normalizeGtin('614141000418')).toEqual({
      ok: true,
      gtin: '00614141000418',
    });
    expect(normalizeGtin('96385074')).toEqual({
      ok: true,
      gtin: '00000096385074',
    });
  });

  it('trims surrounding whitespace from scanner input', () => {
    expect(normalizeGtin(' 0614141000418\n')).toMatchObject({ ok: true });
  });

  it('rejects a wrong check digit and says which digit was expected', () => {
    expect(normalizeGtin('0614141000419')).toEqual({
      ok: false,
      reason: 'Invalid check digit (expected 8)',
    });
  });

  it('rejects non-digits and unsupported lengths', () => {
    expect(normalizeGtin('ABC123')).toMatchObject({ ok: false });
    expect(normalizeGtin('12345')).toMatchObject({ ok: false });
    expect(normalizeGtin('123456789012345')).toMatchObject({ ok: false });
    expect(normalizeGtin('')).toMatchObject({ ok: false });
  });
});

describe('gtinCheckDigit', () => {
  it('computes the GS1 mod-10 check digit', () => {
    expect(gtinCheckDigit('0061414100041')).toBe(8);
    expect(gtinCheckDigit('400638133393')).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  extractOrderIdFromR2ScopedKey,
  validateR2ScopedKey,
} from '../../supabase/functions/_shared/r2-key-scope';

describe('r2 key scope validation', () => {
  it('rejects keys with traversal or malformed paths', () => {
    expect(validateR2ScopedKey('os_orders/../../secret')).toEqual(
      expect.objectContaining({ ok: false })
    );
    expect(validateR2ScopedKey('os_orders//file.pdf')).toEqual(
      expect.objectContaining({ ok: false })
    );
  });

  it('rejects key without uuid second segment', () => {
    expect(validateR2ScopedKey('os_orders/not-uuid/job/file.pdf')).toEqual(
      expect.objectContaining({ ok: false })
    );
  });

  it('accepts valid scoped key and extracts order id', () => {
    const key = 'os_orders/11111111-1111-4111-8111-111111111111/job-1/file.pdf';
    const validation = validateR2ScopedKey(key);
    expect(validation).toEqual(expect.objectContaining({ ok: true }));
    expect(extractOrderIdFromR2ScopedKey(key)).toBe('11111111-1111-4111-8111-111111111111');
  });
});

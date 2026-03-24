import { describe, expect, it } from 'vitest';
import { buildAuthorizationSnapshot } from '@/lib/authz';

describe('buildAuthorizationSnapshot', () => {
  it('nunca promove admin por heurística de e-mail', () => {
    const snapshot = buildAuthorizationSnapshot('consultor_vendas');
    expect(snapshot.isAdmin).toBe(false);
  });

  it('concede admin apenas para papel gerente/admin normalizado', () => {
    expect(buildAuthorizationSnapshot('gerente').isAdmin).toBe(true);
    expect(buildAuthorizationSnapshot('admin').isAdmin).toBe(true);
    expect(buildAuthorizationSnapshot('instalador').isAdmin).toBe(false);
  });
});

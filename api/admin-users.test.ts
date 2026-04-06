import { describe, expect, it } from 'vitest';

describe('api/admin-users module', () => {
  it('carrega o handler sem erro de resolução de módulos compartilhados', async () => {
    const module = await import('./admin-users.ts');
    expect(typeof module.default).toBe('function');
  });
});

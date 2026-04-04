import { describe, expect, it } from 'vitest';
import { findForbiddenConsultorFields, toConsultorUpdatePayload } from './consultorUpdate';

describe('consultor update payload', () => {
  it('mantém apenas campos da whitelist', () => {
    const payload = toConsultorUpdatePayload({
      sale_number: '123',
      client_name: 'Cliente',
      archived: true,
    } as any);

    expect(payload).toEqual({
      sale_number: '123',
      client_name: 'Cliente',
    });
  });

  it('detecta campos proibidos', () => {
    const forbidden = findForbiddenConsultorFields({
      sale_number: '123',
      archived: true,
      archived_at: '2026-04-04T00:00:00.000Z',
    } as any);

    expect(forbidden).toEqual(['archived', 'archived_at']);
  });
});

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

  it('descarta updated_at e updated_by do payload sanitizado', () => {
    const payload = toConsultorUpdatePayload({
      sale_number: '123',
      updated_at: '2026-04-04T00:00:00.000Z',
      updated_by: '4da78dfd-f772-4ccd-a5b3-b7ef6f08ad0f',
    } as any);

    expect(payload).toEqual({ sale_number: '123' });
    expect(payload).not.toHaveProperty('updated_at');
    expect(payload).not.toHaveProperty('updated_by');
  });

  it('detecta campos proibidos incluindo metadados de auditoria', () => {
    const forbidden = findForbiddenConsultorFields({
      sale_number: '123',
      archived: true,
      updated_at: '2026-04-04T00:00:00.000Z',
      updated_by: '4da78dfd-f772-4ccd-a5b3-b7ef6f08ad0f',
    } as any);

    expect(forbidden).toEqual(['archived', 'updated_at', 'updated_by']);
  });

  it('aceita payload vazio e payload parcial', () => {
    expect(toConsultorUpdatePayload({})).toEqual({});
    expect(toConsultorUpdatePayload({ production_tag: 'AGUARDANDO_INSUMOS' } as any)).toEqual({
      production_tag: 'AGUARDANDO_INSUMOS',
    });
  });
});

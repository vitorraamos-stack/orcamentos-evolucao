import { describe, expect, it } from 'vitest';
import { validateMaterialPayload } from '@/features/materials/materialPayload';

describe('validateMaterialPayload', () => {
  const base = {
    name: 'Lona',
    tipo_calculo: 'm2' as const,
    min_price: 0,
    tiers: [{ min_area: 0, max_area: 1, price_per_m2: 10 }],
  };

  it('aceita payload válido', () => {
    expect(() => validateMaterialPayload(base)).not.toThrow();
  });

  it('rejeita faixas sobrepostas', () => {
    expect(() =>
      validateMaterialPayload({
        ...base,
        tiers: [
          { min_area: 0, max_area: 2, price_per_m2: 10 },
          { min_area: 1, max_area: 3, price_per_m2: 9 },
        ],
      })
    ).toThrow(/sobrepostas/);
  });

  it('rejeita preço negativo', () => {
    expect(() =>
      validateMaterialPayload({
        ...base,
        tiers: [{ min_area: 0, max_area: 1, price_per_m2: -1 }],
      })
    ).toThrow(/não pode ser negativo/);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    storage: {
      from: () => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/img.png' } })),
      }),
    },
  },
}));

import { upsertMaterialTransactional } from '@/features/materials/api';

describe('upsertMaterialTransactional', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('chama RPC transacional para persistência de material + tiers', async () => {
    rpcMock.mockResolvedValue({ data: 'mat-1', error: null });

    const result = await upsertMaterialTransactional({
      name: 'Lona',
      tipo_calculo: 'm2',
      min_price: 10,
      image_url: 'https://example.com/a.png',
      tiers: [{ min_area: 0, max_area: 1, price_per_m2: 12 }],
    });

    expect(result).toBe('mat-1');
    expect(rpcMock).toHaveBeenCalledWith('upsert_material_with_tiers', expect.objectContaining({
      p_name: 'Lona',
      p_tiers: [{ min_area: 0, max_area: 1, price_per_m2: 12 }],
    }));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const builders: Array<(table: string) => any> = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const builder = builders.shift();
      if (!builder) {
        throw new Error(`No mock configured for table ${table}`);
      }
      return builder(table);
    },
  },
}));

import { lookupOrderForKiosk } from '@/modules/hub-os/orderRepository';

const response = (data: any, error: any = null) => Promise.resolve({ data, error });

describe('lookupOrderForKiosk', () => {
  beforeEach(() => {
    builders.length = 0;
  });

  it('prioriza os_orders e só usa legado como fallback', async () => {
    builders.push(() => ({
      select: () => ({
        eq: () => ({ limit: () => ({ maybeSingle: () => response({ id: 'order-1' }) }) }),
      }),
    }));

    const result = await lookupOrderForKiosk('123');
    expect(result).toEqual({ id: 'order-1', source: 'os_orders' });
    expect(builders.length).toBe(0);
  });

  it('usa tabela os quando canônico não encontra', async () => {
    builders.push(() => ({
      select: () => ({
        eq: () => ({ limit: () => ({ maybeSingle: () => response(null, { code: 'PGRST116' }) }) }),
      }),
    }));
    builders.push(() => ({
      select: () => ({
        or: () => ({ limit: () => response([], null) }),
      }),
    }));
    builders.push(() => ({
      select: () => ({
        eq: () => ({ limit: () => ({ maybeSingle: () => response({ id: 'legacy-1' }) }) }),
      }),
    }));

    const result = await lookupOrderForKiosk('123');
    expect(result).toEqual({ id: 'legacy-1', source: 'os' });
  });
});

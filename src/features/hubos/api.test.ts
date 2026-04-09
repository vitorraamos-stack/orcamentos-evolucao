import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc,
    from,
    auth: {
      getUser,
    },
  },
}));

describe('src/features/hubos/api secure mutation contracts', () => {
  beforeEach(() => {
    rpc.mockReset();
    getUser.mockReset();
    from.mockReset();
  });

  it('archiveOrder usa contrato server-side', async () => {
    const { archiveOrder } = await import('./api');
    rpc.mockResolvedValueOnce({ data: { id: 'os-1', archived: true }, error: null });

    await archiveOrder('os-1', 'Gerente');

    expect(rpc).toHaveBeenCalledWith('hub_os_archive_order_secure', {
      p_os_id: 'os-1',
      p_reason: 'manual_archive',
      p_payload: { actor_name: 'Gerente' },
    });
  });

  it('updateOrder manager usa RPC atômica com evento embutido', async () => {
    const { updateOrder } = await import('./api');

    getUser.mockResolvedValueOnce({ data: { user: { id: 'u-1' } }, error: null });
    from.mockImplementation((table: string) => {
      if (table !== 'profiles') throw new Error('unexpected table');
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { role: 'gerente' }, error: null }),
          }),
        }),
      };
    });

    rpc.mockResolvedValueOnce({ data: { id: 'os-2' }, error: null });

    await updateOrder(
      'os-2',
      { prod_status: 'Produção' } as any,
      { type: 'status_change', payload: { board: 'producao' } }
    );

    expect(rpc).toHaveBeenCalledWith('hub_os_update_order_secure', {
      p_os_id: 'os-2',
      p_patch: { prod_status: 'Produção' },
      p_event_type: 'status_change',
      p_event_payload: { board: 'producao' },
    });
  });
});

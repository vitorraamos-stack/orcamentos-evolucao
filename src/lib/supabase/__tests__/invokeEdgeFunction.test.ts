import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHeaders, invokeEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';

const createSupabaseStub = () => {
  return {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  };
};

describe('invokeEdgeFunction', () => {
  const originalEnv = process.env.VITE_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.VITE_SUPABASE_ANON_KEY = 'header.payload.signature';
  });

  afterEach(() => {
    process.env.VITE_SUPABASE_ANON_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('fails when anon key is missing', () => {
    process.env.VITE_SUPABASE_ANON_KEY = '';
    expect(() => buildHeaders('token')).toThrow('VITE_SUPABASE_ANON_KEY ausente');
  });

  it('retries once on 401 after refresh', async () => {
    const supabase = createSupabaseStub();
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'token-1' } },
      error: null,
    });
    supabase.auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'token-2' } },
      error: null,
    });

    const errorResponse = new Response(JSON.stringify({ error: 'Invalid JWT' }), { status: 401 });
    supabase.functions.invoke
      .mockResolvedValueOnce({ data: null, error: { context: errorResponse } })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    const result = await invokeEdgeFunction<{ ok: boolean }>(supabase as any, 'r2-health', {});

    expect(result.ok).toBe(true);
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
  });
});

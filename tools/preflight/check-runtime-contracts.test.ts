import { describe, expect, it } from 'vitest';
import { parseArgs, REQUIRED_CONTRACTS, runRuntimeContractsCheck } from './check-runtime-contracts.mjs';

describe('check-runtime-contracts args', () => {
  it('parseia --strict', () => {
    expect(parseArgs(['--strict'])).toEqual({ strict: true });
    expect(parseArgs([])).toEqual({ strict: false });
  });

  it('mantém o catálogo mínimo de contratos obrigatórios', () => {
    expect(REQUIRED_CONTRACTS.rpc).toContain('hub_os_update_order_secure');
    expect(REQUIRED_CONTRACTS.tables).toContain('os_orders_event');
  });
});

describe('check-runtime-contracts execution', () => {
  it('retorna sucesso em modo não estrito sem credenciais', async () => {
    const code = await runRuntimeContractsCheck([], {} as NodeJS.ProcessEnv);
    expect(code).toBe(0);
  });

  it('falha em modo estrito sem credenciais', async () => {
    const code = await runRuntimeContractsCheck(['--strict'], {} as NodeJS.ProcessEnv);
    expect(code).toBe(1);
  });
});

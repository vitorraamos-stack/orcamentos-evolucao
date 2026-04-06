import { describe, expect, it } from 'vitest';
import { contexts, parseArgs, runPreflight } from './check-production-readiness.mjs';

describe('preflight arg parser', () => {
  it('seleciona todos os contextos quando nenhum é informado', () => {
    const parsed = parseArgs(['--check']);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.selectedContexts).toEqual(Object.keys(contexts));
  });

  it('aceita múltiplos --context sem duplicidade', () => {
    const parsed = parseArgs(['--context', 'vercelApi', '--context=supabaseEdgeFunctions', '--context', 'vercelApi']);
    expect(parsed.selectedContexts).toEqual(['vercelApi', 'supabaseEdgeFunctions']);
  });

  it('falha para contexto inválido com erro amigável', () => {
    expect(() => parseArgs(['--context', 'invalidContext'])).toThrow(/Contexto inválido/);
  });
});

describe('preflight execution', () => {
  it('falha quando contexto selecionado não tem variáveis necessárias', () => {
    const result = runPreflight(['--context', 'vercelApi'], {} as NodeJS.ProcessEnv);
    expect(result).toBe(1);
  });

  it('passa quando contexto selecionado está completo', () => {
    const result = runPreflight(['--context', 'vercelApi'], {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      ORS_API_KEY: 'ors-key',
    } as NodeJS.ProcessEnv);

    expect(result).toBe(0);
  });
});

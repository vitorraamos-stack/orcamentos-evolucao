#!/usr/bin/env node

export const contexts = {
  viteFrontend: {
    label: 'Frontend (Vite)',
    required: [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'VITE_OS_FOLDER_BASE',
    ],
  },
  vercelApi: {
    label: 'Vercel API',
    required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ORS_API_KEY'],
  },
  supabaseEdgeFunctions: {
    label: 'Supabase Edge Functions',
    required: [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ],
  },
  windowsSmbAgent: {
    label: 'Agente Windows/SMB',
    required: [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OS_ASSET_BUCKET',
      'SMB_BASE',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ],
  },
};

const formatAllowedContexts = () => Object.keys(contexts).join(', ');

export const parseArgs = (argv) => {
  const selectedContexts = [];
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run' || arg === '--check') {
      dryRun = true;
      continue;
    }

    if (arg === '--context') {
      const contextName = argv[index + 1];
      if (!contextName) {
        throw new Error(`Parâmetro --context requer um valor. Contextos válidos: ${formatAllowedContexts()}.`);
      }
      if (!(contextName in contexts)) {
        throw new Error(`Contexto inválido: ${contextName}. Contextos válidos: ${formatAllowedContexts()}.`);
      }
      selectedContexts.push(contextName);
      index += 1;
      continue;
    }

    if (arg.startsWith('--context=')) {
      const contextName = arg.split('=')[1] || '';
      if (!(contextName in contexts)) {
        throw new Error(`Contexto inválido: ${contextName || '<vazio>'}. Contextos válidos: ${formatAllowedContexts()}.`);
      }
      selectedContexts.push(contextName);
      continue;
    }

    throw new Error(
      `Argumento inválido: ${arg}. Use --check/--dry-run e --context <nome>. Contextos válidos: ${formatAllowedContexts()}.`
    );
  }

  return {
    dryRun,
    selectedContexts: selectedContexts.length > 0 ? Array.from(new Set(selectedContexts)) : Object.keys(contexts),
  };
};

export const checkContext = ({ label, required }, env = process.env) => {
  const missing = required.filter((name) => !env[name]);
  const ok = missing.length === 0;

  console.log(`\n[${ok ? 'OK' : 'FAIL'}] ${label}`);
  console.log(`- required vars: ${required.length}`);
  console.log(`- available: ${required.length - missing.length}`);
  if (!ok) {
    console.log(`- missing: ${missing.join(', ')}`);
  }

  return { ok, missing };
};

export const runPreflight = (argv = process.argv.slice(2), env = process.env) => {
  const { dryRun, selectedContexts } = parseArgs(argv);

  console.log('== Production readiness preflight ==');
  console.log(`Contexts: ${selectedContexts.join(', ')}`);
  if (dryRun) {
    console.log('Mode: dry-run/check (no external connections, no secret values displayed)');
  }

  const results = selectedContexts.map((contextName) => checkContext(contexts[contextName], env));
  const hasFailure = results.some((result) => !result.ok);

  if (hasFailure) {
    console.error('\nPreflight failed: configure missing variables before go-live.');
    return 1;
  }

  console.log('\nPreflight passed.');
  return 0;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(runPreflight());
  } catch (error) {
    console.error(`Preflight argument error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

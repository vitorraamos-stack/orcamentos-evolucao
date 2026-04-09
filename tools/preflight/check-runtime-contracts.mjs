#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

export const REQUIRED_CONTRACTS = {
  rpc: [
    'hub_os_create_order_secure',
    'hub_os_update_order_secure',
    'hub_os_move_order_secure',
    'hub_os_archive_order_secure',
    'hub_os_delete_order_secure',
    'update_os_order_consultor',
    'set_user_modules',
  ],
  tables: ['os_orders', 'os_orders_event', 'user_module_access', 'profiles'],
};

export const parseArgs = (argv) => {
  const strict = argv.includes('--strict');
  return { strict };
};

const readSupabaseConfig = (env) => {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  return { url, key };
};

const hasAllRows = (rows, key, expected) => {
  const actual = new Set((rows ?? []).map((row) => String(row[key])));
  return expected.filter((name) => !actual.has(name));
};

export const runRuntimeContractsCheck = async (argv = process.argv.slice(2), env = process.env) => {
  const { strict } = parseArgs(argv);
  const { url, key } = readSupabaseConfig(env);

  if (!url || !key) {
    const message = 'Runtime contracts check skipped: SUPABASE_URL + key não configurados no ambiente.';
    if (strict) {
      console.error(message);
      return 1;
    }
    console.warn(message);
    return 0;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [rpcResult, tableResult] = await Promise.all([
    supabase
      .from('routines')
      .select('routine_name')
      .eq('specific_schema', 'public')
      .in('routine_name', REQUIRED_CONTRACTS.rpc),
    supabase
      .from('tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', REQUIRED_CONTRACTS.tables),
  ]);

  if (rpcResult.error) {
    console.error(`Falha ao consultar rotinas: ${rpcResult.error.message}`);
    return 1;
  }
  if (tableResult.error) {
    console.error(`Falha ao consultar tabelas: ${tableResult.error.message}`);
    return 1;
  }

  const missingRpc = hasAllRows(rpcResult.data, 'routine_name', REQUIRED_CONTRACTS.rpc);
  const missingTables = hasAllRows(tableResult.data, 'table_name', REQUIRED_CONTRACTS.tables);

  if (missingRpc.length > 0 || missingTables.length > 0) {
    if (missingRpc.length > 0) console.error(`RPCs ausentes: ${missingRpc.join(', ')}`);
    if (missingTables.length > 0) console.error(`Tabelas ausentes: ${missingTables.join(', ')}`);
    return 1;
  }

  console.log('Runtime contracts check passed.');
  return 0;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await runRuntimeContractsCheck();
  process.exit(code);
}

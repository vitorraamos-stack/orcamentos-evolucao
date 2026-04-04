#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || args.has('--check');

const contexts = {
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

const checkContext = ({ label, required }) => {
  const missing = required.filter((name) => !process.env[name]);
  const ok = missing.length === 0;

  console.log(`\n[${ok ? 'OK' : 'FAIL'}] ${label}`);
  console.log(`- required vars: ${required.length}`);
  console.log(`- available: ${required.length - missing.length}`);
  if (!ok) {
    console.log(`- missing: ${missing.join(', ')}`);
  }

  return { ok, missing };
};

console.log('== Production readiness preflight ==');
if (dryRun) {
  console.log('Mode: dry-run/check (no external connections, no secret values displayed)');
}

const results = Object.values(contexts).map(checkContext);
const hasFailure = results.some((result) => !result.ok);

if (hasFailure) {
  console.error('\nPreflight failed: configure missing variables before go-live.');
  process.exit(1);
}

console.log('\nPreflight passed.');

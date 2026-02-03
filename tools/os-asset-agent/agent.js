const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.OS_ASSET_BUCKET || 'os-artes';
const SMB_BASE = process.env.SMB_BASE;
const POLL_INTERVAL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS || 10);
const PROCESSING_TIMEOUT_MINUTES = 30;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
}

if (!SMB_BASE) {
  throw new Error('SMB_BASE é obrigatório.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeFilename = (filename) => {
  const normalized = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim()
    .slice(0, 120);

  return normalized.length > 0 ? normalized : 'arquivo';
};

const sanitizeFolderName = (name) => {
  const normalized = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleaned = normalized.replace(/^[.\s]+/, '').trim();
  const limited = cleaned.slice(0, 120).trim();
  return limited.length > 0 ? limited : 'pasta';
};

const normalizeFirstLetter = (value) => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const firstLetter = normalized.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(firstLetter) ? firstLetter : '#';
};

const buildAssetFilename = (asset) => {
  const originalName = asset.original_name || path.basename(asset.object_path || '');
  const baseName = path.basename(originalName, path.extname(originalName));
  const safeBase = sanitizeFilename(baseName) || 'arquivo';
  const extension = path.extname(originalName);
  const hashSource = `${asset.id}|${asset.object_path}|${originalName}`;
  const hash = crypto.createHash('sha256').update(hashSource).digest('hex').slice(0, 8);
  return `${safeBase}--${hash}${extension}`;
};

const fileExistsWithSize = async (filePath, expectedSize) => {
  try {
    const stats = await fs.promises.stat(filePath);
    if (Number.isFinite(expectedSize)) {
      return stats.size === Number(expectedSize);
    }
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const requeueStaleJobs = async () => {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('os_order_asset_jobs')
    .update({
      status: 'PENDING',
      last_error: 'timeout/requeue',
      processing_started_at: null,
    })
    .eq('status', 'PROCESSING')
    .lt('processing_started_at', cutoff);

  if (error) {
    console.error('Erro ao reencaminhar jobs travados:', error.message);
  }
};

const cleanupJob = async (job) => {
  const { data: assets, error: assetsError } = await supabase
    .from('os_order_assets')
    .select('id, object_path')
    .eq('job_id', job.id)
    .is('deleted_from_storage_at', null);

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  const objectPaths = (assets ?? []).map((asset) => asset.object_path);
  if (objectPaths.length === 0) {
    await supabase
      .from('os_order_asset_jobs')
      .update({ status: 'CLEANED', cleaned_at: new Date().toISOString(), last_error: null })
      .eq('id', job.id);
    return;
  }

  const { error: removeError } = await supabase.storage.from(BUCKET).remove(objectPaths);
  if (removeError) {
    await supabase
      .from('os_order_asset_jobs')
      .update({ status: 'DONE_CLEANUP_FAILED', last_error: removeError.message })
      .eq('id', job.id);
    return;
  }

  const deletedAt = new Date().toISOString();
  await supabase
    .from('os_order_assets')
    .update({ deleted_from_storage_at: deletedAt })
    .in('object_path', objectPaths);
  await supabase
    .from('os_order_asset_jobs')
    .update({ status: 'CLEANED', cleaned_at: deletedAt, last_error: null })
    .eq('id', job.id);
};

const processJob = async (job) => {
  const { data: lockedJob, error: lockError } = await supabase
    .from('os_order_asset_jobs')
    .update({
      status: 'PROCESSING',
      processing_started_at: new Date().toISOString(),
      attempt_count: (job.attempt_count || 0) + 1,
    })
    .eq('id', job.id)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();

  if (lockError) {
    throw new Error(lockError.message);
  }

  if (!lockedJob) {
    return;
  }

  const { data: order, error: orderError } = await supabase
    .from('os_orders')
    .select('id, sale_number, client_name')
    .eq('id', job.os_id)
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? 'OS não encontrada.');
  }

  const { data: assets, error: assetsError } = await supabase
    .from('os_order_assets')
    .select('*')
    .eq('job_id', job.id);

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  if (!assets || assets.length === 0) {
    throw new Error('Nenhum arquivo encontrado para o job.');
  }

  const clientFolder = sanitizeFolderName(order.client_name || 'cliente');
  const letter = normalizeFirstLetter(order.client_name || '');
  const osFolder = sanitizeFolderName(order.sale_number || order.id);
  const destinationPath = path.join(SMB_BASE, letter, clientFolder, osFolder);

  await fs.promises.mkdir(destinationPath, { recursive: true });

  for (const asset of assets) {
    const safeName = buildAssetFilename(asset);
    const targetPath = path.join(destinationPath, safeName);

    const alreadySynced = await fileExistsWithSize(targetPath, asset.size_bytes);
    if (alreadySynced) {
      continue;
    }

    const { data: download, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(asset.object_path);

    if (downloadError || !download) {
      throw new Error(downloadError?.message ?? 'Falha ao baixar arquivo.');
    }

    const fileBuffer = Buffer.from(await download.arrayBuffer());
    await fs.promises.writeFile(targetPath, fileBuffer);

    const stats = await fs.promises.stat(targetPath);
    if (Number(asset.size_bytes) !== stats.size) {
      throw new Error(`Tamanho inválido para ${safeName}.`);
    }
  }

  const syncedAt = new Date().toISOString();
  await supabase.from('os_order_assets').update({ synced_at: syncedAt, error: null }).eq('job_id', job.id);
  await supabase
    .from('os_order_asset_jobs')
    .update({ status: 'DONE', completed_at: syncedAt, destination_path: destinationPath, last_error: null })
    .eq('id', job.id);

  await cleanupJob(job);
};

const loop = async () => {
  await requeueStaleJobs();

  const { data: cleanupJobs } = await supabase
    .from('os_order_asset_jobs')
    .select('*')
    .eq('status', 'DONE_CLEANUP_FAILED')
    .order('updated_at', { ascending: true })
    .limit(3);

  for (const job of cleanupJobs ?? []) {
    try {
      await cleanupJob(job);
    } catch (error) {
      console.error('Erro ao limpar job:', error instanceof Error ? error.message : error);
    }
  }

  const { data: job, error } = await supabase
    .from('os_order_asset_jobs')
    .select('*')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar job:', error.message);
    return;
  }

  if (!job) {
    return;
  }

  try {
    await processJob(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro ao processar job:', message);
    await supabase
      .from('os_order_asset_jobs')
      .update({ status: 'ERROR', last_error: message })
      .eq('id', job.id);
    await supabase.from('os_order_assets').update({ error: message }).eq('job_id', job.id);
  }
};

const run = async () => {
  console.log('OS Asset Agent iniciado.');
  while (true) {
    await loop();
    await sleep(POLL_INTERVAL_SECONDS * 1000);
  }
};

run().catch((error) => {
  console.error('Erro fatal no agente:', error);
  process.exit(1);
});

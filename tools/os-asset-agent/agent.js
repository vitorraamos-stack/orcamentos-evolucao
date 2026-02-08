const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { DeleteObjectsCommand, GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.OS_ASSET_BUCKET || 'os-artes';
const SMB_BASE = process.env.SMB_BASE;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'os-artes';
const R2_ENDPOINT =
  process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const POLL_INTERVAL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS || 10);
const PROCESSING_TIMEOUT_MINUTES = 30;
const PAYMENT_PROOF_BATCH_SIZE = Number(process.env.PAYMENT_PROOF_BATCH_SIZE || 5);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
}

if (!SMB_BASE) {
  throw new Error('SMB_BASE é obrigatório.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const r2Client =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT
    ? new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        forcePathStyle: true,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

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

const ensureR2Client = () => {
  if (!r2Client) {
    throw new Error('R2 não configurado. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.');
  }
  return r2Client;
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const sanitizeFolderName = (name) => {
  const fallback = 'pasta';
  const normalized = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutLeading = normalized.replace(/^[._\s]+/, '');
  const withoutTrailing = withoutLeading.replace(/[.\s]+$/, '').trim();
  if (!withoutTrailing) {
    return fallback;
  }

  const limited = withoutTrailing.slice(0, 120).trim();
  const cleaned = limited.replace(/^[._\s]+/, '').replace(/[.\s]+$/, '').trim();
  if (!cleaned) {
    return fallback;
  }

  const reservedPattern = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedPattern.test(cleaned)) {
    return fallback;
  }

  return cleaned;
};

if (require.main === module) {
  console.assert(sanitizeFolderName('Teste Quatro') === 'Teste Quatro', 'sanitizeFolderName: espaços preservados');
  console.assert(sanitizeFolderName('Vítor José') === 'Vitor Jose', 'sanitizeFolderName: acentos removidos');
  console.assert(
    sanitizeFolderName('  Nome   com   espaços  ') === 'Nome com espaços',
    'sanitizeFolderName: espaços colapsados'
  );
  console.assert(sanitizeFolderName('A:B*C?D') === 'ABCD', 'sanitizeFolderName: caracteres inválidos removidos');
  console.assert(sanitizeFolderName('Nome. ') === 'Nome', 'sanitizeFolderName: sufixo inválido removido');
  console.assert(sanitizeFolderName(' CON ') === 'pasta', 'sanitizeFolderName: nome reservado');
}

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

const syncPaymentProof = async (payment) => {
  const folderPath = payment.os?.folder_path;
  if (!folderPath) {
    console.warn(`Comprovante ${payment.id} sem folder_path. Ignorando.`);
    return;
  }

  if (!payment.attachment_path) {
    console.warn(`Comprovante ${payment.id} sem attachment_path. Ignorando.`);
    return;
  }

  const key = payment.attachment_path;
  const filename = sanitizeFilename(path.basename(key));
  const destDir = path.join(folderPath, 'Financeiro', 'Comprovante');
  const destFile = path.join(destDir, filename);
  const expectedSize = payment.size_bytes;
  const alreadySyncedPath = payment.smb_path || destFile;

  const alreadySynced = await fileExistsWithSize(alreadySyncedPath, expectedSize);
  if (alreadySynced) {
    await supabase
      .from('os_payment_proof')
      .update({ synced_to_smb_at: new Date().toISOString(), smb_path: alreadySyncedPath })
      .eq('id', payment.id);
    return;
  }

  await fs.promises.mkdir(destDir, { recursive: true });

  let fileBuffer;
  try {
    const client = ensureR2Client();
    const bucket = payment.storage_bucket || R2_BUCKET;
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (!response.Body) {
      console.warn(`Comprovante ${payment.id} sem corpo no R2.`);
      return;
    }
    fileBuffer = await streamToBuffer(response.Body);
  } catch (error) {
    console.error(`Erro ao baixar comprovante ${payment.id} do R2:`, error instanceof Error ? error.message : error);
    return;
  }

  await fs.promises.writeFile(destFile, fileBuffer);

  await supabase
    .from('os_payment_proof')
    .update({ synced_to_smb_at: new Date().toISOString(), smb_path: destFile })
    .eq('id', payment.id);
};

const syncPaymentProofs = async () => {
  const { data: payments, error } = await supabase
    .from('os_payment_proof')
    .select(
      'id, os_id, attachment_path, storage_provider, storage_bucket, size_bytes, smb_path, created_at, os:os_id ( folder_path )'
    )
    .eq('storage_provider', 'r2')
    .not('attachment_path', 'is', null)
    .is('synced_to_smb_at', null)
    .order('created_at', { ascending: true })
    .limit(PAYMENT_PROOF_BATCH_SIZE);

  if (error) {
    console.error('Erro ao buscar comprovantes pendentes:', error.message);
    return;
  }

  for (const payment of payments ?? []) {
    try {
      await syncPaymentProof(payment);
    } catch (error) {
      console.error(
        `Erro ao sincronizar comprovante ${payment.id}:`,
        error instanceof Error ? error.message : error
      );
    }
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
    .select('id, object_path, storage_provider, storage_bucket, bucket')
    .eq('job_id', job.id)
    .is('deleted_from_storage_at', null);

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  const pendingAssets = assets ?? [];
  if (pendingAssets.length === 0) {
    await supabase
      .from('os_order_asset_jobs')
      .update({ status: 'CLEANED', cleaned_at: new Date().toISOString(), last_error: null })
      .eq('id', job.id);
    return;
  }

  const r2Assets = pendingAssets.filter((asset) => asset.storage_provider === 'r2');
  const supabaseAssets = pendingAssets.filter((asset) => asset.storage_provider !== 'r2');

  if (r2Assets.length > 0) {
    const client = ensureR2Client();
    const byBucket = new Map();
    for (const asset of r2Assets) {
      const bucket = asset.storage_bucket || asset.bucket || R2_BUCKET;
      const list = byBucket.get(bucket) || [];
      list.push({ Key: asset.object_path });
      byBucket.set(bucket, list);
    }

    for (const [bucket, objects] of byBucket.entries()) {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects, Quiet: false },
        })
      );
      if (result.Errors && result.Errors.length > 0) {
        await supabase
          .from('os_order_asset_jobs')
          .update({ status: 'DONE_CLEANUP_FAILED', last_error: result.Errors[0].Message })
          .eq('id', job.id);
        return;
      }
    }
  }

  if (supabaseAssets.length > 0) {
    const byBucket = new Map();
    for (const asset of supabaseAssets) {
      const bucket = asset.bucket || BUCKET;
      const list = byBucket.get(bucket) || [];
      list.push(asset.object_path);
      byBucket.set(bucket, list);
    }

    for (const [bucket, objectPaths] of byBucket.entries()) {
      const { error: removeError } = await supabase.storage.from(bucket).remove(objectPaths);
      if (removeError) {
        await supabase
          .from('os_order_asset_jobs')
          .update({ status: 'DONE_CLEANUP_FAILED', last_error: removeError.message })
          .eq('id', job.id);
        return;
      }
    }
  }

  const deletedAt = new Date().toISOString();
  await supabase
    .from('os_order_assets')
    .update({ deleted_from_storage_at: deletedAt })
    .in(
      'object_path',
      pendingAssets.map((asset) => asset.object_path)
    );
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
    const assetType = asset.asset_type || 'CLIENT_FILE';
    const subdir =
      assetType === 'PAYMENT_PROOF'
        ? path.join('Financeiro', 'Comprovantes')
        : assetType === 'PURCHASE_ORDER'
          ? path.join('Financeiro', 'OrdensCompra')
          : '';
    const targetDir = subdir ? path.join(destinationPath, subdir) : destinationPath;
    await fs.promises.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, safeName);

    const alreadySynced = await fileExistsWithSize(targetPath, asset.size_bytes);
    if (alreadySynced) {
      continue;
    }

    let fileBuffer;

    if (asset.storage_provider === 'r2') {
      const client = ensureR2Client();
      const bucket = asset.storage_bucket || asset.bucket || R2_BUCKET;
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: asset.object_path,
        })
      );
      if (!response.Body) {
        throw new Error('Falha ao baixar arquivo do R2.');
      }
      fileBuffer = await streamToBuffer(response.Body);
    } else {
      const { data: download, error: downloadError } = await supabase.storage
        .from(asset.bucket || BUCKET)
        .download(asset.object_path);

      if (downloadError || !download) {
        throw new Error(downloadError?.message ?? 'Falha ao baixar arquivo.');
      }

      fileBuffer = Buffer.from(await download.arrayBuffer());
    }

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
    await syncPaymentProofs();
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

  await syncPaymentProofs();
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

import { supabase } from '@/lib/supabase';
import { EdgeFunctionInvokeError, invokeEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import {
  ASSET_BUCKET,
  buildAssetObjectPath,
  resolveAssetContentType,
  sanitizeFilename,
  validateFiles,
} from './assetUtils';

export { ASSET_BUCKET, sanitizeFilename, validateFiles } from './assetUtils';

type UploadAssetsParams = {
  osId: string;
  files: File[];
  userId: string | null;
};

export type FinancialDocType = 'PAYMENT_PROOF' | 'PURCHASE_ORDER';

export type FinancialDoc = {
  file: File;
  type: FinancialDocType;
};

type UploadFinancialDocsParams = {
  orderId: string;
  docs: FinancialDoc[];
  userId: string | null;
};

class PresignInvokeError extends Error {
  status?: number;
  details?: string;
}

const mapPresignError = (status?: number, details?: string) => {
  if (status === 401 || /invalid jwt/i.test(details ?? '')) {
    return 'Sessão expirada. Faça login novamente.';
  }

  if (status === 404) {
    return 'Edge Function r2-presign-upload não publicada neste projeto Supabase.';
  }

  if (status === 500 && /r2 env not configured/i.test(details ?? '')) {
    return 'Secrets do R2 não configurados no Supabase.';
  }

  return null;
};

const buildPresignInvokeError = async (presignError: unknown) => {
  const invokeError = new PresignInvokeError('R2 não configurado ou falha ao gerar URL de upload.');

  if (!presignError || typeof presignError !== 'object') {
    return invokeError;
  }

  const errorLike = presignError as {
    message?: string;
    context?: Response;
    status?: number;
    details?: string;
  };

  let status = errorLike.status;
  let details = errorLike.details ?? errorLike.message;

  if (presignError instanceof EdgeFunctionInvokeError) {
    status = presignError.status;
    details = presignError.details ?? presignError.message;
  }

  if (errorLike.context) {
    status = errorLike.context.status;
  }

  if (!details && errorLike.context) {
    try {
      const body = await errorLike.context.clone().json();
      if (body && typeof body.error === 'string') {
        details = body.error;
      }
    } catch {
      // noop
    }
  }

  const mappedMessage = mapPresignError(status, details);
  if (mappedMessage) {
    invokeError.message = mappedMessage;
  }

  invokeError.status = status;
  invokeError.details = details;

  return invokeError;
};

const buildFinancialDocObjectPath = (
  osId: string,
  jobId: string,
  docType: FinancialDocType,
  filename: string,
  now = new Date()
) => {
  const sanitizedName = sanitizeFilename(filename);
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const subdir = docType === 'PAYMENT_PROOF' ? 'payment_proof' : 'purchase_order';
  return `os_orders/${osId}/financeiro/${subdir}/${jobId}/${timestamp}_${sanitizedName}`;
};

export const uploadAssetsForOrder = async ({ osId, files, userId }: UploadAssetsParams) => {
  const validation = validateFiles(files);
  if (!validation.ok) {
    throw new Error(validation.error ?? 'Arquivos inválidos.');
  }

  let jobId: string | null = null;
  let uploadedPaths: string[] = [];

  try {
    const { data: job, error: jobError } = await supabase
      .from('os_order_asset_jobs')
      .insert({
        os_id: osId,
        status: 'UPLOADING',
        created_by: userId,
        attempt_count: 0,
      })
      .select('id')
      .single();

    if (jobError || !job) {
      throw new Error(jobError?.message ?? 'Erro ao criar o job de upload.');
    }

    jobId = job.id;
    const currentJobId = job.id;

    uploadedPaths = [];

    for (const file of files) {
      const sanitizedName = sanitizeFilename(file.name);
      const objectPath = buildAssetObjectPath(osId, currentJobId, file.name);
      const contentType = resolveAssetContentType(file);

      let presignData: { uploadUrl: string; bucket?: string } | null = null;

      try {
        presignData = await invokeEdgeFunction<{ uploadUrl: string; bucket?: string }>(supabase, 'r2-presign-upload', {
          key: objectPath,
          contentType,
          sizeBytes: file.size,
        });
      } catch (presignError) {
        throw await buildPresignInvokeError(presignError);
      }

      if (!presignData?.uploadUrl) {
        throw await buildPresignInvokeError(null);
      }

      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Falha ao enviar o arquivo "${sanitizedName}".`);
      }

      const etag = uploadResponse.headers.get('etag')?.replace(/"/g, '') ?? null;
      uploadedPaths.push(objectPath);

      const { error: assetError } = await supabase.from('os_order_assets').insert({
        os_id: osId,
        job_id: currentJobId,
        bucket: presignData.bucket ?? ASSET_BUCKET,
        storage_bucket: presignData.bucket ?? ASSET_BUCKET,
        storage_provider: 'r2',
        r2_etag: etag,
        object_path: objectPath,
        original_name: file.name,
        mime_type: contentType || null,
        size_bytes: file.size,
        uploaded_by: userId,
        asset_type: 'CLIENT_FILE',
      });

      if (assetError) {
        throw new Error(assetError.message);
      }
    }

    const { error: updateError } = await supabase
      .from('os_order_asset_jobs')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { jobId };
  } catch (error) {
    if (jobId) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar arquivos.';

      try {
        const { data: assets } = await supabase
          .from('os_order_assets')
          .select('object_path, storage_provider')
          .eq('job_id', jobId);
        const storedPaths = (assets ?? [])
          .filter((asset) => asset.storage_provider === 'r2')
          .map((asset) => asset.object_path);
        const pathsToDelete = Array.from(new Set([...uploadedPaths, ...storedPaths]));
        if (pathsToDelete.length > 0) {
          await invokeEdgeFunction<void>(supabase, 'r2-delete-objects', {
            keys: pathsToDelete,
            bucket: ASSET_BUCKET,
          });
          await supabase
            .from('os_order_assets')
            .update({ deleted_from_storage_at: new Date().toISOString() })
            .in('object_path', pathsToDelete);
        }
      } catch (cleanupError) {
        console.error('Falha ao limpar uploads no R2:', cleanupError);
      }

      await supabase
        .from('os_order_asset_jobs')
        .update({ status: 'ERROR', last_error: message, attempt_count: 1, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      await supabase.from('os_order_assets').update({ error: message }).eq('job_id', jobId);
    }

    throw error;
  }
};

export const uploadFinancialDocsForOrder = async ({ orderId, docs, userId }: UploadFinancialDocsParams) => {
  const validation = validateFiles(docs.map((doc) => doc.file));
  if (!validation.ok) {
    throw new Error(validation.error ?? 'Arquivos inválidos.');
  }

  let jobId: string | null = null;
  let uploadedPaths: string[] = [];

  try {
    const { data: job, error: jobError } = await supabase
      .from('os_order_asset_jobs')
      .insert({
        os_id: orderId,
        status: 'UPLOADING',
        created_by: userId,
        attempt_count: 0,
      })
      .select('id')
      .single();

    if (jobError || !job) {
      throw new Error(jobError?.message ?? 'Erro ao criar o job de upload.');
    }

    jobId = job.id;
    const currentJobId = job.id;

    uploadedPaths = [];

    for (const doc of docs) {
      const { file, type } = doc;
      const sanitizedName = sanitizeFilename(file.name);
      const objectPath = buildFinancialDocObjectPath(orderId, currentJobId, type, file.name);
      const contentType = resolveAssetContentType(file);

      const { data: asset, error: assetError } = await supabase
        .from('os_order_assets')
        .insert({
          os_id: orderId,
          job_id: currentJobId,
          bucket: ASSET_BUCKET,
          object_path: objectPath,
          original_name: file.name,
          mime_type: contentType || null,
          size_bytes: file.size,
          uploaded_by: userId,
          asset_type: type,
        })
        .select('id')
        .single();

      if (assetError || !asset) {
        throw new Error(assetError?.message ?? 'Erro ao registrar o documento financeiro.');
      }

      let presignData: { uploadUrl: string; bucket?: string } | null = null;

      try {
        presignData = await invokeEdgeFunction<{ uploadUrl: string; bucket?: string }>(supabase, 'r2-presign-upload', {
          key: objectPath,
          contentType,
          sizeBytes: file.size,
        });
      } catch (presignError) {
        throw await buildPresignInvokeError(presignError);
      }

      if (!presignData?.uploadUrl) {
        throw await buildPresignInvokeError(null);
      }

      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Falha ao enviar o documento "${sanitizedName}".`);
      }

      const etag = uploadResponse.headers.get('etag')?.replace(/"/g, '') ?? null;
      uploadedPaths.push(objectPath);

      const { error: updateError } = await supabase
        .from('os_order_assets')
        .update({
          storage_provider: 'r2',
          storage_bucket: presignData.bucket ?? ASSET_BUCKET,
          r2_etag: etag,
        })
        .eq('id', asset.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    const { error: updateJobError } = await supabase
      .from('os_order_asset_jobs')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    if (updateJobError) {
      throw new Error(updateJobError.message);
    }

    return { jobId };
  } catch (error) {
    console.error('Falha ao enviar documentos financeiros.', {
      orderId,
      jobId,
      error,
    });

    if (jobId) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar documentos financeiros.';

      try {
        const { data: assets } = await supabase
          .from('os_order_assets')
          .select('object_path, storage_provider')
          .eq('job_id', jobId);
        const storedPaths = (assets ?? [])
          .filter((asset) => asset.storage_provider === 'r2')
          .map((asset) => asset.object_path);
        const pathsToDelete = Array.from(new Set([...uploadedPaths, ...storedPaths]));
        if (pathsToDelete.length > 0) {
          await invokeEdgeFunction<void>(supabase, 'r2-delete-objects', {
            keys: pathsToDelete,
            bucket: ASSET_BUCKET,
          });
          await supabase
            .from('os_order_assets')
            .update({ deleted_from_storage_at: new Date().toISOString() })
            .in('object_path', pathsToDelete);
        }
      } catch (cleanupError) {
        console.error('Falha ao limpar uploads de documentos financeiros no R2:', cleanupError);
      }

      await supabase
        .from('os_order_asset_jobs')
        .update({ status: 'ERROR', last_error: message, attempt_count: 1, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      await supabase.from('os_order_assets').update({ error: message }).eq('job_id', jobId);
    }

    throw error;
  }
};

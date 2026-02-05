import { supabase } from '@/lib/supabase';
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

class PresignInvokeError extends Error {
  status?: number;
  details?: string;
}

const getSessionOrThrow = async () => {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;

  if (error || !session?.access_token) {
    throw new Error('Sessão inválida/expirada. Faça login novamente.');
  }

  return session;
};

const mapPresignError = (status?: number, details?: string) => {
  if (status === 401 || /invalid jwt/i.test(details ?? '')) {
    return 'Sessão expirada ou projeto Supabase incorreto. Faça login novamente.';
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
  };

  const status = errorLike.context?.status;
  let details = errorLike.message;

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
    const session = await getSessionOrThrow();

    for (const file of files) {
      const sanitizedName = sanitizeFilename(file.name);
      const objectPath = buildAssetObjectPath(osId, currentJobId, file.name);
      const contentType = resolveAssetContentType(file);

      const { data: presignData, error: presignError } = await supabase.functions.invoke('r2-presign-upload', {
        body: {
          key: objectPath,
          contentType,
          sizeBytes: file.size,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (presignError || !presignData?.uploadUrl) {
        throw await buildPresignInvokeError(presignError);
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
          const activeSession = await getSessionOrThrow();
          await supabase.functions.invoke('r2-delete-objects', {
            body: { keys: pathsToDelete, bucket: ASSET_BUCKET },
            headers: {
              Authorization: `Bearer ${activeSession.access_token}`,
            },
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

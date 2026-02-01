import { supabase } from '@/lib/supabase';
import { ASSET_BUCKET, sanitizeFilename, validateFiles } from './assetUtils';

export { ASSET_BUCKET, sanitizeFilename, validateFiles } from './assetUtils';

type UploadAssetsParams = {
  osId: string;
  files: File[];
  userId: string | null;
};

export const uploadAssetsForOrder = async ({ osId, files, userId }: UploadAssetsParams) => {
  const validation = validateFiles(files);
  if (!validation.ok) {
    throw new Error(validation.error ?? 'Arquivos inválidos.');
  }

  const uploadedPaths: string[] = [];
  let jobId: string | null = null;

  try {
    const { data: job, error: jobError } = await supabase
      .from('os_order_asset_jobs')
      .insert({
        os_id: osId,
        status: 'UPLOADING',
        created_by: userId,
      })
      .select('id')
      .single();

    if (jobError || !job) {
      throw new Error(jobError?.message ?? 'Erro ao criar o job de upload.');
    }

    jobId = job.id;

    for (const file of files) {
      const sanitizedName = sanitizeFilename(file.name);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const objectPath = `os_orders/${osId}/${jobId}/${timestamp}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from(ASSET_BUCKET)
        .upload(objectPath, file, { upsert: false, contentType: file.type || undefined });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      uploadedPaths.push(objectPath);

      const { error: assetError } = await supabase.from('os_order_assets').insert({
        os_id: osId,
        job_id: jobId,
        bucket: ASSET_BUCKET,
        object_path: objectPath,
        original_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: userId,
      });

      if (assetError) {
        throw new Error(assetError.message);
      }
    }

    const { error: updateError } = await supabase
      .from('os_order_asset_jobs')
      .update({ status: 'PENDING' })
      .eq('id', jobId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { jobId, assets: uploadedPaths };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(ASSET_BUCKET).remove(uploadedPaths);
      await supabase
        .from('os_order_assets')
        .update({ deleted_from_storage_at: new Date().toISOString() })
        .in('object_path', uploadedPaths);
    }

    if (jobId) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar arquivos.';
      await supabase
        .from('os_order_asset_jobs')
        .update({ status: 'ERROR', last_error: message })
        .eq('id', jobId);
      await supabase.from('os_order_assets').update({ error: message }).eq('job_id', jobId);
    }

    throw error;
  }
};

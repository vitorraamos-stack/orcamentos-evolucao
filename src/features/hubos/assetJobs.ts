import { supabase } from '@/lib/supabase';
import type { AssetJob } from './types';

export const getLatestAssetJobsByOsId = async (osIds: string[]) => {
  if (osIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from('os_order_asset_jobs')
    .select('id, os_id, status, created_at, updated_at, last_error')
    .in('os_id', osIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const latestByOsId: Record<string, AssetJob | null> = Object.fromEntries(
    osIds.map((osId) => [osId, null])
  );

  data?.forEach((job) => {
    if (!latestByOsId[job.os_id]) {
      latestByOsId[job.os_id] = job as AssetJob;
    }
  });

  return latestByOsId;
};

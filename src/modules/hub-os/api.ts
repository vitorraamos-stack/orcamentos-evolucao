import { supabase } from '@/lib/supabase';
import { EdgeFunctionInvokeError, invokeEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import type {
  Os,
  OsEvent,
  OsLayoutAsset,
  OsPaymentProof,
  OsStatus,
  PaymentStatus,
} from './types';
import { lookupOrderForKiosk } from './orderRepository';

export type KioskLookupResult = {
  id: string;
  source: 'os' | 'os_orders';
};

export class OsAssetDownloadError extends Error {
  code?: string;
  status?: number;
}

type OsLayoutAssetRow = OsLayoutAsset & {
  os_order_asset_jobs?: { status?: string | null } | { status?: string | null }[] | null;
};

const isValidLayoutCandidate = (asset: OsLayoutAssetRow) => {
  const job = Array.isArray(asset.os_order_asset_jobs) ? asset.os_order_asset_jobs[0] : asset.os_order_asset_jobs;

  return (
    asset.asset_type === 'LAYOUT' &&
    asset.deleted_from_storage_at == null &&
    asset.error == null &&
    asset.storage_provider === 'r2' &&
    asset.r2_etag != null &&
    job?.status !== 'ERROR'
  );
};


export const fetchOsStatuses = async () => {
  const { data, error } = await supabase
    .from('os_status')
    .select('*')
    .order('position');

  if (error) throw error;
  return data as OsStatus[];
};

export const fetchOsList = async () => {
  const { data, error } = await supabase
    .from('os')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data as Os[];
};

export const fetchOsById = async (id: string) => {
  const { data, error } = await supabase
    .from('os')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Os;
};

export const fetchOsByCode = async (code: string): Promise<KioskLookupResult | null> => {
  return lookupOrderForKiosk(code);
};

export const fetchOsEvents = async (osId: string) => {
  const { data, error } = await supabase
    .from('os_event')
    .select('*')
    .eq('os_id', osId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as OsEvent[];
};

export const fetchOsPayments = async (osId: string) => {
  const { data, error } = await supabase
    .from('os_payment_proof')
    .select('*')
    .eq('os_id', osId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as OsPaymentProof[];
};

export const fetchOsLayouts = async (osId: string, limit = 10): Promise<OsLayoutAsset[]> => {
  const { data, error } = await supabase
    .from('os_order_assets')
    .select(
      'id, os_id, asset_type, object_path, original_name, mime_type, size_bytes, storage_provider, storage_bucket, bucket, r2_etag, error, deleted_from_storage_at, uploaded_at, os_order_asset_jobs(status)'
    )
    .eq('os_id', osId)
    .eq('asset_type', 'LAYOUT')
    .order('uploaded_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data as OsLayoutAssetRow[] | null) ?? [])
    .filter(isValidLayoutCandidate)
    .map(({ os_order_asset_jobs: _ignored, ...asset }) => asset);
};

export const fetchLatestOsLayout = async (osId: string) => {
  const layouts = await fetchOsLayouts(osId, 1);
  return layouts[0] ?? null;
};

export const fetchOsAssetDownloadUrl = async (
  objectPath: string,
  filename?: string
) => {
  let data: { downloadUrl: string } | null = null;

  try {
    data = await invokeEdgeFunction<{ downloadUrl: string }>(supabase, 'r2-presign-download', {
      key: objectPath,
      filename,
    });
  } catch (error) {
    if (error instanceof EdgeFunctionInvokeError) {
      const normalized = new OsAssetDownloadError(error.message);
      normalized.status = error.status;
      normalized.code = error.status === 404 ? 'object_not_found' : undefined;
      throw normalized;
    }
    throw error;
  }

  if (!data?.downloadUrl) {
    throw new Error('Falha ao gerar URL de download.');
  }

  return data.downloadUrl;
};

export const createOs = async (payload: Partial<Os>) => {
  const { data, error } = await supabase.from('os').insert(payload).select('*').single();
  if (error) throw error;
  return data as Os;
};

export const updateOs = async (id: string, payload: Partial<Os>) => {
  const { data, error } = await supabase
    .from('os')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Os;
};

export const createOsEvent = async (payload: Partial<OsEvent>) => {
  const { data, error } = await supabase
    .from('os_event')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as OsEvent;
};

export const createPaymentProof = async (payload: Partial<OsPaymentProof>) => {
  const { data, error } = await supabase
    .from('os_payment_proof')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as OsPaymentProof;
};

export const updatePaymentProof = async (id: string, payload: Partial<OsPaymentProof>) => {
  const { data, error } = await supabase
    .from('os_payment_proof')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as OsPaymentProof;
};

export const deletePaymentProof = async (id: string) => {
  const { error } = await supabase.from('os_payment_proof').delete().eq('id', id);
  if (error) throw error;
};

export const updateOsPaymentStatus = async (osId: string, status: PaymentStatus) => {
  const { data, error } = await supabase
    .from('os')
    .update({ payment_status: status, updated_at: new Date().toISOString() })
    .eq('id', osId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Os;
};

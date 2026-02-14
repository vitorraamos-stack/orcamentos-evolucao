import { supabase } from '@/lib/supabase';
import type { Os, OsEvent, OsPaymentProof, OsStatus, PaymentStatus } from './types';

const NOT_FOUND_CODE = 'PGRST116';

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

export const fetchOsByCode = async (code: string): Promise<Os | null> => {
  const numericCode = Number(code);
  const hasNumericCode = Number.isInteger(numericCode) && numericCode > 0;

  if (!hasNumericCode) {
    return null;
  }

  const { data: byOsNumber, error: byOsNumberError } = await supabase
    .from('os')
    .select('*')
    .eq('os_number', numericCode)
    .maybeSingle();

  if (byOsNumberError && byOsNumberError.code !== NOT_FOUND_CODE) throw byOsNumberError;
  if (byOsNumber) return byOsNumber as Os;

  const { data: bySaleNumber, error: bySaleNumberError } = await supabase
    .from('os')
    .select('*')
    .eq('sale_number', code)
    .maybeSingle();

  if (bySaleNumberError && bySaleNumberError.code !== NOT_FOUND_CODE) throw bySaleNumberError;
  return (bySaleNumber as Os | null) ?? null;
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

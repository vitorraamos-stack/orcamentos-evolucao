import { supabase } from '@/lib/supabase';
import type { Os, OsEvent, OsPaymentProof, OsStatus, PaymentStatus } from './types';

export type KioskLookupResult = {
  id: string;
  source: 'os' | 'os_orders';
};

const NOT_FOUND_CODE = 'PGRST116';

const normalizeDigits = (value: string | null | undefined) =>
  String(value ?? '').replace(/\D+/g, '');


const hasStandaloneNumber = (value: string | null | undefined, code: string) => {
  const source = String(value ?? '');
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|\\D)${escapedCode}(\\D|$)`);
  return pattern.test(source);
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
  const numericCode = Number(code);
  const hasNumericCode = Number.isInteger(numericCode) && numericCode > 0;

  if (!hasNumericCode) {
    return null;
  }

  const { data: byOsNumber, error: byOsNumberError } = await supabase
    .from('os')
    .select('id')
    .eq('os_number', numericCode)
    .limit(1)
    .maybeSingle();

  if (byOsNumberError && byOsNumberError.code !== NOT_FOUND_CODE) throw byOsNumberError;
  if (byOsNumber) return { id: byOsNumber.id, source: 'os' };

  const { data: bySaleNumber, error: bySaleNumberError } = await supabase
    .from('os')
    .select('id')
    .eq('sale_number', code)
    .limit(1)
    .maybeSingle();

  if (bySaleNumberError && bySaleNumberError.code !== NOT_FOUND_CODE) throw bySaleNumberError;
  if (bySaleNumber) return { id: bySaleNumber.id, source: 'os' };

  const { data: fuzzySaleRows, error: fuzzySaleError } = await supabase
    .from('os')
    .select('id, sale_number')
    .ilike('sale_number', `%${code}%`)
    .limit(50);

  if (fuzzySaleError) throw fuzzySaleError;

  const matchByNormalizedSaleNumber = (fuzzySaleRows || []).find(
    (row) => normalizeDigits(row.sale_number) === code
  );

  if (matchByNormalizedSaleNumber) {
    return { id: matchByNormalizedSaleNumber.id, source: 'os' };
  }

  const { data: fuzzyTitleRows, error: fuzzyTitleError } = await supabase
    .from('os')
    .select('id, title')
    .ilike('title', `%${code}%`)
    .limit(50);

  if (fuzzyTitleError) throw fuzzyTitleError;

  const matchByTitleNumber = (fuzzyTitleRows || []).find((row) => hasStandaloneNumber(row.title, code));

  if (matchByTitleNumber) {
    return { id: matchByTitleNumber.id, source: 'os' };
  }

  const { data: orderBySaleNumber, error: orderBySaleNumberError } = await supabase
    .from('os_orders')
    .select('id')
    .eq('sale_number', code)
    .limit(1)
    .maybeSingle();

  if (orderBySaleNumberError && orderBySaleNumberError.code !== NOT_FOUND_CODE) throw orderBySaleNumberError;
  if (orderBySaleNumber) return { id: orderBySaleNumber.id, source: 'os_orders' };

  const { data: fuzzyOrderRows, error: fuzzyOrderError } = await supabase
    .from('os_orders')
    .select('id, sale_number, title')
    .or(`sale_number.ilike.%${code}%,title.ilike.%${code}%`)
    .limit(50);

  if (fuzzyOrderError) throw fuzzyOrderError;

  const matchOrder = (fuzzyOrderRows || []).find(
    (row) => normalizeDigits(row.sale_number) === code || hasStandaloneNumber(row.title, code)
  );

  if (matchOrder) {
    return { id: matchOrder.id, source: 'os_orders' };
  }

  return null;
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

import { supabase } from '@/lib/supabase';
import type { FinanceInstallment, FinanceInstallmentStatus } from './types';

export const fetchPendingSecondInstallments = async () => {
  const { data, error } = await supabase
    .from('os_finance_installments')
    .select('*, os_orders!inner(id, sale_number, client_name, created_at)')
    .eq('installment_no', 2)
    .eq('total_installments', 2)
    .eq('status', 'AWAITING_PROOF')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as FinanceInstallment[];
};

export const fetchFinanceQueue = async (statuses?: FinanceInstallmentStatus[]) => {
  let query = supabase
    .from('os_finance_installments')
    .select('*, os_orders!inner(id, sale_number, client_name, created_at), os_order_assets(id, object_path, original_name)')
    .not('asset_id', 'is', null)
    .order('created_at', { ascending: false });

  if (statuses?.length) {
    query = query.in('status', statuses);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data ?? []) as FinanceInstallment[];
};

export const updateFinanceInstallment = async ({
  id,
  status,
  notes,
  reviewedBy,
}: {
  id: string;
  status: FinanceInstallmentStatus;
  notes?: string | null;
  reviewedBy: string | null;
}) => {
  const { data, error } = await supabase
    .from('os_finance_installments')
    .update({
      status,
      notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as FinanceInstallment;
};

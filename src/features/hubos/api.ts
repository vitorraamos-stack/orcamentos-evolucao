import { supabase } from '@/lib/supabase';
import type { OsOrder, OsOrderEvent } from './types';

export const fetchOrders = async () => {
  const { data, error } = await supabase
    .from('os_orders')
    .select('*')
    .eq('archived', false)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data as OsOrder[];
};

export const createOrder = async (payload: Partial<OsOrder>) => {
  const { data, error } = await supabase
    .from('os_orders')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as OsOrder;
};

export const updateOrder = async (id: string, payload: Partial<OsOrder>) => {
  const { data, error } = await supabase
    .from('os_orders')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as OsOrder;
};

export const archiveOrder = async (id: string, archivedBy: string | null) => {
  const { data, error } = await supabase
    .from('os_orders')
    .update({
      archived: true,
      archived_at: new Date().toISOString(),
      archived_by: archivedBy,
      updated_at: new Date().toISOString(),
      updated_by: archivedBy,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as OsOrder;
};

export const deleteOrder = async (id: string) => {
  const { error } = await supabase
    .from('os_orders')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
};

export const createOrderEvent = async (payload: Partial<OsOrderEvent>) => {
  const { data, error } = await supabase
    .from('os_orders_event')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as OsOrderEvent;
};

type AuditFilters = {
  search?: string;
  type?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export const fetchAuditEvents = async ({
  search,
  type,
  userId,
  dateFrom,
  dateTo,
  limit = 50,
  offset = 0,
}: AuditFilters) => {
  let targetIds: string[] | null = null;
  if (search) {
    const { data, error } = await supabase
      .from('os_orders')
      .select('id')
      .or(`sale_number.ilike.%${search}%,client_name.ilike.%${search}%,title.ilike.%${search}%`);

    if (error) throw new Error(error.message);
    targetIds = (data ?? []).map((item) => item.id);
    if (targetIds.length === 0) {
      return { data: [] as OsOrderEvent[], count: 0 };
    }
  }

  let query = supabase
    .from('os_orders_event')
    .select(
      '*, os:os_id (id, sale_number, client_name, title), profile:created_by (id, full_name, email)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (targetIds) {
    query = query.in('os_id', targetIds);
  }
  if (type) {
    query = query.eq('type', type);
  }
  if (userId) {
    query = query.eq('created_by', userId);
  }
  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }
  if (dateTo) {
    query = query.lte('created_at', dateTo);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return { data: (data ?? []) as OsOrderEvent[], count: count ?? 0 };
};

export const fetchAuditUsers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .order('full_name');

  if (error) throw new Error(error.message);
  return data as { id: string; full_name: string | null; email: string | null }[];
};

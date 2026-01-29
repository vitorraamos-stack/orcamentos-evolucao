import { supabase } from '@/lib/supabase';
import type { OsOrder } from './types';

export const fetchOrders = async () => {
  const { data, error } = await supabase
    .from('os_orders')
    .select('*')
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

  if (error) throw error;
  return data as OsOrder;
};

export const updateOrder = async (id: string, payload: Partial<OsOrder>) => {
  const { data, error } = await supabase
    .from('os_orders')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as OsOrder;
};

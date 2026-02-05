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
    .select('*', { count: 'exact' })
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

  const events = (data ?? []) as OsOrderEvent[];

  const osIds = Array.from(new Set(events.map((event) => event.os_id).filter(Boolean)));
  const userIds = Array.from(new Set(events.map((event) => event.created_by).filter(Boolean))) as string[];

  const [ordersResponse, profilesResponse] = await Promise.all([
    osIds.length
      ? supabase
          .from('os_orders')
          .select('id, sale_number, client_name, title')
          .in('id', osIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (ordersResponse.error) {
    throw new Error(ordersResponse.error.message);
  }

  const orderById = new Map((ordersResponse.data ?? []).map((order) => [order.id, order]));
  const profileById = new Map((profilesResponse.data ?? []).map((profile) => [profile.id, profile]));

  const dataWithRelations = events.map((event) => {
    const payload = event.payload as Record<string, unknown> | null;
    const actorName = typeof payload?.actor_name === 'string' ? payload.actor_name : null;

    return {
      ...event,
      os: orderById.get(event.os_id) ?? null,
      profile: event.created_by
        ? profileById.get(event.created_by) ?? (actorName ? { id: event.created_by, full_name: actorName, email: null } : null)
        : null,
    };
  });

  return { data: dataWithRelations, count: count ?? 0 };
};

export const fetchAuditUsers = async () => {
  const { data: eventUsers, error: eventUsersError } = await supabase
    .from('os_orders_event')
    .select('created_by, payload')
    .not('created_by', 'is', null);

  if (eventUsersError) throw new Error(eventUsersError.message);

  const userIds = Array.from(new Set((eventUsers ?? []).map((event) => event.created_by).filter(Boolean))) as string[];
  if (userIds.length === 0) return [];

  const actorNamesByUserId = new Map<string, string>();
  (eventUsers ?? []).forEach((event) => {
    if (!event.created_by || actorNamesByUserId.has(event.created_by)) return;
    const payload = event.payload as Record<string, unknown> | null;
    const actorName = typeof payload?.actor_name === 'string' ? payload.actor_name : null;
    if (actorName) actorNamesByUserId.set(event.created_by, actorName);
  });

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)
    .order('full_name');

  if (!error && data) {
    return data as { id: string; full_name: string | null; email: string | null }[];
  }

  return userIds.map((id) => ({
    id,
    full_name: actorNamesByUserId.get(id) ?? null,
    email: null,
  }));
};

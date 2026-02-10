import { supabase } from '@/lib/supabase';
import { invokeEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import type { OsOrder, OsOrderEvent } from './types';


export type OptimizeInstallationRoutePayload = {
  date: string;
  orderIds?: string[];
  startAddress?: string;
  endAddress?: string;
  roundtrip?: boolean;
};

export type OptimizeInstallationRouteResponse = {
  date: string;
  provider: 'mapbox';
  limit: {
    maxStops: number;
  };
  route: {
    distance_m: number;
    duration_s: number;
  };
  stops: Array<
    | {
        type: 'start' | 'end';
        address: string;
        lat: number;
        lng: number;
      }
    | {
        type: 'order';
        orderId: string;
        clientName: string;
        address: string;
        lat: number;
        lng: number;
        sequence: number;
      }
  >;
  links: {
    googleMaps: string | null;
    waze: string | null;
  };
  skipped: Array<{
    orderId: string;
    reason: string;
  }>;
};

export const optimizeInstallationRoute = async (payload: OptimizeInstallationRoutePayload) =>
  invokeEdgeFunction<OptimizeInstallationRouteResponse>(supabase, 'optimize-installation-route', payload);

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


type AuditUser = { id: string; full_name: string | null; email: string | null };

type UserDisplayResponse = {
  id: string;
  full_name: string | null;
  email: string | null;
};

const fetchUserDisplayMap = async (userIds: string[]) => {
  if (userIds.length === 0) {
    return new Map<string, AuditUser>();
  }

  const { data, error } = await supabase.rpc('get_user_display_names', { user_ids: userIds });

  if (error || !data) {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds);

    if (profileError) {
      return new Map<string, AuditUser>();
    }

    return new Map(
      (profileData ?? []).map((profile) => [
        profile.id,
        { id: profile.id, full_name: profile.email ?? null, email: profile.email ?? null },
      ])
    );
  }

  return new Map((data as UserDisplayResponse[]).map((user) => [user.id, user as AuditUser]));
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

  const [ordersResponse, usersById] = await Promise.all([
    osIds.length
      ? supabase
          .from('os_orders')
          .select('id, sale_number, client_name, title')
          .in('id', osIds)
      : Promise.resolve({ data: [], error: null }),
    fetchUserDisplayMap(userIds),
  ]);

  if (ordersResponse.error) {
    throw new Error(ordersResponse.error.message);
  }

  const orderById = new Map((ordersResponse.data ?? []).map((order) => [order.id, order]));

  const dataWithRelations = events.map((event) => {
    const payload = event.payload as Record<string, unknown> | null;
    const actorName = typeof payload?.actor_name === 'string' ? payload.actor_name : null;

    return {
      ...event,
      os: orderById.get(event.os_id) ?? null,
      profile: event.created_by
        ? usersById.get(event.created_by) ?? (actorName ? { id: event.created_by, full_name: actorName, email: null } : null)
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

  const usersById = await fetchUserDisplayMap(userIds);

  return userIds
    .map((id) => {
      const user = usersById.get(id);
      return {
        id,
        full_name: user?.full_name ?? actorNamesByUserId.get(id) ?? null,
        email: user?.email ?? null,
      };
    })
    .sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '', 'pt-BR'));
};

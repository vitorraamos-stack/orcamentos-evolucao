import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import type {
  InstallationFeedback,
  OsOrder,
  OsOrderEvent,
  OsOrderLayoutAsset,
} from "./types";
import { findForbiddenConsultorFields, toConsultorUpdatePayload } from './consultorUpdate';

export type OptimizeInstallationRoutePayload = {
  dateFrom?: string | null;
  dateTo?: string | null;
  dateWindowDays?: number;
  geoClusterRadiusKm?: number;
  maxStopsPerRoute?: number;
  startAddress?: string | null;
  startCoords?: [number, number] | null;
  profile?: "driving-car";
  orderIds?: string[] | null;
};

export type OptimizedRouteStop = {
  sequence: number;
  os_id: string;
  address: string | null;
  coords: [number, number];
  delivery_date: string | null;
  client_name: string;
  sale_number: string;
};

export type OptimizeInstallationRouteResponse = {
  paramsUsed: OptimizeInstallationRoutePayload;
  stats: {
    totalCandidates: number;
    geocoded: number;
    notGeocoded: number;
    groups: number;
    routes: number;
  };
  unassigned: Array<{
    os_id: string;
    reason: string;
  }>;
  groups: Array<{
    groupId: string;
    dateRange: { from: string | null; to: string | null };
    centroid: [number, number] | null;
    routes: Array<{
      routeId: string;
      summary: { distance_m: number | null; duration_s: number | null };
      stops: OptimizedRouteStop[];
      googleMapsUrl: string | null;
    }>;
  }>;
};

const callOptimizeInstallationsApi = async (
  token: string,
  payload: OptimizeInstallationRoutePayload
) => {
  const response = await fetch("/api/hub-os/optimize-installations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  return { response, json };
};

export const optimizeInstallationRoute = async (
  payload: OptimizeInstallationRoutePayload
) => {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;

  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token;
  }

  if (!token) throw new Error("Sessão expirada. Faça login novamente.");

  let { response, json } = await callOptimizeInstallationsApi(token, payload);

  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.data.session?.access_token;

    if (refreshedToken) {
      const retry = await callOptimizeInstallationsApi(refreshedToken, payload);
      response = retry.response;
      json = retry.json;
    }
  }

  if (!response.ok) {
    throw new Error(json?.error || "Erro ao otimizar rota.");
  }

  return json as OptimizeInstallationRouteResponse;
};

export const fetchOrders = async () => {
  const { data, error } = await supabase
    .from("os_orders")
    .select("*")
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data as OsOrder[];
};

type FetchOrdersPageParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  artStatus?: string;
  prodStatus?: string;
};

export const fetchOrdersPage = async ({
  page = 1,
  pageSize = 50,
  search,
  artStatus,
  prodStatus,
}: FetchOrdersPageParams = {}) => {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(pageSize, 1), 200);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = supabase
    .from("os_orders")
    .select("*", { count: "exact" })
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (search?.trim()) {
    const term = search.trim();
    query = query.or(
      `sale_number.ilike.%${term}%,client_name.ilike.%${term}%,title.ilike.%${term}%`
    );
  }
  if (artStatus) query = query.eq("art_status", artStatus);
  if (prodStatus) query = query.eq("prod_status", prodStatus);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as OsOrder[],
    count: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
};

export const fetchAvisadoOrderIds = async (orderIds: string[]) => {
  if (orderIds.length === 0) return [] as string[];

  const { data, error } = await supabase
    .from("os_orders_event")
    .select("os_id, payload, created_at")
    .eq("type", "avisado_toggle")
    .in("os_id", orderIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const avisadoIds: string[] = [];

  for (const event of data ?? []) {
    const osId = typeof event.os_id === "string" ? event.os_id : null;
    if (!osId || seen.has(osId)) continue;
    seen.add(osId);

    const payload = event.payload;
    const avisado =
      payload &&
      typeof payload === "object" &&
      "avisado" in payload &&
      (payload as { avisado?: unknown }).avisado === true;

    if (avisado) avisadoIds.push(osId);
  }

  return avisadoIds;
};

export const fetchOrderById = async (id: string) => {
  const { data, error } = await supabase
    .from("os_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data as OsOrder;
};

export const fetchLatestOrderLayout = async (orderId: string) => {
  const { data, error } = await supabase
    .from("os_order_assets")
    .select(
      "id, os_id, asset_type, object_path, original_name, mime_type, size_bytes, storage_provider, storage_bucket, bucket, uploaded_at"
    )
    .eq("os_id", orderId)
    .eq("asset_type", "LAYOUT")
    .is("deleted_from_storage_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    return data as OsOrderLayoutAsset;
  }

  const { data: latestLayoutEvent, error: layoutEventError } = await supabase
    .from("os_orders_event")
    .select("payload, created_at")
    .eq("os_id", orderId)
    .eq("type", "layout_uploaded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (layoutEventError) {
    if (error) throw new Error(error.message);
    throw new Error(layoutEventError.message);
  }

  if (!latestLayoutEvent?.payload || typeof latestLayoutEvent.payload !== "object") {
    if (error) throw new Error(error.message);
    return null;
  }

  const payload = latestLayoutEvent.payload as Record<string, unknown>;
  const objectPath =
    typeof payload.object_path === "string" ? payload.object_path : null;
  if (!objectPath) {
    if (error) throw new Error(error.message);
    return null;
  }

  return {
    id: typeof payload.asset_id === "string" ? payload.asset_id : `${orderId}-layout-event`,
    os_id: orderId,
    asset_type: "LAYOUT",
    object_path: objectPath,
    original_name:
      typeof payload.filename === "string" ? payload.filename : null,
    mime_type: null,
    size_bytes: null,
    storage_provider: "r2",
    storage_bucket: null,
    bucket: null,
    uploaded_at: latestLayoutEvent.created_at,
  } satisfies OsOrderLayoutAsset;
};

export const fetchOrderAssetDownloadUrl = async (
  objectPath: string,
  filename?: string
) => {
  const data = await invokeEdgeFunction<{ downloadUrl: string }>(
    supabase,
    "r2-presign-download",
    {
      key: objectPath,
      filename,
    }
  );

  if (!data?.downloadUrl) {
    throw new Error("Falha ao gerar URL de download.");
  }

  return data.downloadUrl;
};

export const createOrder = async (payload: Partial<OsOrder>) => {
  const { data, error } = await supabase.rpc("hub_os_create_order_secure", {
    p_payload: payload,
  });

  if (error) throw new Error(error.message);
  return data as OsOrder;
};

const loadCurrentUserRole = async () => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Usuário não autenticado.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError) {
    throw new Error(profileError.message);
  }

  return String(profile.role ?? '');
};

type OrderEventInput = {
  type: string;
  payload?: Record<string, unknown> | null;
};

export const updateOrder = async (
  id: string,
  payload: Partial<OsOrder>,
  event?: OrderEventInput
) => {
  const role = await loadCurrentUserRole();

  if (role === 'consultor' || role === 'consultor_vendas') {
    const forbiddenFields = findForbiddenConsultorFields(payload);
    if (forbiddenFields.length > 0) {
      throw new Error(
        `Campos não permitidos para consultor: ${forbiddenFields.join(', ')}.`
      );
    }

    const { data, error } = await supabase.rpc('update_os_order_consultor', {
      p_os_id: id,
      p_payload: toConsultorUpdatePayload(payload),
    });

    if (error) throw new Error(error.message);
    return data as OsOrder;
  }

  const { data, error } = await supabase.rpc("hub_os_update_order_secure", {
    p_os_id: id,
    p_patch: payload,
    p_event_type: event?.type ?? null,
    p_event_payload: event?.payload ?? null,
  });

  if (error) throw new Error(error.message);
  return data as OsOrder;
};

export const archiveOrder = async (id: string, actorName?: string | null) => {
  const { data, error } = await supabase.rpc("hub_os_archive_order_secure", {
    p_os_id: id,
    p_reason: "manual_archive",
    p_payload: actorName ? { actor_name: actorName } : {},
  });

  if (error) throw new Error(error.message);
  return data as OsOrder;
};

export const deleteOrder = async (id: string, actorName?: string | null) => {
  const { error } = await supabase.rpc("hub_os_delete_order_secure", {
    p_os_id: id,
    p_reason: "manual_delete",
    p_payload: actorName ? { actor_name: actorName } : {},
  });

  if (error) throw new Error(error.message);
};

export const createOrderEvent = async (payload: Partial<OsOrderEvent>) => {
  const { data, error } = await supabase
    .from("os_orders_event")
    .insert(payload)
    .select("*")
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

  const { data, error } = await supabase.rpc("get_user_display_names", {
    user_ids: userIds,
  });

  if (error || !data) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    if (profileError) {
      return new Map<string, AuditUser>();
    }

    return new Map(
      (profileData ?? []).map(profile => [
        profile.id,
        {
          id: profile.id,
          full_name: profile.email ?? null,
          email: profile.email ?? null,
        },
      ])
    );
  }

  return new Map(
    (data as UserDisplayResponse[]).map(user => [user.id, user as AuditUser])
  );
};

export const fetchUserDisplayNameById = async (userId: string | null) => {
  if (!userId) return null;
  const usersById = await fetchUserDisplayMap([userId]);
  const user = usersById.get(userId);
  return user?.full_name || user?.email || user?.id || null;
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
      .from("os_orders")
      .select("id")
      .or(
        `sale_number.ilike.%${search}%,client_name.ilike.%${search}%,title.ilike.%${search}%`
      );

    if (error) throw new Error(error.message);
    targetIds = (data ?? []).map(item => item.id);
    if (targetIds.length === 0) {
      return { data: [] as OsOrderEvent[], count: 0 };
    }
  }

  let query = supabase
    .from("os_orders_event")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (targetIds) {
    query = query.in("os_id", targetIds);
  }
  if (type) {
    query = query.eq("type", type);
  }
  if (userId) {
    query = query.eq("created_by", userId);
  }
  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const events = (data ?? []) as OsOrderEvent[];

  const osIds = Array.from(
    new Set(events.map(event => event.os_id).filter(Boolean))
  );
  const userIds = Array.from(
    new Set(events.map(event => event.created_by).filter(Boolean))
  ) as string[];

  const [ordersResponse, usersById] = await Promise.all([
    osIds.length
      ? supabase
          .from("os_orders")
          .select("id, sale_number, client_name, title")
          .in("id", osIds)
      : Promise.resolve({ data: [], error: null }),
    fetchUserDisplayMap(userIds),
  ]);

  if (ordersResponse.error) {
    throw new Error(ordersResponse.error.message);
  }

  const orderById = new Map(
    (ordersResponse.data ?? []).map(order => [order.id, order])
  );

  const dataWithRelations = events.map(event => {
    const payload = event.payload as Record<string, unknown> | null;
    const actorName =
      typeof payload?.actor_name === "string" ? payload.actor_name : null;

    return {
      ...event,
      os: orderById.get(event.os_id) ?? null,
      profile: event.created_by
        ? (usersById.get(event.created_by) ??
          (actorName
            ? { id: event.created_by, full_name: actorName, email: null }
            : null))
        : null,
    };
  });

  return { data: dataWithRelations, count: count ?? 0 };
};

export const fetchAuditUsers = async () => {
  const { data: eventUsers, error: eventUsersError } = await supabase
    .from("os_orders_event")
    .select("created_by, payload")
    .not("created_by", "is", null);

  if (eventUsersError) throw new Error(eventUsersError.message);

  const userIds = Array.from(
    new Set((eventUsers ?? []).map(event => event.created_by).filter(Boolean))
  ) as string[];
  if (userIds.length === 0) return [];

  const actorNamesByUserId = new Map<string, string>();
  (eventUsers ?? []).forEach(event => {
    if (!event.created_by || actorNamesByUserId.has(event.created_by)) return;
    const payload = event.payload as Record<string, unknown> | null;
    const actorName =
      typeof payload?.actor_name === "string" ? payload.actor_name : null;
    if (actorName) actorNamesByUserId.set(event.created_by, actorName);
  });

  const usersById = await fetchUserDisplayMap(userIds);

  return userIds
    .map(id => {
      const user = usersById.get(id);
      return {
        id,
        full_name: user?.full_name ?? actorNamesByUserId.get(id) ?? null,
        email: user?.email ?? null,
      };
    })
    .sort((a, b) =>
      (a.full_name ?? a.email ?? "").localeCompare(
        b.full_name ?? b.email ?? "",
        "pt-BR"
      )
    );
};


export const fetchInstallationFeedbacks = async () => {
  const { data, error } = await supabase.rpc("installation_feedbacks_list_secure");

  if (error) throw new Error(error.message);
  return (data ?? []) as InstallationFeedback[];
};

import { createClient } from "@supabase/supabase-js";

type OptimizePayload = {
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

type OsCandidate = {
  id: string;
  sale_number: string;
  client_name: string;
  delivery_date: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  updated_at: string;
  address_geocoded_at: string | null;
  address_geocode_provider: string | null;
};

type GeocodedStop = {
  os: OsCandidate;
  coords: [number, number];
};

const ORS_BASE_URL = "https://api.openrouteservice.org";
const ORS_TIMEOUT_MS = 15000;
const MAX_REQUEST_BODY_BYTES = 128 * 1024;
const MAX_ORDER_IDS = 200;
const MAX_CANDIDATES = 300;
const MAX_DATE_WINDOW_DAYS = 14;
const MAX_GEO_CLUSTER_RADIUS_KM = 80;
const MAX_STOPS_PER_ROUTE = 30;
const MIN_GEO_CLUSTER_RADIUS_KM = 0.1;
const MIN_MAX_STOPS_PER_ROUTE = 1;

class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

class TimeoutExternalError extends Error {
  stage: string;
  constructor(stage: string, message: string) {
    super(message);
    this.name = "TimeoutExternalError";
    this.stage = stage;
  }
}

class ExternalServiceError extends Error {
  stage: string;
  constructor(stage: string, message: string) {
    super(message);
    this.name = "ExternalServiceError";
    this.stage = stage;
  }
}

const normalizeRole = (role?: string | null) => {
  if (!role) return null;
  if (role === "admin") return "gerente";
  if (role === "consultor") return "consultor_vendas";
  return role;
};

function json(res: any, status: number, payload: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function resolveBodySizeBytes(body: unknown) {
  if (typeof body === "string") {
    return Buffer.byteLength(body, "utf-8");
  }
  if (body === null || body === undefined) {
    return 0;
  }
  return Buffer.byteLength(JSON.stringify(body), "utf-8");
}

function normalizeAddress(address: string) {
  return address.trim().replace(/\s+/g, " ");
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isParsableIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function haversineDistanceKm(a: [number, number], b: [number, number]) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const originLat = toRad(lat1);
  const destinationLat = toRad(lat2);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return 6371 * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function centroid(points: [number, number][]) {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, point) => {
      acc[0] += point[0];
      acc[1] += point[1];
      return acc;
    },
    [0, 0]
  );
  return [sum[0] / points.length, sum[1] / points.length] as [number, number];
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function estimateSummaryFromStops(
  stops: Array<{ coords: [number, number] }>,
  startCoords?: [number, number] | null
) {
  if (stops.length === 0) {
    return { distance_m: 0, duration_s: 0 };
  }

  let totalKm = 0;
  let cursor = startCoords ?? stops[0].coords;
  const fromIndex = startCoords ? 0 : 1;

  for (let index = fromIndex; index < stops.length; index += 1) {
    const target = stops[index].coords;
    totalKm += haversineDistanceKm(cursor, target);
    cursor = target;
  }

  const avgSpeedKmh = 35;
  const durationHours = totalKm / avgSpeedKmh;
  return {
    distance_m: Math.round(totalKm * 1000),
    duration_s: Math.round(durationHours * 3600),
  };
}

function buildGoogleMapsUrl(
  stops: Array<{ coords: [number, number] }>,
  startCoords?: [number, number] | null
) {
  if (stops.length === 0) return null;

  if (!startCoords && stops.length === 1) {
    const [lng, lat] = stops[0].coords;
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", `${lat},${lng}`);
    return url.toString();
  }

  const origin = startCoords ?? stops[0].coords;
  const destination = stops[stops.length - 1].coords;

  // With explicit start we can keep all stops except destination as waypoints.
  // Without explicit start, first stop is the origin and must not be duplicated in waypoints.
  const waypointStops = startCoords
    ? stops.slice(0, -1)
    : stops.slice(1, -1);

  const waypoints = waypointStops.map(
    stop => `${stop.coords[1]},${stop.coords[0]}`
  );

  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${origin[1]},${origin[0]}`);
  url.searchParams.set("destination", `${destination[1]},${destination[0]}`);
  if (waypoints.length > 0) {
    url.searchParams.set("waypoints", waypoints.join("|"));
  }
  return url.toString();
}

function parseRequestBody(
  body: unknown
): Required<Omit<OptimizePayload, "startAddress" | "startCoords">> &
  Pick<OptimizePayload, "startAddress" | "startCoords"> {
  if (body !== null && typeof body !== "string" && typeof body !== "object") {
    throw new InputValidationError("Payload inválido. Envie um objeto JSON.");
  }

  const bodySizeBytes = resolveBodySizeBytes(body);
  if (bodySizeBytes > MAX_REQUEST_BODY_BYTES) {
    throw new InputValidationError(
      `Payload excede o limite de ${MAX_REQUEST_BODY_BYTES} bytes.`
    );
  }

  const payload = (
    typeof body === "string" ? JSON.parse(body || "{}") : body || {}
  ) as OptimizePayload;

  if (
    payload.dateFrom !== undefined &&
    payload.dateFrom !== null &&
    (!isValidDate(payload.dateFrom) || !isParsableIsoDate(payload.dateFrom))
  ) {
    throw new InputValidationError("dateFrom inválida. Use YYYY-MM-DD.");
  }
  if (
    payload.dateTo !== undefined &&
    payload.dateTo !== null &&
    (!isValidDate(payload.dateTo) || !isParsableIsoDate(payload.dateTo))
  ) {
    throw new InputValidationError("dateTo inválida. Use YYYY-MM-DD.");
  }

  if (payload.dateFrom && payload.dateTo && payload.dateFrom > payload.dateTo) {
    throw new InputValidationError("dateFrom deve ser menor ou igual a dateTo.");
  }

  const dateWindowDays = Number(payload.dateWindowDays ?? 1);
  const geoClusterRadiusKm = Number(payload.geoClusterRadiusKm ?? 5);
  const maxStopsPerRoute = Number(payload.maxStopsPerRoute ?? 20);
  if (payload.orderIds !== undefined && payload.orderIds !== null && !Array.isArray(payload.orderIds)) {
    throw new InputValidationError("orderIds inválido. Use array de strings.");
  }

  if (payload.startAddress !== undefined && payload.startAddress !== null && typeof payload.startAddress !== "string") {
    throw new InputValidationError("startAddress inválido. Use string.");
  }

  const orderIds = Array.isArray(payload.orderIds)
    ? Array.from(
        new Set(
          payload.orderIds
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter((value) => value.length > 0)
        )
      )
    : null;

  if (!Number.isFinite(dateWindowDays) || dateWindowDays < 0 || dateWindowDays > MAX_DATE_WINDOW_DAYS) {
    throw new InputValidationError(
      `dateWindowDays inválido. Use valor entre 0 e ${MAX_DATE_WINDOW_DAYS}.`
    );
  }

  if (
    !Number.isFinite(geoClusterRadiusKm) ||
    geoClusterRadiusKm < MIN_GEO_CLUSTER_RADIUS_KM ||
    geoClusterRadiusKm > MAX_GEO_CLUSTER_RADIUS_KM
  ) {
    throw new InputValidationError(
      `geoClusterRadiusKm inválido. Use valor entre ${MIN_GEO_CLUSTER_RADIUS_KM} e ${MAX_GEO_CLUSTER_RADIUS_KM}.`
    );
  }

  if (
    !Number.isFinite(maxStopsPerRoute) ||
    maxStopsPerRoute < MIN_MAX_STOPS_PER_ROUTE ||
    maxStopsPerRoute > MAX_STOPS_PER_ROUTE
  ) {
    throw new InputValidationError(
      `maxStopsPerRoute inválido. Use valor entre ${MIN_MAX_STOPS_PER_ROUTE} e ${MAX_STOPS_PER_ROUTE}.`
    );
  }

  if (orderIds && orderIds.length > MAX_ORDER_IDS) {
    throw new InputValidationError(
      `orderIds excede o limite de ${MAX_ORDER_IDS} itens. Filtre por data ou envie lotes menores.`
    );
  }

  if (
    payload.startCoords &&
    (!Array.isArray(payload.startCoords) ||
      payload.startCoords.length !== 2 ||
      !payload.startCoords.every((value) => Number.isFinite(value)))
  ) {
    throw new InputValidationError("startCoords inválido. Use [longitude, latitude].");
  }

  if (payload.startCoords) {
    const [lng, lat] = payload.startCoords;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new InputValidationError("startCoords fora do intervalo permitido de longitude/latitude.");
    }
  }

  return {
    dateFrom: payload.dateFrom ?? null,
    dateTo: payload.dateTo ?? null,
    dateWindowDays,
    geoClusterRadiusKm,
    maxStopsPerRoute,
    startAddress: payload.startAddress ?? null,
    startCoords: payload.startCoords ?? null,
    profile: "driving-car",
    orderIds,
  };
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = ORS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutExternalError("external", `Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const getElapsedMs = (startedAt: number) => Date.now() - startedAt;

async function requireAdminAuth(req: any, res: any, supabaseAdmin: any) {
  const authHeader = (req.headers?.authorization ||
    req.headers?.Authorization ||
    "") as string;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    json(res, 401, { stage: "auth", error: "Token não fornecido." });
    return null;
  }

  const { data: userData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) {
    json(res, 401, { stage: "auth", error: "Usuário não autenticado." });
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    json(res, 403, { stage: "auth", error: "Não foi possível validar permissões." });
    return null;
  }

  const profileRole =
    (profile as { role?: string | null } | null)?.role ?? null;
  if (normalizeRole(profileRole) !== "gerente") {
    json(res, 403, { stage: "auth", error: "Acesso negado. Apenas gerente." });
    return null;
  }

  return user;
}

async function geocodeORS(
  text: string,
  orsApiKey: string,
  focusCoords?: [number, number] | null
) {
  const geocodeStartedAt = Date.now();
  const normalized = normalizeAddress(text);
  const queries = [normalized, `${normalized}, Brasil`];

  let bestCoords: [number, number] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const queryText of queries) {
    const url = new URL(`${ORS_BASE_URL}/geocode/search`);
    url.searchParams.set("api_key", orsApiKey);
    url.searchParams.set("text", queryText);
    url.searchParams.set("boundary.country", "BR");
    url.searchParams.set("size", "5");
    url.searchParams.set("layers", "address,venue,street");
    if (focusCoords) {
      url.searchParams.set("focus.point.lon", String(focusCoords[0]));
      url.searchParams.set("focus.point.lat", String(focusCoords[1]));
    }

    const response = await fetchWithTimeout(url.toString(), { method: "GET" });
    if (!response.ok) {
      throw new ExternalServiceError("geocode", `ORS geocode failed (${response.status})`);
    }

    const data = (await response.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { confidence?: number };
      }>;
    };

    for (const feature of data.features ?? []) {
      const coords = feature.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;

      const confidence = feature.properties?.confidence ?? 0;
      const distancePenalty =
        focusCoords ? haversineDistanceKm(focusCoords, coords) * 0.5 : 0;
      const score = confidence * 100 - distancePenalty;

      if (score > bestScore) {
        bestScore = score;
        bestCoords = coords;
      }
    }
  }

  if (!bestCoords) {
    throw new ExternalServiceError("geocode", "ORS geocode did not return coordinates");
  }

  console.log("[hub-os/optimize-installations]", {
    stage: "geocode",
    durationMs: getElapsedMs(geocodeStartedAt),
  });
  return bestCoords;
}

function groupByDateWindow(stops: GeocodedStop[], dateWindowDays: number) {
  const ordered = [...stops].sort((a, b) => {
    const dayA = a.os.delivery_date ?? "9999-99-99";
    const dayB = b.os.delivery_date ?? "9999-99-99";
    return dayA.localeCompare(dayB);
  });

  const buckets: GeocodedStop[][] = [];
  let current: GeocodedStop[] = [];
  let anchorDate: Date | null = null;

  for (const stop of ordered) {
    if (!stop.os.delivery_date) {
      current.push(stop);
      continue;
    }

    const stopDate = new Date(`${stop.os.delivery_date}T00:00:00`);
    if (!anchorDate) {
      anchorDate = stopDate;
      current.push(stop);
      continue;
    }

    const diffDays = Math.floor(
      (stopDate.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays <= dateWindowDays) {
      current.push(stop);
    } else {
      buckets.push(current);
      current = [stop];
      anchorDate = stopDate;
    }
  }

  if (current.length > 0) buckets.push(current);
  return buckets;
}

function clusterByGeoRadius(stops: GeocodedStop[], radiusKm: number) {
  const remaining = [...stops];
  const clusters: GeocodedStop[][] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift();
    if (!seed) break;

    const cluster = [seed];
    let changed = true;

    while (changed) {
      changed = false;
      for (let i = remaining.length - 1; i >= 0; i -= 1) {
        const candidate = remaining[i];
        const isClose = cluster.some(
          member =>
            haversineDistanceKm(member.coords, candidate.coords) <= radiusKm
        );
        if (isClose) {
          cluster.push(candidate);
          remaining.splice(i, 1);
          changed = true;
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function nearestNeighborFallback(
  stops: GeocodedStop[],
  startCoords?: [number, number] | null
) {
  const pending = [...stops];
  const route: GeocodedStop[] = [];
  let currentPoint = startCoords ?? pending[0]?.coords;

  while (pending.length > 0 && currentPoint) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < pending.length; i += 1) {
      const distance = haversineDistanceKm(currentPoint, pending[i].coords);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    const [next] = pending.splice(bestIndex, 1);
    route.push(next);
    currentPoint = next.coords;
  }

  return route;
}

function buildOptimizationPayload(
  stops: GeocodedStop[],
  startCoords?: [number, number] | null
) {
  const jobs = stops.map((stop, index) => ({
    id: index + 1,
    location: stop.coords,
    service: 300,
  }));

  return {
    jobs,
    vehicles: [
      {
        id: 1,
        profile: "driving-car",
        ...(startCoords ? { start: startCoords, end: startCoords } : {}),
      },
    ],
  };
}

async function optimizeWithORS(
  stops: GeocodedStop[],
  orsApiKey: string,
  startCoords?: [number, number] | null
) {
  const optimizationStartedAt = Date.now();
  const payload = buildOptimizationPayload(stops, startCoords);
  const jobs = payload.jobs;

  const url = new URL(`${ORS_BASE_URL}/optimization`);
  url.searchParams.set("api_key", orsApiKey);

  const response = await fetchWithTimeout(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ExternalServiceError("optimization", `ORS optimization failed (${response.status})`);
  }

  const data = (await response.json()) as {
    routes?: Array<{
      summary?: { distance?: number; duration?: number };
      steps?: Array<{ type?: string; job?: number }>;
    }>;
  };

  const route = data.routes?.[0];
  const jobOrder = (route?.steps ?? [])
    .filter(step => typeof step.job === "number")
    .map(step => step.job as number);

  if (jobOrder.length === 0) {
    return {
      orderedStops: nearestNeighborFallback(stops, startCoords),
      summary: estimateSummaryFromStops(stops, startCoords),
      source: "fallback",
    };
  }

  const byJobId = new Map(jobs.map((job, index) => [job.id, stops[index]]));
  const orderedStops = jobOrder
    .map(jobId => byJobId.get(jobId))
    .filter(Boolean) as GeocodedStop[];

  console.log("[hub-os/optimize-installations]", {
    stage: "optimization",
    durationMs: getElapsedMs(optimizationStartedAt),
    totalStops: stops.length,
  });

  return {
    orderedStops,
    summary: {
      distance_m: route?.summary?.distance ?? null,
      duration_s: route?.summary?.duration ?? null,
    },
    source: "ors",
  };
}


async function fetchDirectionsSummary(
  coordinates: Array<[number, number]>,
  profile: string,
  orsApiKey: string
) {
  if (coordinates.length < 2) return null;
  const startedAt = Date.now();

  const url = new URL(`${ORS_BASE_URL}/v2/directions/${profile}`);
  url.searchParams.set('api_key', orsApiKey);

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates,
      instructions: false,
    }),
  });

  if (!response.ok) {
    throw new ExternalServiceError("directions_summary", `ORS directions failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    routes?: Array<{ summary?: { distance?: number; duration?: number } }>;
  };

  const summary = payload.routes?.[0]?.summary;
  if (!summary) return null;

  const summaryData = {
    distance_m: typeof summary.distance === 'number' ? summary.distance : null,
    duration_s: typeof summary.duration === 'number' ? summary.duration : null,
  };

  console.log("[hub-os/optimize-installations]", {
    stage: "directions_summary",
    durationMs: getElapsedMs(startedAt),
    coordinates: coordinates.length,
  });

  return summaryData;
}

export default async function handler(req: any, res: any) {
  const startedAt = Date.now();

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const orsApiKey = process.env.ORS_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !orsApiKey) {
    return json(res, 500, {
      error:
        "Configuração inválida: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e ORS_API_KEY são obrigatórias.",
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const currentUser = await requireAdminAuth(req, res, supabaseAdmin);
  if (!currentUser) return;

  let parsed: ReturnType<typeof parseRequestBody>;
  try {
    parsed = parseRequestBody(req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payload inválido.";
    const status = /excede o limite/i.test(message) ? 413 : 400;
    return json(res, status, {
      stage: "input",
      error: message,
    });
  }

  let resolvedStartCoords = parsed.startCoords;
  if (!resolvedStartCoords && parsed.startAddress) {
    try {
      resolvedStartCoords = await geocodeORS(parsed.startAddress, orsApiKey, null);
    } catch (error) {
      console.warn("[hub-os/optimize-installations] start geocode failed", {
        stage: "geocode_start",
        message: error instanceof Error ? error.message : "unknown",
      });
      const timeout = error instanceof TimeoutExternalError;
      return json(res, timeout ? 504 : 400, {
        stage: "geocode",
        error: timeout
          ? "Timeout ao geocodificar o ponto de partida."
          : "Não foi possível geocodificar o ponto de partida informado.",
      });
    }
  }

  try {
    let query = supabaseAdmin
      .from("os_orders")
      .select(
        "id, sale_number, client_name, delivery_date, address, address_lat, address_lng, updated_at, address_geocoded_at, address_geocode_provider"
      )
      .eq("logistic_type", "instalacao")
      .eq("archived", false)
      .order("delivery_date", { ascending: true });

    if (parsed.dateFrom) query = query.gte("delivery_date", parsed.dateFrom);
    if (parsed.dateTo) query = query.lte("delivery_date", parsed.dateTo);
    if (parsed.orderIds && parsed.orderIds.length > 0) {
      query = query.in("id", parsed.orderIds);
    }

    const { data: rows, error: queryError } = await query;
    if (queryError) {
      return json(res, 500, { stage: "db_query", error: queryError.message });
    }

    const orders = (rows ?? []) as OsCandidate[];
    if (orders.length > MAX_CANDIDATES) {
      return json(res, 422, {
        stage: "input",
        error: `Consulta retornou ${orders.length} OS. Limite de ${MAX_CANDIDATES} por chamada. Filtre por data/OS.`,
      });
    }
    const geocodeCache = new Map<string, [number, number]>();
    const geocodeMetrics = { totalCalls: 0, cacheHits: 0, externalMs: 0 };
    const geocoded: GeocodedStop[] = [];
    const unassigned: Array<{ os_id: string; reason: string }> = [];

    const resolveGeocode = async (
      order: OsCandidate
    ): Promise<[number, number] | null> => {
      const address = order.address ? normalizeAddress(order.address) : "";
      if (!address) {
        unassigned.push({ os_id: order.id, reason: "missing_address" });
        return null;
      }

      const cached = geocodeCache.get(address);
      if (cached) {
        geocodeMetrics.cacheHits += 1;
        return cached;
      }

      const geocodeIsCurrent =
        order.address_geocode_provider === "openrouteservice" &&
        order.address_geocoded_at &&
        (!order.updated_at ||
          new Date(order.address_geocoded_at).getTime() >=
            new Date(order.updated_at).getTime());

      if (
        geocodeIsCurrent &&
        order.address_lng !== null &&
        order.address_lat !== null
      ) {
        const cachedCoords: [number, number] = [order.address_lng, order.address_lat];
        geocodeCache.set(address, cachedCoords);
        return cachedCoords;
      }

      try {
        const geocodeStartedAt = Date.now();
        const coords = await geocodeORS(address, orsApiKey, resolvedStartCoords);
        geocodeMetrics.totalCalls += 1;
        geocodeMetrics.externalMs += getElapsedMs(geocodeStartedAt);
        geocodeCache.set(address, coords);

        const { error: updateGeocodeError } = await supabaseAdmin
          .from("os_orders")
          .update({
            address_lat: coords[1],
            address_lng: coords[0],
            address_geocoded_at: new Date().toISOString(),
            address_geocode_provider: "openrouteservice",
          })
          .eq("id", order.id);
        if (updateGeocodeError) {
          console.warn("[hub-os/optimize-installations] geocode cache update failed", {
            stage: "db_update",
            osId: order.id,
            message: updateGeocodeError.message,
          });
        }

        return coords;
      } catch (error) {
        if (error instanceof TimeoutExternalError) {
          unassigned.push({ os_id: order.id, reason: "geocode_timeout" });
          return null;
        }
        if (order.address_lng !== null && order.address_lat !== null) {
          return [order.address_lng, order.address_lat];
        }
        unassigned.push({ os_id: order.id, reason: "geocode_failed" });
        return null;
      }
    };

    for (const order of orders) {
      const coords = await resolveGeocode(order);
      if (!coords) continue;
      geocoded.push({ os: order, coords });
    }

    const dateBuckets = groupByDateWindow(geocoded, parsed.dateWindowDays);
    const groups: Array<{
      groupId: string;
      dateRange: { from: string | null; to: string | null };
      centroid: [number, number] | null;
      routes: Array<{
        routeId: string;
        summary: { distance_m: number | null; duration_s: number | null };
        stops: Array<{
          sequence: number;
          os_id: string;
          address: string | null;
          coords: [number, number];
          delivery_date: string | null;
          client_name: string;
          sale_number: string;
        }>;
        googleMapsUrl: string | null;
      }>;
    }> = [];

    let totalRoutes = 0;

    for (let dateIndex = 0; dateIndex < dateBuckets.length; dateIndex += 1) {
      const bucket = dateBuckets[dateIndex];
      const geoClusters = clusterByGeoRadius(bucket, parsed.geoClusterRadiusKm);

      for (
        let clusterIndex = 0;
        clusterIndex < geoClusters.length;
        clusterIndex += 1
      ) {
        const cluster = geoClusters[clusterIndex];
        const chunks = chunkArray(cluster, parsed.maxStopsPerRoute);
        const groupId = `date-${dateIndex + 1}__geo-${clusterIndex + 1}`;

        const dates = cluster
          .map(item => item.os.delivery_date)
          .filter(Boolean) as string[];
        const fromDate = dates.length > 0 ? dates.slice().sort()[0] : null;
        const toDate =
          dates.length > 0 ? dates.slice().sort()[dates.length - 1] : null;

        const groupRoutes: Array<{
          routeId: string;
          summary: { distance_m: number | null; duration_s: number | null };
          stops: Array<{
            sequence: number;
            os_id: string;
            address: string | null;
            coords: [number, number];
            delivery_date: string | null;
            client_name: string;
            sale_number: string;
          }>;
          googleMapsUrl: string | null;
        }> = [];

        for (let routeIndex = 0; routeIndex < chunks.length; routeIndex += 1) {
          const routeStops = chunks[routeIndex];
          let optimized;

          try {
            optimized = await optimizeWithORS(
              routeStops,
              orsApiKey,
              resolvedStartCoords
            );
          } catch {
            optimized = {
              orderedStops: nearestNeighborFallback(
                routeStops,
                resolvedStartCoords
              ),
              summary: estimateSummaryFromStops(routeStops, resolvedStartCoords),
              source: "fallback",
            };
          }

          const stops = optimized.orderedStops.map((item, index) => ({
            sequence: index + 1,
            os_id: item.os.id,
            address: item.os.address,
            coords: item.coords,
            delivery_date: item.os.delivery_date,
            client_name: item.os.client_name,
            sale_number: item.os.sale_number,
          }));

          const estimatedSummary = estimateSummaryFromStops(
            stops,
            resolvedStartCoords
          );

          const directionsCoordinates = [
            ...(resolvedStartCoords ? [resolvedStartCoords] : []),
            ...stops.map(stop => stop.coords),
          ];

          let directionsSummary: { distance_m: number | null; duration_s: number | null } | null = null;
          if (optimized.summary.distance_m !== null && optimized.summary.duration_s !== null) {
            directionsSummary = optimized.summary;
          } else {
            try {
              directionsSummary = await fetchDirectionsSummary(
                directionsCoordinates,
                parsed.profile,
                orsApiKey
              );
            } catch (error) {
              const fallbackReason = error instanceof TimeoutExternalError ? "directions_timeout" : "directions_unavailable";
              console.warn("[hub-os/optimize-installations] directions summary failed", {
                stage: "directions_summary",
                fallbackReason,
                message: error instanceof Error ? error.message : "unknown",
              });
            }
          }

          groupRoutes.push({
            routeId: `${groupId}#${routeIndex + 1}`,
            summary: {
              distance_m:
                optimized.summary.distance_m ??
                directionsSummary?.distance_m ??
                estimatedSummary.distance_m,
              duration_s:
                optimized.summary.duration_s ??
                directionsSummary?.duration_s ??
                estimatedSummary.duration_s,
            },
            stops,
            googleMapsUrl: buildGoogleMapsUrl(stops, resolvedStartCoords),
          });
          totalRoutes += 1;
        }

        groups.push({
          groupId,
          dateRange: { from: fromDate, to: toDate },
          centroid: centroid(cluster.map(item => item.coords)),
          routes: groupRoutes,
        });
      }
    }

    const { error: eventError } = await supabaseAdmin.from("os_orders_event").insert({
      os_id: geocoded[0]?.os.id ?? orders[0]?.id,
      type: "route_optimized",
      created_by: currentUser.id,
      payload: {
        paramsUsed: { ...parsed, startCoords: resolvedStartCoords ?? null },
        totalCandidates: orders.length,
        geocoded: geocoded.length,
        unassigned: unassigned.length,
        groups: groups.length,
        routes: totalRoutes,
      },
    });
    if (eventError) {
      console.warn("[hub-os/optimize-installations] route_optimized event insert failed", {
        stage: "db_update",
        message: eventError.message,
      });
    }

    const elapsedMs = Date.now() - startedAt;
    console.log("[hub-os/optimize-installations]", {
      totalCandidates: orders.length,
      geocoded: geocoded.length,
      optimized: geocoded.length - unassigned.length,
      groups: groups.length,
      routes: totalRoutes,
      geocodeCalls: geocodeMetrics.totalCalls,
      geocodeCacheHits: geocodeMetrics.cacheHits,
      geocodeExternalMs: geocodeMetrics.externalMs,
      elapsedMs,
    });

    return json(res, 200, {
      paramsUsed: { ...parsed, startCoords: resolvedStartCoords ?? null },
      stats: {
        totalCandidates: orders.length,
        geocoded: geocoded.length,
        notGeocoded: unassigned.length,
        groups: groups.length,
        routes: totalRoutes,
      },
      unassigned,
      groups,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    const isTimeout = error instanceof TimeoutExternalError;
    const stage = error instanceof ExternalServiceError || error instanceof TimeoutExternalError ? error.stage : "optimization";
    return json(res, isTimeout ? 504 : 502, {
      stage,
      error: `Falha na otimização ORS: ${message}`,
    });
  }
}

export {
  normalizeAddress,
  haversineDistanceKm,
  clusterByGeoRadius,
  buildGoogleMapsUrl,
  buildOptimizationPayload,
  estimateSummaryFromStops,
  parseRequestBody,
  fetchWithTimeout,
  TimeoutExternalError,
};

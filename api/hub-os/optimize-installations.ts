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
};

type OsCandidate = {
  id: string;
  sale_number: string;
  client_name: string;
  delivery_date: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
};

type GeocodedStop = {
  os: OsCandidate;
  coords: [number, number];
};

const ORS_BASE_URL = "https://api.openrouteservice.org";

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

function normalizeAddress(address: string) {
  return address.trim().replace(/\s+/g, " ");
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function buildGoogleMapsUrl(
  stops: Array<{ coords: [number, number] }>,
  startCoords?: [number, number] | null
) {
  if (stops.length === 0) return null;

  const origin = startCoords ?? stops[0].coords;
  const destination = stops[stops.length - 1].coords;
  const waypoints = stops
    .slice(0, -1)
    .map(stop => `${stop.coords[1]},${stop.coords[0]}`);

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
  const payload = (
    typeof body === "string" ? JSON.parse(body || "{}") : body || {}
  ) as OptimizePayload;

  if (
    payload.dateFrom !== undefined &&
    payload.dateFrom !== null &&
    !isValidDate(payload.dateFrom)
  ) {
    throw new Error("dateFrom inválida. Use YYYY-MM-DD.");
  }
  if (
    payload.dateTo !== undefined &&
    payload.dateTo !== null &&
    !isValidDate(payload.dateTo)
  ) {
    throw new Error("dateTo inválida. Use YYYY-MM-DD.");
  }

  return {
    dateFrom: payload.dateFrom ?? null,
    dateTo: payload.dateTo ?? null,
    dateWindowDays: Number(payload.dateWindowDays ?? 1),
    geoClusterRadiusKm: Number(payload.geoClusterRadiusKm ?? 5),
    maxStopsPerRoute: Number(payload.maxStopsPerRoute ?? 20),
    startAddress: payload.startAddress ?? null,
    startCoords: payload.startCoords ?? null,
    profile: "driving-car",
  };
}

async function requireAdminAuth(req: any, res: any, supabaseAdmin: any) {
  const authHeader = (req.headers?.authorization ||
    req.headers?.Authorization ||
    "") as string;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    json(res, 401, { error: "Token não fornecido." });
    return null;
  }

  const { data: userData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) {
    json(res, 401, { error: "Usuário não autenticado." });
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    json(res, 403, { error: "Não foi possível validar permissões." });
    return null;
  }

  const profileRole =
    (profile as { role?: string | null } | null)?.role ?? null;
  if (normalizeRole(profileRole) !== "gerente") {
    json(res, 403, { error: "Acesso negado. Apenas gerente." });
    return null;
  }

  return user;
}

async function geocodeORS(text: string, orsApiKey: string) {
  const url = new URL(`${ORS_BASE_URL}/geocode/search`);
  url.searchParams.set("api_key", orsApiKey);
  url.searchParams.set("text", text);
  url.searchParams.set("boundary.country", "BR");
  url.searchParams.set("size", "1");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`ORS geocode failed (${response.status})`);
  }

  const data = (await response.json()) as {
    features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
  };

  const coords = data.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    throw new Error("ORS geocode did not return coordinates");
  }

  return coords;
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
  const payload = buildOptimizationPayload(stops, startCoords);
  const jobs = payload.jobs;

  const url = new URL(`${ORS_BASE_URL}/optimization`);
  url.searchParams.set("api_key", orsApiKey);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`ORS optimization failed (${response.status})`);
  }

  const data = (await response.json()) as {
    routes?: Array<{
      summary?: { distance?: number; duration?: number };
      steps?: Array<{ type?: string; job?: number }>;
    }>;
  };

  const route = data.routes?.[0];
  const jobOrder = (route?.steps ?? [])
    .filter(step => step.type === "job" && typeof step.job === "number")
    .map(step => step.job as number);

  if (jobOrder.length === 0) {
    return {
      orderedStops: nearestNeighborFallback(stops, startCoords),
      summary: { distance_m: null, duration_s: null },
      source: "fallback",
    };
  }

  const byJobId = new Map(jobs.map((job, index) => [job.id, stops[index]]));
  const orderedStops = jobOrder
    .map(jobId => byJobId.get(jobId))
    .filter(Boolean) as GeocodedStop[];

  return {
    orderedStops,
    summary: {
      distance_m: route?.summary?.distance ?? null,
      duration_s: route?.summary?.duration ?? null,
    },
    source: "ors",
  };
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
    return json(res, 400, {
      error: error instanceof Error ? error.message : "Payload inválido.",
    });
  }

  try {
    let query = supabaseAdmin
      .from("os_orders")
      .select(
        "id, sale_number, client_name, delivery_date, address, address_lat, address_lng"
      )
      .eq("logistic_type", "instalacao")
      .eq("archived", false)
      .order("delivery_date", { ascending: true });

    if (parsed.dateFrom) query = query.gte("delivery_date", parsed.dateFrom);
    if (parsed.dateTo) query = query.lte("delivery_date", parsed.dateTo);

    const { data: rows, error: queryError } = await query;
    if (queryError) {
      return json(res, 500, { error: queryError.message });
    }

    const orders = (rows ?? []) as OsCandidate[];
    const geocodeCache = new Map<string, [number, number]>();
    const geocoded: GeocodedStop[] = [];
    const unassigned: Array<{ os_id: string; reason: string }> = [];

    const resolveGeocode = async (
      order: OsCandidate
    ): Promise<[number, number] | null> => {
      if (order.address_lng !== null && order.address_lat !== null) {
        return [order.address_lng, order.address_lat];
      }

      const address = order.address ? normalizeAddress(order.address) : "";
      if (!address) {
        unassigned.push({ os_id: order.id, reason: "missing_address" });
        return null;
      }

      const cached = geocodeCache.get(address);
      if (cached) return cached;

      try {
        const coords = await geocodeORS(address, orsApiKey);
        geocodeCache.set(address, coords);

        await supabaseAdmin
          .from("os_orders")
          .update({
            address_lat: coords[1],
            address_lng: coords[0],
            address_geocoded_at: new Date().toISOString(),
            address_geocode_provider: "openrouteservice",
          })
          .eq("id", order.id);

        return coords;
      } catch {
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
              parsed.startCoords
            );
          } catch {
            optimized = {
              orderedStops: nearestNeighborFallback(
                routeStops,
                parsed.startCoords
              ),
              summary: { distance_m: null, duration_s: null },
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

          groupRoutes.push({
            routeId: `${groupId}#${routeIndex + 1}`,
            summary: optimized.summary,
            stops,
            googleMapsUrl: buildGoogleMapsUrl(stops, parsed.startCoords),
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

    await supabaseAdmin.from("os_orders_event").insert({
      os_id: geocoded[0]?.os.id ?? orders[0]?.id,
      type: "route_optimized",
      created_by: currentUser.id,
      payload: {
        paramsUsed: parsed,
        totalCandidates: orders.length,
        geocoded: geocoded.length,
        unassigned: unassigned.length,
        groups: groups.length,
        routes: totalRoutes,
      },
    });

    const elapsedMs = Date.now() - startedAt;
    console.log("[hub-os/optimize-installations]", {
      totalCandidates: orders.length,
      geocoded: geocoded.length,
      optimized: geocoded.length - unassigned.length,
      groups: groups.length,
      routes: totalRoutes,
      elapsedMs,
    });

    return json(res, 200, {
      paramsUsed: parsed,
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
    return json(res, 502, { error: `Falha na otimização ORS: ${message}` });
  }
}

export {
  normalizeAddress,
  haversineDistanceKm,
  clusterByGeoRadius,
  buildGoogleMapsUrl,
  buildOptimizationPayload,
};

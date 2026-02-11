import { createClient } from 'npm:@supabase/supabase-js';

const MAPBOX_PROVIDER = 'mapbox';
const MAX_STOPS = 12;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, x-client-info, content-type, accept, x-forwarded-authorization, x-supabase-authorization, x-supabase-auth-token, x-supabase-auth-user, x-supabase-auth-user-id, x-supabase-user, x-supabase-user-id, x-sb-user-id, x-sb-user, x-sb-auth-user, x-sb-auth-user-id, x-sb-authorization, x-sb-auth-token, x-jwt-claims, x-supabase-auth',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

const extractBearerToken = (request: Request) => {
  const possibleAuthHeaders = [
    request.headers.get('authorization'),
    request.headers.get('Authorization'),
    request.headers.get('x-forwarded-authorization'),
    request.headers.get('x-supabase-authorization'),
    request.headers.get('x-supabase-auth-token'),
    request.headers.get('x-sb-authorization'),
    request.headers.get('x-sb-auth-token'),
  ];

  for (const value of possibleAuthHeaders) {
    if (!value) continue;
    const trimmed = value.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      return trimmed.replace(/^bearer\s+/i, '').trim();
    }
    if (trimmed.split('.').length === 3) {
      return trimmed;
    }
  }

  return null;
};

const requireUser = async (request: Request) => {
  const token = extractBearerToken(request);

  if (!token) {
    return { error: jsonResponse(401, { error: 'Unauthorized: missing Authorization Bearer token' }) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: jsonResponse(500, {
        error: 'Supabase env not configured: SUPABASE_URL/SUPABASE_ANON_KEY missing',
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { error: jsonResponse(401, { error: 'Invalid JWT' }) };
  }

  return { user: data.user, supabase, token };
};

type OptimizeBody = {
  date?: string;
  orderIds?: string[];
  startAddress?: string;
  endAddress?: string;
  roundtrip?: boolean;
};

type OrderRecord = {
  id: string;
  client_name: string;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
};

type Coordinate = {
  lat: number;
  lng: number;
};

type RouteStop =
  | ({ type: 'start' | 'end'; address: string } & Coordinate)
  | ({
      type: 'order';
      orderId: string;
      clientName: string;
      address: string;
      sequence: number;
    } & Coordinate);

const geocodeAddress = async (address: string, mapboxToken: string) => {
  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${encodeURIComponent(mapboxToken)}`;

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Mapbox geocoding failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    features?: Array<{ center?: [number, number] }>;
  };

  const center = payload.features?.[0]?.center;
  if (!center || center.length !== 2) {
    throw new Error('No geocoding result');
  }

  return { lng: center[0], lat: center[1] };
};

const buildGoogleMapsLink = (stops: RouteStop[]) => {
  if (stops.length < 2) {
    return null;
  }

  const orderStops = stops.filter((stop) => stop.type === 'order') as Extract<RouteStop, { type: 'order' }>[];
  const start = stops[0];
  const end = stops[stops.length - 1];

  const origin = `${start.lat},${start.lng}`;
  const destination = `${end.lat},${end.lng}`;

  const waypointValues = orderStops
    .filter((stop) => !(stop.lat === start.lat && stop.lng === start.lng) && !(stop.lat === end.lat && stop.lng === end.lng))
    .map((stop) => `${stop.lat},${stop.lng}`);

  const baseUrl = new URL('https://www.google.com/maps/dir/');
  baseUrl.searchParams.set('api', '1');
  baseUrl.searchParams.set('origin', origin);
  baseUrl.searchParams.set('destination', destination);
  if (waypointValues.length > 0) {
    baseUrl.searchParams.set('waypoints', waypointValues.join('|'));
  }

  return baseUrl.toString();
};

const buildWazeLink = (stops: RouteStop[]) => {
  const firstDestination = stops.find((stop) => stop.type === 'order') ?? stops[stops.length - 1];
  if (!firstDestination) {
    return null;
  }

  const url = new URL('https://waze.com/ul');
  url.searchParams.set('ll', `${firstDestination.lat},${firstDestination.lng}`);
  url.searchParams.set('navigate', 'yes');
  return url.toString();
};

Deno.serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const auth = await requireUser(request);
    if (auth.error) {
      return auth.error;
    }

    const body = (await request.json()) as OptimizeBody;
    if (!body.date) {
      return jsonResponse(400, { error: 'Missing required field: date (YYYY-MM-DD).' });
    }

    const mapboxToken = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    if (!mapboxToken) {
      return jsonResponse(500, { error: 'MAPBOX_ACCESS_TOKEN secret is not configured.' });
    }

    let query = auth.supabase
      .from('os_orders')
      .select('id, client_name, address, address_lat, address_lng')
      .eq('delivery_date', body.date)
      .eq('logistic_type', 'instalacao');

    if (body.orderIds && body.orderIds.length > 0) {
      query = query.in('id', body.orderIds);
    }

    const { data: orders, error: ordersError } = await query;
    if (ordersError) {
      return jsonResponse(500, { error: ordersError.message });
    }

    const skipped: Array<{ orderId: string; reason: string }> = [];
    const validOrderStops: Array<{ order: OrderRecord; lat: number; lng: number }> = [];

    for (const rawOrder of (orders ?? []) as OrderRecord[]) {
      const address = rawOrder.address?.trim();
      if (!address) {
        skipped.push({ orderId: rawOrder.id, reason: 'missing-address' });
        continue;
      }

      if (rawOrder.address_lat !== null && rawOrder.address_lng !== null) {
        validOrderStops.push({ order: rawOrder, lat: rawOrder.address_lat, lng: rawOrder.address_lng });
        continue;
      }

      try {
        const geocoded = await geocodeAddress(address, mapboxToken);
        const { error: updateError } = await auth.supabase
          .from('os_orders')
          .update({
            address_lat: geocoded.lat,
            address_lng: geocoded.lng,
            address_geocoded_at: new Date().toISOString(),
            address_geocode_provider: MAPBOX_PROVIDER,
          })
          .eq('id', rawOrder.id);

        if (updateError) {
          console.warn('[optimize-installation-route] geocode cache update failed', {
            orderId: rawOrder.id,
            error: updateError.message,
          });
        }

        validOrderStops.push({ order: rawOrder, lat: geocoded.lat, lng: geocoded.lng });
      } catch (error) {
        console.warn('[optimize-installation-route] order geocode failed', {
          orderId: rawOrder.id,
          error: error instanceof Error ? error.message : 'unknown-error',
        });
        skipped.push({ orderId: rawOrder.id, reason: 'geocode-failed' });
      }
    }

    if (validOrderStops.length === 0) {
      return jsonResponse(400, {
        error: 'No valid installation orders found for this date.',
        date: body.date,
        skipped,
      });
    }

    let startCoordinate: Coordinate | null = null;
    let endCoordinate: Coordinate | null = null;

    if (body.startAddress?.trim()) {
      try {
        startCoordinate = await geocodeAddress(body.startAddress.trim(), mapboxToken);
      } catch {
        return jsonResponse(400, { error: 'Could not geocode startAddress.' });
      }
    }

    if (body.endAddress?.trim()) {
      try {
        endCoordinate = await geocodeAddress(body.endAddress.trim(), mapboxToken);
      } catch {
        return jsonResponse(400, { error: 'Could not geocode endAddress.' });
      }
    }

    const resolvedRoundtrip = body.roundtrip ?? (!startCoordinate && !endCoordinate);

    const points: Array<
      | { kind: 'start'; address: string; lat: number; lng: number }
      | { kind: 'order'; orderId: string; clientName: string; address: string; lat: number; lng: number }
      | { kind: 'end'; address: string; lat: number; lng: number }
    > = [];

    if (startCoordinate && body.startAddress) {
      points.push({ kind: 'start', address: body.startAddress, ...startCoordinate });
    }

    for (const item of validOrderStops) {
      points.push({
        kind: 'order',
        orderId: item.order.id,
        clientName: item.order.client_name,
        address: item.order.address ?? '',
        lat: item.lat,
        lng: item.lng,
      });
    }

    if (endCoordinate && body.endAddress) {
      points.push({ kind: 'end', address: body.endAddress, ...endCoordinate });
    }

    if (points.length > MAX_STOPS) {
      return jsonResponse(400, {
        error: `Too many stops. Max ${MAX_STOPS} (including start/end).`,
        maxStops: MAX_STOPS,
      });
    }

    const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
    const source = startCoordinate ? 'first' : 'any';
    const destination = endCoordinate ? 'last' : 'any';

    const optimizationUrl = new URL(`https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinates}`);
    optimizationUrl.searchParams.set('access_token', mapboxToken);
    optimizationUrl.searchParams.set('source', source);
    optimizationUrl.searchParams.set('destination', destination);
    optimizationUrl.searchParams.set('roundtrip', String(resolvedRoundtrip));
    optimizationUrl.searchParams.set('overview', 'full');
    optimizationUrl.searchParams.set('steps', 'false');

    const optimizationResponse = await fetch(optimizationUrl.toString());
    if (!optimizationResponse.ok) {
      const detail = await optimizationResponse.text();
      return jsonResponse(400, {
        error: `Mapbox optimization failed (${optimizationResponse.status}): ${detail}`,
      });
    }

    const optimizationPayload = (await optimizationResponse.json()) as {
      code?: string;
      waypoints?: Array<{ waypoint_index: number; trips_index: number }>;
      trips?: Array<{ distance: number; duration: number }>;
    };

    if (optimizationPayload.code !== 'Ok' || !optimizationPayload.trips?.[0] || !optimizationPayload.waypoints?.length) {
      return jsonResponse(400, { error: 'Mapbox optimization returned an invalid response.' });
    }

    const sortedWaypoints = optimizationPayload.waypoints
      .map((waypoint, inputIndex) => ({ ...waypoint, inputIndex }))
      .filter((waypoint) => waypoint.trips_index === 0)
      .sort((a, b) => a.waypoint_index - b.waypoint_index);

    const orderedPoints = sortedWaypoints.map((waypoint) => points[waypoint.inputIndex]).filter(Boolean);

    const orderedStops: RouteStop[] = [];
    let orderSequence = 1;

    for (const point of orderedPoints) {
      if (point.kind === 'start') {
        orderedStops.push({ type: 'start', address: point.address, lat: point.lat, lng: point.lng });
        continue;
      }
      if (point.kind === 'end') {
        orderedStops.push({ type: 'end', address: point.address, lat: point.lat, lng: point.lng });
        continue;
      }
      orderedStops.push({
        type: 'order',
        orderId: point.orderId,
        clientName: point.clientName,
        address: point.address,
        lat: point.lat,
        lng: point.lng,
        sequence: orderSequence,
      });
      orderSequence += 1;
    }

    if (!startCoordinate && orderedStops[0]?.type !== 'start' && orderedStops.length > 0) {
      const first = orderedStops[0];
      orderedStops.unshift({ type: 'start', address: first.address, lat: first.lat, lng: first.lng });
    }

    if (!endCoordinate && orderedStops[orderedStops.length - 1]?.type !== 'end' && orderedStops.length > 0) {
      const last = orderedStops[orderedStops.length - 1];
      orderedStops.push({ type: 'end', address: last.address, lat: last.lat, lng: last.lng });
    }

    const googleMaps = buildGoogleMapsLink(orderedStops);
    const waze = buildWazeLink(orderedStops);

    return jsonResponse(200, {
      date: body.date,
      provider: MAPBOX_PROVIDER,
      limit: { maxStops: MAX_STOPS },
      route: {
        distance_m: optimizationPayload.trips[0].distance,
        duration_s: optimizationPayload.trips[0].duration,
      },
      stops: orderedStops,
      links: {
        googleMaps,
        waze,
      },
      skipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    console.error('[optimize-installation-route] unexpected error', { message });
    return jsonResponse(500, { error: message });
  }
});

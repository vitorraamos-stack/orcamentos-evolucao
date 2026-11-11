import {
  canRegisterPushUser,
  createPushStore,
  getBearer,
  hashPushEndpoint,
  isPushRegistrationEnabled,
  parseEndpointInput,
  parseJsonBody,
  parseSubscription,
  type PushEnv,
  type PushStore,
} from "../_shared/push/subscriptions";

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
};

function reply(res: ResponseLike, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  res.end(JSON.stringify(value));
}

export async function handlePushSubscriptions(
  req: RequestLike,
  res: ResponseLike,
  options: { env?: PushEnv; store?: PushStore } = {},
): Promise<void> {
  const method = (req.method ?? "").toUpperCase();
  if (method !== "POST" && method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
    reply(res, 405, { ok: false, code: "method_not_allowed" });
    return;
  }

  // Registration remains opt-in AND disabled until explicitly activated.
  // Revocation is deliberately allowed while the switch is off.
  const env = options.env ?? process.env;
  if (method === "POST" && !isPushRegistrationEnabled(env)) {
    reply(res, 503, { ok: false, code: "push_registration_disabled" });
    return;
  }

  const authHeader = req.headers?.authorization ?? req.headers?.Authorization;
  const bearer = getBearer(authHeader);
  if (!bearer) {
    reply(res, 401, { ok: false, code: "unauthorized" });
    return;
  }
  const body = parseJsonBody(req.body);
  if (!body) {
    reply(res, 400, { ok: false, code: "invalid_body" });
    return;
  }

  const subscription = method === "POST"
    ? parseSubscription((body as Record<string, unknown>).subscription)
    : null;
  const endpoint = method === "DELETE" ? parseEndpointInput(body) : subscription?.endpoint ?? null;
  if (!endpoint || (method === "POST" && !subscription)) {
    reply(res, 400, { ok: false, code: "invalid_subscription" });
    return;
  }

  let store: PushStore;
  try {
    store = options.store ?? createPushStore(env);
  } catch {
    reply(res, 503, { ok: false, code: "push_unavailable" });
    return;
  }

  try {
    const userId = await store.getUser(bearer);
    if (!userId) {
      reply(res, 401, { ok: false, code: "unauthorized" });
      return;
    }

    const endpointHash = hashPushEndpoint(endpoint);
    if (method === "DELETE") {
      // Idempotent; does not reveal whether a foreign device exists.
      await store.revoke(userId, endpointHash);
      reply(res, 200, { ok: true, registered: false });
      return;
    }

    // The opt-in pilot is server-enforced; no implicit rollout to other users.
    // Revocation above remains available for any account.
    if (!canRegisterPushUser(env, userId)) {
      reply(res, 403, { ok: false, code: "push_canary_only" });
      return;
    }

    const code = await store.register(userId, endpointHash, subscription!);
    if (code === "registered") {
      reply(res, 200, { ok: true, registered: true });
    } else if (code === "forbidden") {
      reply(res, 403, { ok: false, code: "module_denied" });
    } else if (code === "endpoint_bound") {
      reply(res, 409, { ok: false, code: "endpoint_unavailable" });
    } else if (code === "device_limit") {
      reply(res, 429, { ok: false, code: "device_limit" });
    } else {
      reply(res, 400, { ok: false, code: "invalid_subscription" });
    }
  } catch {
    // Never expose database errors, endpoint values, private keys or tokens.
    reply(res, 503, { ok: false, code: "push_unavailable" });
  }
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  return handlePushSubscriptions(req, res);
}

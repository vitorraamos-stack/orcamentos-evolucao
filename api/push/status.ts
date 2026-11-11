import {
  createPushStore,
  getBearer,
  hashPushEndpoint,
  parseEndpointInput,
  parseJsonBody,
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

/** A POST body avoids putting the (sensitive) endpoint URL in logs or query strings. */
export async function handlePushStatus(
  req: RequestLike,
  res: ResponseLike,
  options: { env?: PushEnv; store?: PushStore } = {}
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    reply(res, 405, { ok: false, code: "method_not_allowed" });
    return;
  }
  const bearer = getBearer(req.headers?.authorization ?? req.headers?.Authorization);
  if (!bearer) {
    reply(res, 401, { ok: false, code: "unauthorized" });
    return;
  }
  const endpoint = parseEndpointInput(parseJsonBody(req.body));
  if (!endpoint) {
    reply(res, 400, { ok: false, code: "invalid_subscription" });
    return;
  }
  try {
    const store = options.store ?? createPushStore(options.env ?? process.env);
    const userId = await store.getUser(bearer);
    if (!userId) {
      reply(res, 401, { ok: false, code: "unauthorized" });
      return;
    }
    const registered = await store.status(userId, hashPushEndpoint(endpoint));
    reply(res, 200, { ok: true, registered });
  } catch {
    reply(res, 503, { ok: false, code: "push_unavailable" });
  }
}
export default async function handler(req: RequestLike, res: ResponseLike) {
  return handlePushStatus(req, res);
}

import {
  canRegisterPushUser,
  createPushStore,
  getBearer,
  isPushRegistrationEnabled,
  type PushEnv,
  type PushStore,
} from "../_shared/push/subscriptions";

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};
type ResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(value: string): void;
};

function reply(res: ResponseLike, status: number, enabled: boolean, publicKey: string | null): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  res.end(JSON.stringify({ ok: true, enabled, publicKey }));
}

/**
 * Return VAPID public key only to an authenticated participant of the
 * controlled pilot. The canary allowlist never leaves the server.
 */
export async function handlePushPublicConfig(
  req: RequestLike,
  res: ResponseLike,
  env: PushEnv = process.env,
  store?: PushStore,
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ ok: false, code: "method_not_allowed" }));
    return;
  }

  if (!isPushRegistrationEnabled(env)) {
    reply(res, 200, false, null);
    return;
  }

  const bearer = getBearer(req.headers?.authorization ?? req.headers?.Authorization);
  if (!bearer) {
    reply(res, 200, false, null);
    return;
  }

  try {
    const userId = await (store ?? createPushStore(env)).getUser(bearer);
    const enabled = Boolean(userId && canRegisterPushUser(env, userId));
    reply(res, 200, enabled, enabled ? env.PWA_PUSH_VAPID_PUBLIC_KEY ?? null : null);
  } catch {
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, code: "push_unavailable" }));
  }
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  return handlePushPublicConfig(req, res);
}

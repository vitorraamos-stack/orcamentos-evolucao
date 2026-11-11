import { isPushRegistrationEnabled, type PushEnv } from "../_shared/push/subscriptions";

type RequestLike = { method?: string };
type ResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(value: string): void;
};

export function handlePushPublicConfig(
  req: RequestLike,
  res: ResponseLike,
  env: PushEnv = process.env
): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end(JSON.stringify({ ok: false, code: "method_not_allowed" }));
    return;
  }

  const enabled = isPushRegistrationEnabled(env);
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    enabled,
    publicKey: enabled ? env.PWA_PUSH_VAPID_PUBLIC_KEY : null,
  }));
}

export default function handler(req: RequestLike, res: ResponseLike) {
  handlePushPublicConfig(req, res);
}

import { createClient } from "@supabase/supabase-js";
import { DigisacClientError, digisacReadClientFromEnv } from "./_shared/digisac/readClient.js";

// Restricted read-only diagnostic. No provider data, token, raw error,
// or environment variable value is ever included in the response.
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const reply = (status: number, code: string) =>
    res.status(status).json({ ok: status === 200, code });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(405, "METHOD_NOT_ALLOWED");
  }
  const authorization = req.headers?.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ") ||
      authorization.length > 16384 || authorization.length <= 7)
    return reply(401, "UNAUTHENTICATED");

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return reply(503, "SERVER_CONFIG");

  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !auth.user || auth.user.is_anonymous)
      return reply(401, "UNAUTHENTICATED");

    const [profile, module] = await Promise.all([
      db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
      db.rpc("has_module_access", { uid: auth.user.id, module_key: "hub_os" }),
    ]);
    if (profile.error || module.error || module.data !== true ||
        !["gerente", "admin"].includes(profile.data?.role ?? ""))
      return reply(403, "FORBIDDEN");

    // Read just a minimal users page. Never expose a user, name, or email.
    await digisacReadClientFromEnv().checkConnection();
    return reply(200, "CONNECTED");
  } catch (cause) {
    if (cause instanceof DigisacClientError) {
      switch (cause.code) {
        case "configuration": return reply(503, "DIGISAC_CONFIG");
        case "unauthorized": return reply(502, "DIGISAC_UNAUTHORIZED");
        case "rate_limited": return reply(429, "DIGISAC_RATE_LIMITED");
        default: return reply(502, "DIGISAC_UNAVAILABLE");
      }
    }
    return reply(503, "SERVER_UNAVAILABLE");
  }
}

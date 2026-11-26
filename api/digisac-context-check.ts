import { createClient } from "@supabase/supabase-js";
import { digisacContextSchema } from "../shared/digisac/context.js";
import { inspectDigisacContext } from "./_shared/digisac/contextDiagnostic.js";
import { DigisacClientError, digisacReadClientFromEnv } from "./_shared/digisac/readClient.js";

// Manager-only diagnostic: no raw Digisac response, credential, contact,
// email, telephone or identity assertion is returned. No database writes.
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const reply = (status: number, code: string, checks?: unknown) =>
    res.status(status).json({ ok: status === 200, code, ...(checks ? { checks } : {}) });

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
    const [profile, access] = await Promise.all([
      db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
      db.rpc("has_module_access", { uid: auth.user.id, module_key: "hub_os" }),
    ]);
    if (profile.error || access.error || access.data !== true ||
        !["gerente", "admin"].includes(profile.data?.role ?? ""))
      return reply(403, "FORBIDDEN");

    let payload: unknown = req.body;
    if (typeof payload === "string") {
      if (payload.length > 4096) return reply(400, "INVALID_CONTEXT");
      try { payload = JSON.parse(payload); } catch { return reply(400, "INVALID_CONTEXT"); }
    }
    const parsed = digisacContextSchema.safeParse(payload);
    if (!parsed.success) return reply(400, "INVALID_CONTEXT");
    const refs = parsed.data;
    const client = digisacReadClientFromEnv();
    const [contact, ticket, user] = await Promise.all([
      client.getContact(refs.contactId),
      client.getTicket(refs.ticketId),
      client.getUser(refs.userId),
    ]);
    const confirmedEmail = auth.user.email_confirmed_at && typeof auth.user.email === "string"
      ? auth.user.email : null;
    return reply(200, "CONTEXT_INSPECTED",
      inspectDigisacContext(refs, { contact, ticket, user }, confirmedEmail));
  } catch (cause) {
    if (cause instanceof DigisacClientError) {
      switch (cause.code) {
        case "configuration": return reply(503, "DIGISAC_CONFIG");
        case "unauthorized": return reply(502, "DIGISAC_UNAUTHORIZED");
        case "not_found": return reply(404, "DIGISAC_REFERENCE_NOT_FOUND");
        case "rate_limited": return reply(429, "DIGISAC_RATE_LIMITED");
        default: return reply(502, "DIGISAC_UNAVAILABLE");
      }
    }
    return reply(503, "SERVER_UNAVAILABLE");
  }
}

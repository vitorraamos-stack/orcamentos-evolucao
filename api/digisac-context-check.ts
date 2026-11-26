import { createClient } from "@supabase/supabase-js";
import { canConsultDigisacBriefing, digisacRequestSchema, type DigisacBriefingState } from "../shared/digisac/context.js";
import { inspectDigisacConsultation, inspectDigisacContext } from "./_shared/digisac/contextDiagnostic.js";
import { DigisacClientError, digisacReadClientFromEnv } from "./_shared/digisac/readClient.js";

// Both paths are manager-only. The diagnostic only returns checks, while
// an explicit consultation can return a stored briefing's read-only contents.
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const reply = (status: number, code: string, details?: Record<string, unknown>) =>
    res.status(status).json({ ok: status === 200, code, ...details });

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
    const parsed = digisacRequestSchema.safeParse(payload);
    if (!parsed.success) return reply(400, "INVALID_CONTEXT");
    const refs = parsed.data;
    const client = digisacReadClientFromEnv();
    if ("action" in refs) {
      const [contact, ticket] = await Promise.all([
        client.getContact(refs.contactId),
        client.getTicket(refs.ticketId),
      ]);
      if (!canConsultDigisacBriefing(inspectDigisacConsultation(refs, contact, ticket))) {
        return reply(422, "CONTEXT_NOT_VERIFIED");
      }

      const publicKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (!publicKey) return reply(503, "SERVER_CONFIG");
      // The user's JWT preserves commercial_briefing_read row permissions.
      const reader = createClient(url, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await reader.from("commercial_briefings")
        .select("draft, cancelled_at, os_id").eq("digisac_contact_id", refs.contactId).limit(2);
      if (error || !Array.isArray(data)) return reply(503, "SERVER_UNAVAILABLE");
      if (data.length === 0) return reply(200, "BRIEFING_NOT_FOUND");
      if (data.length > 1) return reply(200, "BRIEFING_AMBIGUOUS");
      const row = data[0];
      const state: DigisacBriefingState = row.cancelled_at ? "cancelled" : row.os_id ? "linked" : "draft";
      return reply(200, "BRIEFING_FOUND", { briefing: { draft: row.draft, state } });
    }

    const [contact, ticket, user] = await Promise.all([
      client.getContact(refs.contactId),
      client.getTicket(refs.ticketId),
      client.getUser(refs.userId),
    ]);
    const confirmedEmail = auth.user.email_confirmed_at && typeof auth.user.email === "string"
      ? auth.user.email : null;
    return reply(200, "CONTEXT_INSPECTED", {
      checks: inspectDigisacContext(refs, { contact, ticket, user }, confirmedEmail),
    });
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

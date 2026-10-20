import { createClient } from "@supabase/supabase-js";
import { publishedCommercialQuerySchema } from "../shared/product-commercial-adapter/index.js";
import {
  PublishedCommercialAdapterError,
  PublishedCommercialAdapterService,
} from "./_shared/product-commercial-adapter/service.js";

const reply = (res: any, status: number, payload: unknown) =>
  res.status(status).json(payload);
const fail = (res: any, status: number, code: string, message: string) =>
  reply(res, status, { ok: false, error: { code, message } });

export default async function handler(req: any, res: any) {
  if (req.method !== "GET")
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported.");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return fail(res, 500, "SERVER_CONFIG", "Server configuration is incomplete.");

  const authHeader = String(req.headers?.authorization ?? "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token)
    return fail(res, 401, "UNAUTHENTICATED", "Bearer token is required.");

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user)
      return fail(res, 401, "UNAUTHENTICATED", "Invalid bearer token.");

    // All authorization data comes from trusted server-side profile records.
    const [profile, access] = await Promise.all([
      db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
      db.rpc("has_module_access", {
        uid: auth.user.id,
        module_key: "biblioteca_produtos",
      }),
    ]);
    const role = profile.data?.role === "admin" ? "gerente" : profile.data?.role;
    if (profile.error || access.error ||
        !["gerente", "consultor_vendas"].includes(role) || access.data !== true)
      return fail(res, 403, "FORBIDDEN", "Commercial product access is not permitted.");

    const parsed = publishedCommercialQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success)
      return fail(res, 400, "INVALID_QUERY", "Product ID must be a valid UUID.");

    const result = await new PublishedCommercialAdapterService(db)
      .load(parsed.data.productId);
    return reply(res, 200, { ok: true, data: result });
  } catch (error) {
    if (error instanceof PublishedCommercialAdapterError)
      return fail(res, error.status, error.code, error.message);
    console.error(JSON.stringify({
      scope: "product-commercial-adapter", event: "unexpected_error",
    }));
    return fail(res, 500, "INTERNAL_ERROR", "Unable to read commercial product.");
  }
}

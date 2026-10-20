import { createClient } from "@supabase/supabase-js";
import {
  commercialEligibilityApiRequestSchema,
} from "../shared/product-commercial-eligibility/index.js";
import {
  CommercialEligibilityService,
  CommercialEligibilityServiceError,
} from "./_shared/product-commercial-eligibility/service.js";
import { PublishedCommercialAdapterError } from
  "./_shared/product-commercial-adapter/service.js";

const send = (res: any, code: number, data: unknown) =>
  res.status(code).json(data);
const fail = (res: any, code: number, key: string, message: string) =>
  send(res, code, { ok: false, error: { code: key, message } });

export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Only POST is allowed.");
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret)
    return fail(res, 500, "SERVER_CONFIG", "Server configuration is incomplete.");
  const authorization = String(req.headers?.authorization ?? "");
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7) : "";
  if (!token)
    return fail(res, 401, "UNAUTHENTICATED", "Bearer token required.");
  const db = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user)
      return fail(res, 401, "UNAUTHENTICATED", "Invalid authentication.");
    const [profile, access] = await Promise.all([
      db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
      db.rpc("has_module_access", {
        uid: auth.user.id, module_key: "biblioteca_produtos",
      }),
    ]);
    const role = profile.data?.role === "admin" ? "gerente" : profile.data?.role;
    if (profile.error || access.error ||
        !["gerente", "consultor_vendas"].includes(role) || access.data !== true)
      return fail(res, 403, "FORBIDDEN", "Commercial access denied.");

    const payload = typeof req.body === "string"
      ? JSON.parse(req.body) : req.body;
    const parsed = commercialEligibilityApiRequestSchema.safeParse(payload);
    if (!parsed.success)
      return fail(res, 400, "INVALID_PAYLOAD", "Invalid commercial inputs.");
    const { action: _action, ...request } = parsed.data;
    const data = await new CommercialEligibilityService(db).assess(request);
    return send(res, 200, { ok: true, data });
  } catch (error) {
    if (error instanceof SyntaxError)
      return fail(res, 400, "INVALID_PAYLOAD", "Malformed JSON.");
    if (error instanceof CommercialEligibilityServiceError ||
        error instanceof PublishedCommercialAdapterError)
      return fail(res, error.status, error.code, error.message);
    console.error(JSON.stringify({
      scope: "product-commercial-eligibility", event: "unexpected_error",
    }));
    return fail(res, 500, "INTERNAL_ERROR", "Commercial eligibility unavailable.");
  }
}

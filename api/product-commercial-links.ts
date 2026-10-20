import { createClient } from "@supabase/supabase-js";
import {
  productCommercialLinkCreateSchema,
  productCommercialLinkListQuerySchema,
} from "../shared/product-commercial-links/index.js";
import {
  ProductCommercialLinkService,
  ProductCommercialLinkServiceError,
} from "./_shared/product-commercial-links/service.js";

const send = (res: any, status: number, payload: unknown) =>
  res.status(status).json(payload);
const fail = (res: any, status: number, code: string, message: string) =>
  send(res, status, { ok: false, error: { code, message } });

export default async function handler(req: any, res: any) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return fail(res, 500, "SERVER_CONFIG", "Server configuration is incomplete.");

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authorization = String(req.headers?.authorization ?? "");
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7) : "";
  if (!token)
    return fail(res, 401, "UNAUTHENTICATED", "Bearer token is required.");
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user)
    return fail(res, 401, "UNAUTHENTICATED", "Invalid bearer token.");

  // Derive authorization only from server-held profile and permission records.
  const [profile, moduleAccess] = await Promise.all([
    db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
    db.rpc("has_module_access", {
      uid: auth.user.id,
      module_key: "biblioteca_produtos",
    }),
  ]);
  const role = profile.data?.role === "admin" ? "gerente" : profile.data?.role;
  if (profile.error || moduleAccess.error ||
      role !== "gerente" || moduleAccess.data !== true)
    return fail(res, 403, "FORBIDDEN", "Product link access is not permitted.");

  try {
    const service = new ProductCommercialLinkService(db);
    if (req.method === "GET") {
      const parsed = productCommercialLinkListQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success)
        return fail(res, 400, "INVALID_QUERY", "Invalid link query.");
      return send(res, 200, {
        ok: true,
        data: await service.list(parsed.data.productId),
      });
    }
    if (req.method !== "POST")
      return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = productCommercialLinkCreateSchema.safeParse(body);
    if (!parsed.success)
      return fail(res, 400, "INVALID_PAYLOAD", "Invalid product link request.");
    const result = await service.create(
      parsed.data.productId, parsed.data.libraryProductId, auth.user.id
    );
    console.log(JSON.stringify({
      scope: "product-commercial-links",
      event: result.created ? "link_created" : "link_already_exists",
      actorId: auth.user.id,
      productId: result.link.productId,
      libraryProductId: result.link.libraryProductId,
    }));
    return send(res, result.created ? 201 : 200, { ok: true, data: result });
  } catch (error) {
    if (error instanceof ProductCommercialLinkServiceError)
      return fail(res, error.status, error.code, error.message);
    if (error instanceof SyntaxError)
      return fail(res, 400, "INVALID_PAYLOAD", "Invalid JSON body.");
    console.error(JSON.stringify({
      scope: "product-commercial-links", event: "unexpected_error",
    }));
    return fail(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
  }
}

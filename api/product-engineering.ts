import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { productEngineeringMutationSchema } from "../shared/product-engineering/api.js";
import {
  mapProduct,
  mapVersion,
  CompatibilityError,
} from "./_shared/product-engineering/mappers.js";
import {
  ProductEngineeringService,
  ServiceError,
} from "./_shared/product-engineering/service.js";

const send = (res: any, status: number, payload: any) =>
  res.status(status).json(payload);
const fail = (
  res: any,
  status: number,
  code: string,
  message: string,
  issues?: readonly unknown[]
) =>
  send(res, status, {
    ok: false,
    error: { code, message, ...(issues ? { issues } : {}) },
  });
export default async function handler(req: any, res: any) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return fail(
      res,
      500,
      "SERVER_CONFIG",
      "Server configuration is incomplete."
    );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const header = String(req.headers?.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token)
    return fail(res, 401, "UNAUTHENTICATED", "Bearer token is required.");
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user)
    return fail(res, 401, "UNAUTHENTICATED", "Invalid bearer token.");
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  const role = profile?.role === "admin" ? "gerente" : profile?.role;
  if (profileError || role !== "gerente")
    return fail(
      res,
      403,
      "FORBIDDEN",
      "Only managers may access Product Engineering."
    );
  const log = (event: string, details: Record<string, unknown>) =>
    console.log(
      JSON.stringify({
        scope: "product-engineering",
        event,
        actorId: auth.user.id,
        ...details,
      })
    );
  try {
    const service = new ProductEngineeringService(db);
    if (req.method === "GET") {
      const versionId =
        typeof req.query?.versionId === "string" ? req.query.versionId : null;
      const productId =
        typeof req.query?.productId === "string" ? req.query.productId : null;
      const requestedId = versionId ?? productId;
      if (requestedId && !z.string().uuid().safeParse(requestedId).success)
        return fail(
          res,
          400,
          "INVALID_QUERY",
          "Query identifier must be a UUID."
        );
      if (versionId)
        return send(res, 200, {
          ok: true,
          data: await service.loadDefinition(versionId),
        });
      if (productId) {
        const { data, error } = await db
          .from("product_versions")
          .select("*")
          .eq("product_id", productId)
          .order("version_number");
        if (error) throw error;
        return send(res, 200, { ok: true, data: (data ?? []).map(mapVersion) });
      }
      const { data, error } = await db
        .from("products")
        .select("*")
        .order("code");
      if (error) throw error;
      return send(res, 200, { ok: true, data: (data ?? []).map(mapProduct) });
    }
    if (req.method !== "POST")
      return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const parsed = productEngineeringMutationSchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body
    );
    if (!parsed.success)
      return fail(
        res,
        400,
        "INVALID_PAYLOAD",
        "Invalid Product Engineering request.",
        parsed.error.issues
      );
    const data = await service.execute(parsed.data, auth.user.id);
    log("action_completed", {
      action: parsed.data.action,
      versionId: "versionId" in parsed.data ? parsed.data.versionId : undefined,
    });
    return send(res, 200, { ok: true, data });
  } catch (error) {
    if (error instanceof ServiceError)
      return fail(res, error.status, error.code, error.message, error.issues);
    if (error instanceof CompatibilityError)
      return fail(res, 409, error.code, error.message);
    if (error instanceof SyntaxError)
      return fail(res, 400, "INVALID_PAYLOAD", "Invalid JSON body.");
    console.error(
      JSON.stringify({
        scope: "product-engineering",
        event: "unexpected_error",
        actorId: auth.user.id,
      })
    );
    return fail(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
  }
}

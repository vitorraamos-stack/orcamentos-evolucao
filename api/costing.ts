import { createClient } from "@supabase/supabase-js";
import {
  costingMutationSchema,
  costingQuerySchema,
} from "../shared/costing/api.js";
import { CostingCompatibilityError } from "./_shared/costing/mappers.js";
import {
  CostingService,
  CostingServiceError,
} from "./_shared/costing/service.js";

const send = (res: any, status: number, payload: unknown) =>
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
      "Only managers may access Costing Administration."
    );
  const log = (event: string, details: Record<string, unknown>) =>
    console.log(
      JSON.stringify({
        scope: "costing",
        event,
        actorId: auth.user.id,
        ...details,
      })
    );
  try {
    const service = new CostingService(db);
    if (req.method === "GET") {
      const normalized = Object.fromEntries(
        Object.entries(req.query ?? {}).filter(
          ([, value]) => value !== undefined
        )
      );
      const parsed = costingQuerySchema.safeParse(normalized);
      if (!parsed.success)
        return fail(
          res,
          400,
          "INVALID_QUERY",
          "Invalid Costing query.",
          parsed.error.issues
        );
      const data =
        "productId" in parsed.data
          ? await service.loadProductParameters(parsed.data.productId)
          : parsed.data.resourceId
            ? await service.loadResource(parsed.data.type, parsed.data.resourceId)
            : await service.listResources(parsed.data.type);
      log(
        "productId" in parsed.data ? "product_parameters_read" : "resources_read",
        "productId" in parsed.data
          ? { productId: parsed.data.productId }
          : {
              resourceType: parsed.data.type,
              resourceId: parsed.data.resourceId,
            }
      );
      return send(res, 200, { ok: true, data });
    }
    if (req.method !== "POST")
      return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    const parsed = costingMutationSchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body
    );
    if (!parsed.success)
      return fail(
        res,
        400,
        "INVALID_PAYLOAD",
        "Invalid Costing request.",
        parsed.error.issues
      );
    const data = await service.execute(parsed.data, auth.user.id);
    const resourceType =
      parsed.data.action === "CREATE_RESOURCE"
        ? parsed.data.resource.type
        : parsed.data.action === "UPDATE_RESOURCE"
          ? parsed.data.resource.type
          : parsed.data.action === "SET_CURRENT_RATE"
            ? parsed.data.type
            : undefined;
    const resourceId =
      parsed.data.action === "UPDATE_RESOURCE"
        ? parsed.data.resource.id
        : parsed.data.action === "SET_CURRENT_RATE"
          ? parsed.data.resourceId
          : undefined;
    log("action_completed", {
      action: parsed.data.action,
      resourceType,
      resourceId,
      productId:
        parsed.data.action === "SET_PRODUCT_PARAMETER"
          ? parsed.data.productId
          : undefined,
      parameterKey:
        parsed.data.action === "SET_PRODUCT_PARAMETER"
          ? parsed.data.key
          : undefined,
    });
    return send(res, 200, { ok: true, data });
  } catch (error) {
    if (error instanceof CostingServiceError)
      return fail(res, error.status, error.code, error.message);
    if (error instanceof CostingCompatibilityError)
      return fail(res, 500, error.code, error.message);
    if (error instanceof SyntaxError)
      return fail(res, 400, "INVALID_PAYLOAD", "Invalid JSON body.");
    console.error(
      JSON.stringify({
        scope: "costing",
        event: "unexpected_error",
        actorId: auth.user.id,
      })
    );
    return fail(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
  }
}

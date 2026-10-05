import { createClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import {
  CostingDomainError,
  officialCostingRequestSchema,
} from "../../shared/costing/index.js";
import { CostingCompatibilityError } from "../_shared/costing/mappers.js";
import {
  OfficialCostingCalculationService,
  OfficialCostingCompatibilityError,
} from "../_shared/costing/calculationService.js";
import {
  CostingService,
  CostingServiceError,
} from "../_shared/costing/service.js";
import { CompatibilityError } from "../_shared/product-engineering/mappers.js";
import {
  ProductEngineeringService,
  ServiceError,
} from "../_shared/product-engineering/service.js";

const send = (res: any, status: number, payload: unknown) =>
  res.status(status).json(payload);
const fail = (res: any, status: number, code: string, message: string) =>
  send(res, status, { ok: false, error: { code, message } });

const semanticDomainCodes = new Set([
  "PRODUCT_VERSION_NOT_PUBLISHED",
  "COST_RESOURCE_NOT_ACTIVE",
  "MISSING_COST_RATE",
  "AMBIGUOUS_COST_RATE",
  "INCOMPATIBLE_COST_UNIT",
  "MISSING_TECHNICAL_INPUT",
  "INVALID_TECHNICAL_INPUT",
  "UNKNOWN_TECHNICAL_INPUT",
  "TECHNICAL_INPUT_OUT_OF_RANGE",
  "NEGATIVE_COMPONENT_QUANTITY",
  "INVALID_COMMERCIAL_QUANTITY",
]);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");

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
    return fail(res, 403, "FORBIDDEN", "Official cost details are restricted.");

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return fail(res, 400, "INVALID_PAYLOAD", "Invalid request payload.");
  }
  const parsed = officialCostingRequestSchema.safeParse(body);
  if (!parsed.success)
    return fail(res, 400, "INVALID_PAYLOAD", "Invalid request payload.");

  const log = (event: string, details: Record<string, unknown>) =>
    console.log(
      JSON.stringify({
        scope: "official_costing",
        event,
        actorId: auth.user.id,
        productVersionId: parsed.data.productVersionId,
        ...details,
      })
    );
  log("calculation_started", {});
  try {
    const service = new OfficialCostingCalculationService(
      new ProductEngineeringService(db),
      new CostingService(db)
    );
    const data = await service.calculate(parsed.data);
    log("calculation_completed", {
      componentCount: data.components.length,
      resourceCount: data.components.filter(item => item.resource).length,
      aggregationVersion: data.aggregationVersion,
    });
    return send(res, 200, { ok: true, data });
  } catch (error) {
    log("calculation_failed", {
      code:
        error instanceof Error && "code" in error
          ? error.code
          : "INTERNAL_ERROR",
    });
    if (error instanceof ServiceError || error instanceof CostingServiceError)
      return fail(res, error.status, error.code, error.message);
    if (error instanceof CostingDomainError) {
      const status = semanticDomainCodes.has(error.code) ? 422 : 500;
      const message =
        status === 422
          ? error.message
          : "Official costing could not be calculated.";
      return fail(res, status, error.code, message);
    }
    if (
      error instanceof OfficialCostingCompatibilityError ||
      error instanceof CostingCompatibilityError ||
      error instanceof CompatibilityError ||
      error instanceof ZodError
    )
      return fail(
        res,
        500,
        error instanceof ZodError
          ? "INVALID_PRODUCT_VERSION_DEFINITION"
          : "code" in error
            ? String(error.code)
            : "INVALID_PRODUCT_VERSION_DEFINITION",
        "Authoritative costing data is invalid."
      );
    return fail(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
  }
}

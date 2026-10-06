import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  CostingDomainError,
} from "../shared/costing/index.js";
import {
  officialPricingApiRequestSchema,
  pricingPersistenceMutationSchema,
  PricingDomainError,
} from "../shared/pricing/index.js";
import { CostingCompatibilityError } from "./_shared/costing/mappers.js";
import {
  OfficialCostingCalculationService,
  OfficialCostingCompatibilityError,
} from "./_shared/costing/calculationService.js";
import {
  CostingService,
  CostingServiceError,
} from "./_shared/costing/service.js";
import {
  OfficialPricingCalculationError,
  OfficialPricingCalculationService,
} from "./_shared/pricing/calculationService.js";
import {
  PricingPersistenceCompatibilityError,
} from "./_shared/pricing/mappers.js";
import {
  PricingPersistenceService,
  PricingPersistenceServiceError,
} from "./_shared/pricing/service.js";
import { CompatibilityError } from "./_shared/product-engineering/mappers.js";
import {
  ProductEngineeringService,
  ServiceError,
} from "./_shared/product-engineering/service.js";

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

const uuid = z.string().uuid();
const adminQuerySchema = z.union([
  z.object({ policyId: uuid }).strict(),
  z.object({ versionId: uuid }).strict(),
  z.object({ productId: uuid }).strict(),
  z.object({ installments: z.string().regex(/^(?:[1-9]|1[0-2])$/) }).strict(),
]);

const normalizeRole = (role?: string | null) => {
  if (role === "admin") return "gerente";
  if (role === "consultor") return "consultor_vendas";
  return role ?? null;
};

const consultantInputCodes = new Set([
  "MISSING_TECHNICAL_INPUT",
  "INVALID_TECHNICAL_INPUT",
  "UNKNOWN_TECHNICAL_INPUT",
  "TECHNICAL_INPUT_OUT_OF_RANGE",
  "INVALID_COMMERCIAL_QUANTITY",
]);

const costingConfigurationCodes = new Set([
  "COST_RESOURCE_NOT_ACTIVE",
  "MISSING_COST_RATE",
  "AMBIGUOUS_COST_RATE",
  "INCOMPATIBLE_COST_UNIT",
  "COST_RESOURCE_NOT_FOUND",
  "COST_RESOURCE_REFERENCE_MISMATCH",
]);

const pricingConfigurationErrors: Record<
  string,
  { code: string; message: string }
> = {
  PRODUCT_PRICING_SETTINGS_NOT_FOUND: {
    code: "PRICING_NOT_CONFIGURED",
    message: "Pricing is not configured for this product.",
  },
  PRICING_POLICY_NOT_ACTIVE: {
    code: "PRICING_NOT_AVAILABLE",
    message: "Pricing is not available for this product.",
  },
  PRICING_PUBLISHED_VERSION_NOT_FOUND: {
    code: "PRICING_NOT_PUBLISHED",
    message: "Pricing is not published for this product.",
  },
  PRICING_PAYMENT_TERM_NOT_FOUND: {
    code: "PAYMENT_TERM_NOT_CONFIGURED",
    message: "The selected installment option is not configured.",
  },
};

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

  if (req.method !== "GET" && req.method !== "POST")
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");

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
  if (profileError)
    return fail(res, 403, "FORBIDDEN", "Pricing access is not authorized.");

  const role = normalizeRole(profile?.role);
  const isManager = role === "gerente";
  const canCalculate = isManager || role === "consultor_vendas";

  let body: unknown = undefined;
  if (req.method === "POST") {
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return fail(res, 400, "INVALID_PAYLOAD", "Invalid JSON body.");
    }
  }
  const action =
    typeof body === "object" && body !== null && "action" in body
      ? (body as Record<string, unknown>).action
      : undefined;
  const isCalculation = action === "CALCULATE";

  const log = (
    scope: "pricing" | "official_pricing",
    event: string,
    details: Record<string, unknown>
  ) =>
    console.log(
      JSON.stringify({
        scope,
        event,
        actorId: auth.user.id,
        ...details,
      })
    );

  try {
    const pricing = new PricingPersistenceService(db);

    if (req.method === "GET") {
      if (!isManager)
        return fail(
          res,
          403,
          "FORBIDDEN",
          "Only managers may access Pricing Administration."
        );

      const normalized = Object.fromEntries(
        Object.entries(req.query ?? {}).filter(([, value]) => value !== undefined)
      );
      const parsed = adminQuerySchema.safeParse(normalized);
      if (!parsed.success)
        return fail(
          res,
          400,
          "INVALID_QUERY",
          "Invalid Pricing administration query.",
          parsed.error.issues
        );

      const query = parsed.data;
      const data =
        "policyId" in query
          ? await pricing.loadPolicy(query.policyId)
          : "versionId" in query
            ? await pricing.loadAggregate(query.versionId)
            : "productId" in query
              ? await pricing.loadProductSettings(query.productId)
              : await pricing.loadPaymentTerm(Number(query.installments));
      return send(res, 200, { ok: true, data });
    }

    if (isCalculation) {
      if (!canCalculate)
        return fail(
          res,
          403,
          "FORBIDDEN",
          "Official Pricing is restricted to Sales and managers."
        );

      const parsed = officialPricingApiRequestSchema.safeParse(body);
      if (!parsed.success)
        return fail(
          res,
          400,
          "INVALID_PAYLOAD",
          "Invalid official Pricing request.",
          parsed.error.issues
        );

      log("official_pricing", "calculation_started", {
        productVersionId: parsed.data.productVersionId,
        installments: parsed.data.installments,
      });

      const calculation = new OfficialPricingCalculationService(
        new OfficialCostingCalculationService(
          new ProductEngineeringService(db),
          new CostingService(db)
        ),
        pricing
      );
      const result = await calculation.calculate({
        productVersionId: parsed.data.productVersionId,
        request: parsed.data.request,
        installments: parsed.data.installments,
      });

      log("official_pricing", "calculation_completed", {
        productVersionId: result.publicResult.productVersionId,
        installments: result.publicResult.installments,
      });
      return send(res, 200, { ok: true, data: result.publicResult });
    }

    if (!isManager)
      return fail(
        res,
        403,
        "FORBIDDEN",
        "Only managers may access Pricing Administration."
      );

    const parsed = pricingPersistenceMutationSchema.safeParse(body);
    if (!parsed.success)
      return fail(
        res,
        400,
        "INVALID_PAYLOAD",
        "Invalid Pricing administration request.",
        parsed.error.issues
      );

    const data = await pricing.execute(parsed.data, auth.user.id);
    log("pricing", "action_completed", {
      action: parsed.data.action,
      policyId: "policyId" in parsed.data ? parsed.data.policyId : undefined,
      versionId: "versionId" in parsed.data ? parsed.data.versionId : undefined,
      productId: "productId" in parsed.data ? parsed.data.productId : undefined,
      installments:
        "installments" in parsed.data ? parsed.data.installments : undefined,
    });
    return send(res, 200, { ok: true, data });
  } catch (error) {
    if (isCalculation) {
      log("official_pricing", "calculation_failed", {
        code:
          error instanceof Error && "code" in error
            ? String(error.code)
            : "INTERNAL_ERROR",
      });

      if (error instanceof PricingPersistenceServiceError) {
        const safe = pricingConfigurationErrors[error.code];
        if (safe) return fail(res, 422, safe.code, safe.message);
        return fail(
          res,
          500,
          "PRICING_CONFIGURATION_ERROR",
          "Official Pricing is not available."
        );
      }

      if (error instanceof ServiceError) {
        if (error.code === "VERSION_NOT_FOUND" || error.code === "NOT_FOUND")
          return fail(res, 404, "PRODUCT_VERSION_NOT_FOUND", "Product version not found.");
        return fail(
          res,
          500,
          "PRODUCT_CONFIGURATION_ERROR",
          "Official Pricing could not be calculated."
        );
      }

      if (error instanceof CostingServiceError)
        return fail(
          res,
          422,
          "COSTING_NOT_CONFIGURED",
          "Costing is not configured for this product."
        );

      if (error instanceof CostingDomainError) {
        if (consultantInputCodes.has(error.code))
          return fail(res, 422, error.code, error.message);
        if (costingConfigurationCodes.has(error.code))
          return fail(
            res,
            422,
            "COSTING_NOT_CONFIGURED",
            "Costing is not configured for this product."
          );
        return fail(
          res,
          500,
          "OFFICIAL_PRICING_ERROR",
          "Official Pricing could not be calculated."
        );
      }

      if (
        error instanceof OfficialPricingCalculationError &&
        error.status === 400
      )
        return fail(res, 400, error.code, error.message);

      if (
        error instanceof OfficialCostingCompatibilityError ||
        error instanceof CostingCompatibilityError ||
        error instanceof CompatibilityError ||
        error instanceof PricingPersistenceCompatibilityError ||
        error instanceof PricingDomainError ||
        error instanceof OfficialPricingCalculationError ||
        error instanceof z.ZodError
      )
        return fail(
          res,
          500,
          "OFFICIAL_PRICING_COMPATIBILITY_ERROR",
          "Official Pricing data is incompatible with this server."
        );

      return fail(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
    }

    if (error instanceof PricingPersistenceServiceError)
      return fail(res, error.status, error.code, error.message, error.issues);
    if (error instanceof PricingPersistenceCompatibilityError)
      return fail(
        res,
        500,
        error.code,
        "Pricing persistence is incompatible with this server."
      );
    console.error(
      JSON.stringify({
        scope: "pricing",
        event: "unexpected_error",
        actorId: auth.user.id,
      })
    );
    return fail(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
  }
}

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { pricingPersistenceMutationSchema } from "../shared/pricing/index.js";
import {
  PricingPersistenceCompatibilityError,
} from "./_shared/pricing/mappers.js";
import {
  PricingPersistenceService,
  PricingPersistenceServiceError,
} from "./_shared/pricing/service.js";

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
      "Only managers may access Pricing Administration."
    );

  const log = (event: string, details: Record<string, unknown>) =>
    console.log(
      JSON.stringify({
        scope: "pricing",
        event,
        actorId: auth.user.id,
        ...details,
      })
    );

  try {
    const service = new PricingPersistenceService(db);

    if (req.method === "GET") {
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
          ? await service.loadPolicy(query.policyId)
          : "versionId" in query
            ? await service.loadAggregate(query.versionId)
            : "productId" in query
              ? await service.loadProductSettings(query.productId)
              : await service.loadPaymentTerm(Number(query.installments));
      return send(res, 200, { ok: true, data });
    }

    if (req.method !== "POST")
      return fail(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");

    const parsed = pricingPersistenceMutationSchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body
    );
    if (!parsed.success)
      return fail(
        res,
        400,
        "INVALID_PAYLOAD",
        "Invalid Pricing administration request.",
        parsed.error.issues
      );

    const data = await service.execute(parsed.data, auth.user.id);
    log("action_completed", {
      action: parsed.data.action,
      policyId: "policyId" in parsed.data ? parsed.data.policyId : undefined,
      versionId: "versionId" in parsed.data ? parsed.data.versionId : undefined,
      productId: "productId" in parsed.data ? parsed.data.productId : undefined,
      installments:
        "installments" in parsed.data ? parsed.data.installments : undefined,
    });
    return send(res, 200, { ok: true, data });
  } catch (error) {
    if (error instanceof PricingPersistenceServiceError)
      return fail(res, error.status, error.code, error.message, error.issues);
    if (error instanceof PricingPersistenceCompatibilityError)
      return fail(
        res,
        500,
        error.code,
        "Pricing persistence is incompatible with this server."
      );
    if (error instanceof SyntaxError)
      return fail(res, 400, "INVALID_PAYLOAD", "Invalid JSON body.");
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

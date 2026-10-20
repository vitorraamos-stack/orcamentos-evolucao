import { describe, expect, it, vi } from "vitest";
import { CommercialEligibilityService } from "./service";
import { PricingPersistenceServiceError } from "../pricing/service";

const p = "10000000-0000-4000-8000-000000000001";
const l = "10000000-0000-4000-8000-000000000002";
const v = "10000000-0000-4000-8000-000000000003";
const publication: any = {
  productId: p, libraryProductId: l, commercialVersion: 2,
  engineeringVersion: { id: v, number: 3 },
  fields: [
    { id: "medidas", label: "Medidas", required: true, type: "dimensions", unit: "cm", when: "always" },
    { id: "quantidade", label: "Quantidade", required: true, type: "number", when: "always" },
    { id: "espessura", label: "Espessura", required: true, type: "select", options: ["10 mm"], when: "always" },
    { id: "acabamento", label: "Acabamento", required: true, type: "select", options: ["PVC natural branco"], when: "always" },
    { id: "arte_vetorial", label: "Arte", required: true, type: "yesno", when: "always" },
    { id: "instalacao", label: "Instalação", required: true, type: "yesno", when: "always" },
  ],
  complements: [], rules: { photos_policy: "recommend", conditions: [] },
};
const request: any = {
  productId: p, commercialVersion: 2, selectedComplementIds: [], photosConfirmed: false,
  values: { medidas: { width: "120", height: "40" }, quantidade: 1,
    espessura: "10 mm", acabamento: "PVC natural branco",
    arte_vetorial: "Sim", instalacao: "Não" },
};
function fake(opts: { pricing?: "missing" | "error"; draft?: boolean } = {}) {
  const load = vi.fn(async () => publication);
  const loadDefinition = vi.fn(async () => ({ inputs: [
    { key: "width", type: "DECIMAL", unit: "m" },
    { key: "height", type: "DECIMAL", unit: "m" },
    { key: "thickness", type: "SELECT", options: [{ label: "10 mm", value: "10" }] },
    { key: "number_of_colors", type: "DECIMAL", defaultValue: "0" },
  ] }));
  const loadProductParameters = vi.fn(async () => []);
  const loadOfficialCalculationContext = vi.fn(async () => {
    if (opts.pricing === "missing") throw new PricingPersistenceServiceError(
      404, "PRICING_POLICY_NOT_FOUND", "Missing");
    if (opts.pricing === "error") throw new Error("Unexpected");
    return { confidential: "never returned" };
  });
  const db = { from: vi.fn((table: string) => {
    if (table !== "products") throw new Error("Unexpected table " + table);
    return {
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { code: "LETREIRO_PVC" }, error: null }),
      }) }),
    };
  }) };
  const service = new CommercialEligibilityService(db, {
    publication: { load } as any,
    engineering: { loadDefinition } as any,
    parameters: { loadProductParameters } as any,
    pricing: { loadOfficialCalculationContext } as any,
  });
  return { service, load, loadDefinition, loadProductParameters,
    loadOfficialCalculationContext, db };
}
describe("31C read-only service", () => {
  it("validates published version, engineering, parameters and Pricing without leaking internals", async () => {
    const f = fake();
    const result = await f.service.assess(request);
    expect(result.status).toBe("CALCULABLE");
    expect(result.canTransfer).toBe(false);
    expect(JSON.stringify(result)).not.toContain("confidential");
    expect(f.load).toHaveBeenCalledWith(p);
    expect(f.loadDefinition).toHaveBeenCalledWith(v);
    expect(f.loadProductParameters).toHaveBeenCalledWith(p);
    expect(f.loadOfficialCalculationContext).toHaveBeenCalledWith(p, 1);
  });

  it("does not read costs or Pricing for incomplete requests", async () => {
    const f = fake();
    const result = await f.service.assess({
      ...request, values: { ...request.values, medidas: null },
    });
    expect(result.status).toBe("INCOMPLETE");
    expect(f.loadDefinition).not.toHaveBeenCalled();
    expect(f.loadOfficialCalculationContext).not.toHaveBeenCalled();
  });

  it("returns preparation status for known missing price setup", async () => {
    const f = fake({ pricing: "missing" });
    const result = await f.service.assess(request);
    expect(result.status).toBe("PREPARATION_ONLY");
    expect(result.reasons).toContain("PRICING_UNAVAILABLE");
    expect(result.canAttemptCalculation).toBe(false);
  });

  it("does not hide unknown pricing infrastructure failures", async () => {
    const f = fake({ pricing: "error" });
    await expect(f.service.assess(request)).rejects.toThrow("Unexpected");
  });

  it("does not fetch private input data for stale commercial revision", async () => {
    const f = fake();
    const result = await f.service.assess({
      ...request, commercialVersion: 1,
    });
    expect(result.reasons).toContain("VERSION_REVIEW_REQUIRED");
    expect(f.db.from).not.toHaveBeenCalled();
  });
});

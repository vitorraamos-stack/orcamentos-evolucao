import { describe, expect, it } from "vitest";
import { commercialEligibilityRequestSchema } from "./index";
import {
  assessCommercialEligibility,
  type CommercialEligibilityTechnicalContext,
} from "./evaluate";

const p = "10000000-0000-4000-8000-000000000001";
const l = "10000000-0000-4000-8000-000000000002";
const v = "10000000-0000-4000-8000-000000000003";
const publication: any = {
  productId: p, libraryProductId: l, commercialVersion: 2,
  engineeringVersion: { id: v, number: 3 },
  fields: [
    { id: "medidas", label: "Medidas", required: true, type: "dimensions", unit: "cm", when: "always" },
    { id: "quantidade", label: "Quantidade", required: true, type: "number", when: "always" },
    { id: "espessura", label: "Espessura", required: true, type: "select", when: "always", options: ["2 mm", "10 mm"] },
    { id: "acabamento", label: "Acabamento", required: true, type: "select", when: "always",
      options: ["PVC natural branco", "Pintura completa personalizada"] },
    { id: "cor", label: "Cor", required: true, type: "text", when: "paint" },
    { id: "arte_vetorial", label: "Arte", required: true, type: "yesno", when: "always" },
    { id: "instalacao", label: "Instalação", required: true, type: "yesno", when: "always" },
    { id: "superficie", label: "Superfície", required: true, type: "select", when: "install",
      options: ["Alvenaria", "Outra / avaliar"] },
    { id: "fixacao_especial", label: "Fixação especial", required: false, type: "yesno", when: "install" },
  ],
  complements: [
    { id: "instalacao_servico_pvc", name: "Instalação", mode: "separate", when: "install" },
    { id: "adaptacao_arte_pvc", name: "Arte", mode: "separate", when: "noart" },
  ],
  rules: {
    photos_policy: "recommend",
    conditions: [
      { id: "rule1", field: "superficie", equals: "Outra / avaliar",
        action: "technical_review", message: "Análise da superfície" },
    ],
  },
};
const req = (changes: any = {}): any => ({
  productId: p, commercialVersion: 2,
  values: {
    medidas: { width: "200", height: "60" }, quantidade: 1,
    espessura: "10 mm", acabamento: "PVC natural branco",
    arte_vetorial: "Sim", instalacao: "Não",
    ...(changes.values ?? {}),
  },
  selectedComplementIds: changes.selectedComplementIds ?? [],
  photosConfirmed: changes.photosConfirmed ?? false,
  commercialVersion: changes.commercialVersion ?? 2,
});
const ctx = (changes: any = {}): CommercialEligibilityTechnicalContext => ({
  code: "LETREIRO_PVC", pricingAvailable: true,
  serverManagedKeys: new Set(["paint_coats", "paint_yield_m2_per_can_per_coat"]),
  engineeringInputs: [
    { key: "width", type: "DECIMAL", unit: "m", required: true, min: "0.01" },
    { key: "height", type: "DECIMAL", unit: "m", required: true, min: "0.01" },
    { key: "thickness", type: "SELECT", required: true,
      options: [{ label: "2 mm", value: "2" }, { label: "10 mm", value: "10" }] },
    { key: "number_of_colors", type: "DECIMAL", required: true, defaultValue: "0" },
    { key: "paint_coats", type: "DECIMAL", required: true },
    { key: "paint_yield_m2_per_can_per_coat", type: "DECIMAL", required: true },
  ],
  ...changes,
});

describe("PR 31C - commercial eligibility", () => {
  it("accepts only complete, validated natural PVC for attempting calculation", () => {
    const out = assessCommercialEligibility(publication, req(), ctx());
    expect(out.status).toBe("CALCULABLE");
    expect(out.canAttemptCalculation).toBe(true);
    expect(out.canTransfer).toBe(false);
    expect(JSON.stringify(out)).not.toContain("price");
  });

  it("requires commercial fields and never treats whitespace as filled", () => {
    const out = assessCommercialEligibility(publication, req({
      values: { medidas: undefined, espessura: "" },
    }), ctx());
    expect(out.status).toBe("INCOMPLETE");
    expect(out.missing).toContain("Medidas");
    expect(out.missing).toContain("Espessura");
  });

  it("rejects unsupported thickness, noninteger quantity and duplicate complements", () => {
    const bad = assessCommercialEligibility(publication, req({
      values: { espessura: "12 mm", quantidade: 1.5 },
    }), ctx());
    expect(bad.status).toBe("INVALID_COMBINATION");
    const duplicated = assessCommercialEligibility(publication, req({
      selectedComplementIds: ["adaptacao_arte_pvc", "adaptacao_arte_pvc"],
    }), ctx());
    expect(duplicated.status).toBe("INVALID_COMBINATION");
    expect(duplicated.reasons).toContain("INVALID_COMPLEMENT");
  });

  it("keeps unpriced painting, installation, and no-vector options as preparation", () => {
    const painted = assessCommercialEligibility(publication, req({
      values: { acabamento: "Pintura completa personalizada", cor: "Vermelho" },
    }), ctx());
    expect(painted.status).toBe("PREPARATION_ONLY");
    const installation = assessCommercialEligibility(publication, req({
      values: { instalacao: "Sim", superficie: "Alvenaria" },
    }), ctx());
    expect(installation.status).toBe("PREPARATION_ONLY");
    const art = assessCommercialEligibility(publication, req({
      values: { arte_vetorial: "Não" },
      selectedComplementIds: ["adaptacao_arte_pvc"],
    }), ctx());
    expect(art.status).toBe("PREPARATION_ONLY");
  });

  it("blocks special fixing and conditional technical review", () => {
    for (const values of [
      { instalacao: "Sim", superficie: "Alvenaria", fixacao_especial: "Sim" },
      { instalacao: "Sim", superficie: "Outra / avaliar" },
    ]) {
      const out = assessCommercialEligibility(publication, req({ values }), ctx());
      expect(out.status).toBe("TECHNICAL_PENDING");
      expect(out.technicalNotes.length).toBeGreaterThan(0);
      expect(out.canAttemptCalculation).toBe(false);
    }
  });

  it("requires photos when the published policy demands them", () => {
    const photoPublication = {
      ...publication,
      rules: { ...publication.rules, photos_policy: "required" },
    };
    const out = assessCommercialEligibility(photoPublication, req({
      values: { instalacao: "Sim", superficie: "Alvenaria" },
    }), ctx());
    expect(out.status).toBe("INCOMPLETE");
    expect(out.missing).toContain("Confirmar recebimento das fotografias do local");
  });

  it("fails closed when pricing or engineering/mapping is missing", () => {
    expect(assessCommercialEligibility(publication, req(), ctx({
      pricingAvailable: false,
    })).status).toBe("PREPARATION_ONLY");
    expect(assessCommercialEligibility({
      ...publication, engineeringVersion: null,
    }, req(), ctx()).status).toBe("PREPARATION_ONLY");
    expect(assessCommercialEligibility(publication, req(), ctx({
      serverManagedKeys: new Set(),
    })).status).toBe("PREPARATION_ONLY");
    expect(assessCommercialEligibility(publication, req(), ctx({
      code: "OTHER",
    })).status).toBe("PREPARATION_ONLY");
  });

  it("requires reconfirmation when the published version changes", () => {
    const out = assessCommercialEligibility(publication, req({ commercialVersion: 1 }), ctx());
    expect(out.status).toBe("PREPARATION_ONLY");
    expect(out.reasons).toContain("VERSION_REVIEW_REQUIRED");
  });

  it("does not allow incomplete or malformed API payloads", () => {
    expect(commercialEligibilityRequestSchema.safeParse(req()).success).toBe(true);
    expect(commercialEligibilityRequestSchema.safeParse({
      ...req(), cost: 12,
    }).success).toBe(false);
    expect(commercialEligibilityRequestSchema.safeParse({
      ...req(), values: Object.fromEntries(Array.from({ length: 60 },
        (_, i) => ["key" + i, i])),
    }).success).toBe(false);
  });
});

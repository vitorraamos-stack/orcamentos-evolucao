import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  emptyCommercialBriefing,
  emptyCommercialBriefingItem,
  type CommercialBriefingDraft,
} from "./commercialBriefingDomain";
import { buildCommercialSummary, sameCommercialDraft } from "./commercialBriefingPresentation";
import { DELIVERY_DEADLINE_PRESET_CONFIG } from "@/features/hubos/deliveryDeadlineConfig";

const complete = (): CommercialBriefingDraft => ({
  ...emptyCommercialBriefing(),
  clientName: "Cliente fictício",
  saleNumber: "VENDA-INTERNA",
  artInstructions: "ORIENTACAO-INTERNA",
  commercialNotes: "Acabamento combinado",
  artDirectionTag: "CRIACAO_ARTE",
  deadlinePreset: "STANDARD_8_12",
  logisticType: "entrega",
  address: "Endereço informado",
  isUrgent: true,
  items: [{
    ...emptyCommercialBriefingItem("00000000-0000-4000-8000-000000000001"),
    name: "Placa",
    quantity: "2",
    width_cm: "1.2",
    height_cm: "0.8",
    measurement_unit: "m",
    description: "Material acordado",
    notes: "NOTA-INTERNA",
  }],
});

describe("commercial briefing presentation", () => {
  it("uses the official deadline and preserves entered measurements", () => {
    const summary = buildCommercialSummary(complete());
    expect(summary).toContain(DELIVERY_DEADLINE_PRESET_CONFIG.STANDARD_8_12.label);
    expect(summary).toContain("Largura: 1,2 m");
    expect(summary).toContain("Altura: 0,8 m");
    expect(summary).toContain("Endereço informado");
    expect(summary).toContain("Material acordado");
  });
  it("does not include internal notes, sale identifier or internal priority", () => {
    const summary = buildCommercialSummary(complete());
    for (const text of ["VENDA-INTERNA", "ORIENTACAO-INTERNA", "NOTA-INTERNA", "Urgência"])
      expect(summary).not.toContain(text);
    expect(summary).toContain("Acabamento combinado");
  });
  it("allows summary before sale number or internal artwork instructions", () => {
    expect(buildCommercialSummary({ ...complete(), saleNumber: "", artInstructions: "" })).not.toBeNull();
  });
  it("does not generate a confirmation preview with missing or invalid terms", () => {
    expect(buildCommercialSummary(emptyCommercialBriefing())).toBeNull();
    expect(buildCommercialSummary({ ...complete(), items: [] })).toBeNull();
    expect(buildCommercialSummary({ ...complete(), logisticType: null })).toBeNull();
    expect(buildCommercialSummary({ ...complete(), deadlinePreset: "CUSTOM", deliveryDate: "2026-02-30" })).toBeNull();
  });
  it("shows a custom date in local format without exposing previous delivery address on pickup", () => {
    const summary = buildCommercialSummary({ ...complete(), deadlinePreset: "CUSTOM",
      deliveryDate: "2026-12-30", logisticType: "retirada" });
    expect(summary).toContain("30/12/2026");
    expect(summary).not.toContain("Endereço informado");
  });
  it("treats JSONB key reordering as the same saved draft", () => {
    const draft = complete();
    const reordered = Object.fromEntries(Object.entries(draft).reverse()) as CommercialBriefingDraft;
    expect(sameCommercialDraft(draft, reordered)).toBe(true);
    expect(sameCommercialDraft(draft, { ...draft, clientName: "Outro" })).toBe(false);
    expect(sameCommercialDraft(draft, { ...draft, clientName: "x".repeat(251) })).toBe(false);
  });
});

describe("commercial briefing route boundaries (static)", () => {
  it("uses the existing Hub OS creation permission and keeps the sidebar internal", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const block = app.split('<Route path="/briefing-comercial">')[1].split("</Route>")[0];
    expect(block).toContain('<RequireModule moduleKey="hub_os">');
    expect(block).toContain('<HubOsAccessGuard scope="create">');
    expect(block).toContain("<Layout>");
    expect(block).toContain("<CommercialBriefingPage />");
    const layout = readFileSync("src/components/Layout.tsx", "utf8");
    expect(layout).toContain("canViewCommercialBriefing = canViewHubOs && hubPermissions.canCreateOs");
  });
  it("does not import an OS write path or use browser storage for drafts", () => {
    const page = readFileSync("src/features/commercial-briefing/CommercialBriefingPage.tsx", "utf8");
    const panel = readFileSync("src/features/commercial-briefing/CommercialBriefingPanel.tsx", "utf8");
    const autosave = readFileSync("src/features/commercial-briefing/useCommercialBriefingAutosave.ts", "utf8");
    expect(page).toContain("key={user.id}");
    expect(page).toContain("installOrderDraftNavigationGuard");
    expect(autosave).toContain("expectedRevision: base.revision");
    expect(autosave).toContain('statusRef.current === "conflict"');
    expect(page + panel + autosave).not.toMatch(/localStorage|sessionStorage|hub_os_create_order_secure|useSearch\(/);
  });
});

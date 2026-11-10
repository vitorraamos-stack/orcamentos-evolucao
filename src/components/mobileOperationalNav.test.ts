import { describe, expect, it } from "vitest";
import { getMobileShortcuts, isMobileShortcutActive, type MobileShortcutAccess } from "./mobileOperationalNav";

const none: MobileShortcutAccess = {
  orders: false, art: false, production: false, installations: false,
  deliveries: false, estimator: false, dashboard: false, printing: false,
  library: false, calculator: false, gallery: false, finance: false,
};
const access = (overrides: Partial<MobileShortcutAccess> = {}): MobileShortcutAccess => ({ ...none, ...overrides });

describe("PWA v3 mobile quick navigation", () => {
  it("never renders shortcuts for inaccessible modules", () => {
    expect(getMobileShortcuts(access())).toEqual([]);
    expect(getMobileShortcuts(access({ orders: true, installations: true })).map(item => item.id)).toEqual(["orders", "installations"]);
    expect(getMobileShortcuts(access({ orders: true, estimator: true })).map(item => item.id)).toEqual(["orders", "estimator"]);
  });

  it("caps tabs to four, keeping the full menu for overflow", () => {
    expect(getMobileShortcuts(access({
      orders: true, art: true, production: true, installations: true,
      deliveries: true, estimator: true, dashboard: true
    })).map(item => item.id)).toEqual(["orders", "art", "production", "installations"]);
  });

  it("does not place management-only or unauthorized dashboard in shortcuts", () => {
    expect(getMobileShortcuts(access({ finance: true })).map(item => item.id)).toEqual(["finance"]);
    expect(getMobileShortcuts(access({ orders: true, art: false, dashboard: false })).map(item => item.id)).toEqual(["orders"]);
  });

  it("highlights OS subroutes, production and installation execution", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(isMobileShortcutActive("orders", "/os/" + uuid)).toBe(true);
    expect(isMobileShortcutActive("orders", "/os/novo")).toBe(true);
    expect(isMobileShortcutActive("art", "/os/arte/revisoes")).toBe(true);
    expect(isMobileShortcutActive("production", "/os/producao/impressao")).toBe(true);
    expect(isMobileShortcutActive("installations", "/instalacoes/execucao/" + uuid)).toBe(true);
    expect(isMobileShortcutActive("dashboard", "/hub-os/financeiro")).toBe(false);
    expect(isMobileShortcutActive("orders", "/os/producao")).toBe(false);
  });
});

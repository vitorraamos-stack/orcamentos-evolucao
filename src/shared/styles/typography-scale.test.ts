import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const globalStyles = read("../../index.css");
const shell = read("../../components/evolusystem-shell.css");
const layout = read("../../components/Layout.tsx");
const dashboard = read("../../modules/dashboard/operational-dashboard.css");
const primitives = read("./evolusystem-primitives.css");

describe("EvoluSystem readable typography scale", () => {
  it("increases small and base text without increasing the HTML root and layout spacing", () => {
    expect(globalStyles).toContain("--text-xs: 0.875rem");
    expect(globalStyles).toContain("--text-sm: 1rem");
    expect(globalStyles).toContain("--text-base: 1.125rem");
    expect(globalStyles).toContain("--text-xs--line-height: 1.45");
    expect(globalStyles).toContain("--text-sm--line-height: 1.5");
    expect(globalStyles).toContain("font-size: 18px");
    expect(globalStyles).not.toMatch(/html\s*\{[^}]*font-size:/);
  });

  it("makes the navigation and dashboard labels easier to read without touching module permissions", () => {
    expect(shell).toMatch(/\.evolu-shell__navigation \.evolu-nav__section\s*\{[^}]*font-size:13px/);
    expect(shell).toMatch(/\.evolu-shell__navigation \.evolu-nav__item\s*\{[^}]*font-size:15px/s);
    expect(dashboard).toContain("font-size:13px; font-weight:750");
    expect(dashboard).toContain(".evolu-dashboard__filter { font-size:15px");
    expect(dashboard).toContain(".evolu-dashboard__panel h2 { color:#1a2f4a; font-size:17px");
    expect(primitives).toMatch(/\.evolu-ui-filter-control\s*\{[^}]*font-size: 15px/s);
    expect(layout).toContain("getOperationalNavState(location)");
    expect(layout).toContain('hasModuleAccess("hub_os")');
  });

  it("preserves the physical-size printing labels", () => {
    expect(globalStyles).toContain("size: 50mm 30mm");
    expect(globalStyles).toContain("font-size: 9px");
    expect(globalStyles).toContain("#print-label-area");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./DeliveriesPage.tsx", import.meta.url),
  "utf8"
);

describe("Hotfix 4.2b deliveries page", () => {
  it("shows the waiting counter", () => {
    expect(source).toContain("{waiting.length + legacy.length}");
  });

  it("shows the active pickup counter", () => {
    expect(source).toContain("{activePickups.length}");
  });

  it("shows the active delivery counter", () => {
    expect(source).toContain("{activeDeliveries.length}");
  });

  it("shows the combined completed counter", () => {
    expect(source).toContain(
      "{completedDeliveries.length + completedPickups.length}"
    );
  });

  it("excludes completed pickups from the pickup tab", () => {
    expect(source).toContain(
      "const activePickups = pickups.filter(o => !flowFor(o)?.retirado_at)"
    );
    expect(source).toContain("{activePickups.map(o => {");
  });

  it("includes completed pickups in the completed tab", () => {
    expect(source).toMatch(
      /const completedPickups = pickups\.filter\(o =>\s*Boolean\(flowFor\(o\)\?\.retirado_at\)\s*\)/
    );
    expect(source).toContain("{completedPickups.map(o => (");
  });

  it("disables the pickup button and displays progress while processing", () => {
    expect(source).toContain("disabled={pickupBusyId === o.id}");
    expect(source).toContain('? "Concluindo..."');
  });

  it("reports pickup failures to the user", () => {
    expect(source).toMatch(/catch \(cause\) \{\s*toast\.error\(/);
    expect(source).toContain('"Não foi possível concluir a retirada."');
  });

  it("reports successful pickup completion", () => {
    expect(source).toContain(
      'toast.success("Retirada concluída e OS finalizada.")'
    );
  });

  it("guards the request before awaiting to prevent duplicate posts", () => {
    const guard = source.indexOf("if (pickupBusyRef.current) return;");
    const lock = source.indexOf("pickupBusyRef.current = o.id;");
    const request = source.indexOf("await markOrderFlowRetiradoAndFinalize(");

    expect(guard).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(guard);
    expect(request).toBeGreaterThan(lock);
  });
});

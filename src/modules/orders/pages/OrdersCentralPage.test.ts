import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./OrdersCentralPage.tsx", import.meta.url),
  "utf8"
);

describe("OrdersCentralPage dedicated creation entry", () => {
  it("shows a permission-protected button that preserves the central as origin", () => {
    expect(source).toContain("hubPermissions.canCreateOs &&");
    expect(source).toContain("+ Nova OS");
    expect(source).toContain('setLocation(createOrderPath("/os"))');
  });

  it("does not open a creation dialog or navigate to a newly-created detail", () => {
    expect(source).not.toContain("CreateOSDialog");
    expect(source).not.toContain("`/os/${order.id}`");
  });
});

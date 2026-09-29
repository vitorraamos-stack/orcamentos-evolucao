import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./OrdersCentralPage.tsx", import.meta.url),
  "utf8"
);

describe("OrdersCentralPage canonical creation entry", () => {
  it("shows the canonical dialog only with create permission", () => {
    expect(source).toContain("hubPermissions.canCreateOs &&");
    expect(source).toContain("<CreateOSDialog");
    expect(source).toContain('triggerLabel="+ Nova OS"');
  });

  it("opens a newly-created canonical order", () => {
    expect(source).toContain(
      "onCreated={order => setLocation(`/os/${order.id}`)}"
    );
  });
});

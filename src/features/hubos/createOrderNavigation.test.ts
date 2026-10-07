import { describe, expect, it } from "vitest";
import {
  createOrderFromQuotePath,
  createOrderPath,
  resolveOrderCreationReturnPath,
} from "./createOrderNavigation";

describe("order creation navigation", () => {
  it("keeps internal return paths across a query-string round trip", () => {
    const path = createOrderPath("/os/arte?status=entrada");
    expect(path).toBe("/os/novo?returnTo=%2Fos%2Farte%3Fstatus%3Dentrada");
    expect(
      resolveOrderCreationReturnPath(
        new URLSearchParams(path.split("?")[1]).get("returnTo")
      )
    ).toBe("/os/arte?status=entrada");
  });

  it("builds a Quote → OS creation path with a safe return destination", () => {
    const path = createOrderFromQuotePath(
      "00000000-0000-4000-8000-000000000001",
      "/orcamentista?quote=00000000-0000-4000-8000-000000000001"
    );
    const params = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/os/novo?")).toBe(true);
    expect(params.get("quote")).toBe(
      "00000000-0000-4000-8000-000000000001"
    );
    expect(params.get("returnTo")).toBe(
      "/orcamentista?quote=00000000-0000-4000-8000-000000000001"
    );
  });

  it.each([
    undefined,
    null,
    "",
    "https://example.com/steal",
    "//example.com/steal",
    "/\\example.com/steal",
    "javascript:alert(1)",
  ])("falls back to /os for unsafe destination %s", value => {
    expect(resolveOrderCreationReturnPath(value)).toBe("/os");
  });
});

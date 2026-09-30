import { describe, expect, it } from "vitest";
import {
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

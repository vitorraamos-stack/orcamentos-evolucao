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


});

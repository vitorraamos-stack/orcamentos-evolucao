import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./OrderTable.tsx", import.meta.url),
  "utf8"
);

describe("OrderTable responsive sizing", () => {
  it("uses a minimum width fallback below wide desktop", () => {
    expect(source).toContain("min-w-[1040px]");
    expect(source).toContain("overflow-x-auto");
  });

  it("releases the minimum width on 2xl screens", () => {
    expect(source).toContain("2xl:min-w-0");
  });

  it("reserves eight percent for the two action buttons", () => {
    expect(source).toContain('<col className="w-[8%]" />');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("BoardColumn variants", () => {
  it("preserva default e isola visual moderno", () => {
    const source = readFileSync("src/shared/kanban/BoardColumn.tsx", "utf8");
    expect(source).toContain('variant = "default"');
    expect(source).toContain('variant === "art-modern"');
    expect(source).toContain("md:max-h-[calc(100vh-360px)]");
  });
});
